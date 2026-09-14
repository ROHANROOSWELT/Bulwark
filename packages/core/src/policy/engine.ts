/**
 * Bulwark Policy Engine (Pure Functions).
 * Enforces all safety invariants, allowlists, state-bound invalidations, and adaptive band resolutions.
 * Zero external dependencies.
 */

import { createHash } from "node:crypto";
import { RescueGrantV2, AdaptiveBand, canonicalizeJson } from "../grants/grant.js";
import { PositionSnapshot } from "../aave/reader.js";
import { BulwarkPolicyConfig, PolicyValidationResult, ExecutionIntent } from "./types.js";
import { CHAINS } from "../chains.js";

export function isValidAddress(address: string): boolean {
  return typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address);
}

export function computePolicyHash(policy: BulwarkPolicyConfig): string {
  const canonical = canonicalizeJson(policy);
  return "0x" + createHash("sha256").update(canonical).digest("hex");
}

export function getDefaultPolicyConfig(maxUsdPerAction = 25, hfCritical = 1.2, hfTarget = 2.0): BulwarkPolicyConfig {
  const allowedDebtAssets: Record<number, string[]> = {};
  for (const [chainIdStr, chain] of Object.entries(CHAINS)) {
    const cid = parseInt(chainIdStr, 10);
    allowedDebtAssets[cid] = Object.values(chain.knownTokens).map((t) => t.address.toLowerCase());
  }

  return {
    policyId: "bulwark_default_v2",
    maxUsdPerAction,
    hfCritical,
    hfTarget,
    allowedChains: [11155111, 8453, 1],
    allowedActions: ["repay", "add-collateral"],
    allowedDebtAssets,
  };
}

/**
 * Resolves the appropriate adaptive capital band for a live Health Factor.
 */
export function resolveAdaptiveBand(liveHf: number, bands: AdaptiveBand[]): AdaptiveBand | undefined {
  if (!bands || bands.length === 0) return undefined;

  // Find exact band match: hfMin <= liveHf < hfExcl
  for (const band of bands) {
    if (liveHf >= band.hfMin && liveHf < band.hfExcl) {
      return band;
    }
  }

  // If liveHf < lowest band min, use the band with the lowest hfMin (most critical emergency)
  const sorted = [...bands].sort((a, b) => a.hfMin - b.hfMin);
  const lowest = sorted[0];
  if (lowest && liveHf < lowest.hfMin) {
    return lowest;
  }

  // If liveHf >= highest band hfExcl, position is in safer territory
  const highest = sorted[sorted.length - 1];
  if (highest && liveHf >= highest.hfExcl) {
    return highest;
  }

  return undefined;
}

/**
 * Comprehensive evaluation of grant invariants and live position state.
 */
export function evaluatePolicy(
  policy: BulwarkPolicyConfig,
  grant: RescueGrantV2,
  snapshot: PositionSnapshot,
  availableCapacityUsd: number,
  now = new Date()
): PolicyValidationResult {
  const reasons: string[] = [];

  // 1. Status Check: Only ARMED grants can execute!
  if (grant.state.status !== "armed") {
    reasons.push(
      `Grant not armed: current status is "${grant.state.status}". (Rule: a grant in "proposed" or non-armed state NEVER executes).`
    );
  }

  // 2. Expiration Check
  const expiresAtMs = Date.parse(grant.conditions.expiresAt);
  if (isNaN(expiresAtMs) || now.getTime() >= expiresAtMs) {
    reasons.push(`Grant expired at ${grant.conditions.expiresAt} (current time: ${now.toISOString()}).`);
  }

  // 3. Chain & Address Checks
  if (!policy.allowedChains.includes(grant.position.chainId)) {
    reasons.push(`Chain ID ${grant.position.chainId} not in policy allowlist.`);
  }

  if (!isValidAddress(grant.position.positionOwner)) {
    reasons.push(`Invalid position owner address format: "${grant.position.positionOwner}".`);
  }

  if (!isValidAddress(grant.position.debtAsset)) {
    reasons.push(`Invalid debt asset address format: "${grant.position.debtAsset}".`);
  }

  const allowedAssets = policy.allowedDebtAssets[grant.position.chainId] ?? [];
  if (!allowedAssets.includes(grant.position.debtAsset.toLowerCase())) {
    reasons.push(`Debt asset "${grant.position.debtAsset}" not allowlisted on chain ${grant.position.chainId}.`);
  }

  // 4. Duplicate / Replay Prevention
  if (["submitted", "mined", "verified", "settled"].includes(grant.state.status)) {
    reasons.push(`Duplicate execution refusal: grant already reached terminal or pending status "${grant.state.status}".`);
  }

  // 5. HF Floor Check: Suspend auto-rescue if position breached floor
  if (snapshot.healthFactor <= grant.authority.hfFloor) {
    reasons.push(
      `HF Floor breached: live HF ${snapshot.healthFactor.toFixed(3)} <= floor ${grant.authority.hfFloor.toFixed(3)}. Auto-rescue suspended for human escalation.`
    );
  }

  // 6. Trigger condition: Live HF must be below hfTriggerBelow
  if (snapshot.healthFactor >= grant.conditions.hfTriggerBelow) {
    reasons.push(
      `Trigger condition not met: live HF ${snapshot.healthFactor.toFixed(3)} >= trigger threshold ${grant.conditions.hfTriggerBelow.toFixed(3)}.`
    );
  }

  // 7. Invalidation Matrix
  // - Recovered check
  if (snapshot.healthFactor >= grant.conditions.recoveryHf) {
    reasons.push(
      `INVALIDATED: position recovered (live HF ${snapshot.healthFactor.toFixed(3)} >= recovery target ${grant.conditions.recoveryHf.toFixed(3)}).`
    );
  }

  // - Debt drift check
  const creationDebt = grant.state.creationSnapshot.debtUsd;
  if (creationDebt > 0) {
    const debtDiffPct = Math.abs(snapshot.totalDebtUsd - creationDebt) / creationDebt;
    if (debtDiffPct > grant.conditions.maxDebtChangePct) {
      reasons.push(
        `INVALIDATED: debt drift ${(debtDiffPct * 100).toFixed(1)}% exceeds allowed maxDebtChangePct ${(grant.conditions.maxDebtChangePct * 100).toFixed(1)}%.`
      );
    }
  }

  // - Price band check
  const creationPrice = grant.state.creationSnapshot.priceUsd;
  if (creationPrice > 0) {
    const priceDiffPct = Math.abs(snapshot.assetPriceUsd - creationPrice) / creationPrice;
    if (priceDiffPct > grant.conditions.priceBandPct) {
      reasons.push(
        `INVALIDATED: asset price drift ${(priceDiffPct * 100).toFixed(1)}% exceeds allowed priceBandPct ${(grant.conditions.priceBandPct * 100).toFixed(1)}%.`
      );
    }
  }

  // 8. Resolve Adaptive Band
  const resolvedBand = resolveAdaptiveBand(snapshot.healthFactor, grant.authority.adaptiveBands);
  const bandCap = resolvedBand ? resolvedBand.maxCapitalUsd : grant.authority.perActionCapUsd;

  // 9. Effective Cap Calculation
  const remainingLifetimeCap = Math.max(0, grant.authority.capitalCapUsd - grant.state.totalSpentUsd);
  const remainingDailyCap = Math.max(0, grant.authority.dailyCapUsd - grant.state.dailySpentUsd);

  const effectiveCapUsd = Math.max(
    0,
    Math.min(
      policy.maxUsdPerAction,
      remainingLifetimeCap,
      grant.authority.perActionCapUsd,
      remainingDailyCap,
      bandCap,
      availableCapacityUsd
    )
  );

  if (effectiveCapUsd <= 0) {
    reasons.push(`Effective rescue capacity is $0.00 (available desk capacity: $${availableCapacityUsd.toFixed(2)}).`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    resolvedBand,
    effectiveCapUsd,
  };
}
