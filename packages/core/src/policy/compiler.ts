/**
 * Bulwark Policy Compiler.
 * Deterministically compiles an Agent Intent into an Authorized Intent.
 * HARD RULE: CLAMP-ONLY — Raising limits is structurally impossible.
 * Source of truth: docs/ORIGINALITY_UPGRADE.md §9 and docs/BUILD.md §4 P7.
 */

import { createHash } from "node:crypto";
import { RescueGrantV2, canonicalizeJson } from "../grants/grant.js";
import { PositionSnapshot } from "../aave/reader.js";
import { BulwarkPolicyConfig, ExecutionIntent } from "./types.js";
import { evaluatePolicy, computePolicyHash, resolveAdaptiveBand } from "./engine.js";

export const UINT256_MAX = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

export interface AuthorizedIntent {
  grantId: string;
  authorityHash: string;
  intentHash: string;
  action: "repay" | "add-collateral" | "flash-deleverage";
  asset: string;
  authorizedAmountUsd: number;
  amountWei: string;
  repayMax: boolean;
  validUntil: string;
  checks: string[];
}

export function computeIntentHash(intent: ExecutionIntent): string {
  const canonical = canonicalizeJson(intent);
  return "0x" + createHash("sha256").update(canonical).digest("hex");
}

export function compilePolicyIntent(
  intent: ExecutionIntent,
  grant: RescueGrantV2,
  snapshot: PositionSnapshot,
  policy: BulwarkPolicyConfig,
  availableCapacityUsd: number,
  now = new Date()
): AuthorizedIntent {
  const checks: string[] = [];

  // 1. Record immutable Intent Hash BEFORE any modification
  const intentHash = computeIntentHash(intent);
  checks.push(`intent_hash_recorded:${intentHash}`);

  // 2. Allowlist Gates (Violation => REJECT, NEVER clamp)
  if (intent.chainId !== grant.position.chainId) {
    throw new Error(
      `POLICY COMPILER REJECT: Chain mismatch (intent chain ${intent.chainId} != grant chain ${grant.position.chainId})`
    );
  }

  if (intent.positionOwner.toLowerCase() !== grant.position.positionOwner.toLowerCase()) {
    throw new Error(
      `POLICY COMPILER REJECT: Owner mismatch (intent owner ${intent.positionOwner} != grant owner ${grant.position.positionOwner})`
    );
  }

  if (intent.asset.toLowerCase() !== grant.position.debtAsset.toLowerCase()) {
    throw new Error(
      `POLICY COMPILER REJECT: Asset mismatch (intent asset ${intent.asset} != grant debtAsset ${grant.position.debtAsset})`
    );
  }

  if (!grant.authority.allowedActions.includes(intent.action)) {
    throw new Error(
      `POLICY COMPILER REJECT: Action "${intent.action}" not allowed by grant authority`
    );
  }

  checks.push("allowlists_verified");

  // 3. Evaluate Policy Engine & Invalidation Matrix
  const evalResult = evaluatePolicy(policy, grant, snapshot, availableCapacityUsd, now);
  if (!evalResult.ok) {
    throw new Error(`POLICY COMPILER REJECT: ${evalResult.reasons.join(" | ")}`);
  }
  checks.push("policy_and_invalidation_checks_passed");

  // 4. Resolve Adaptive Band from live HF
  const resolvedBand = resolveAdaptiveBand(snapshot.healthFactor, grant.authority.adaptiveBands);
  const bandCap = resolvedBand ? resolvedBand.maxCapitalUsd : grant.authority.perActionCapUsd;
  checks.push(`adaptive_band_resolved:cap_${bandCap}`);

  // 5. Compute Effective Cap
  const remainingLifetimeCap = Math.max(0, grant.authority.capitalCapUsd - grant.state.totalSpentUsd);
  const remainingDailyCap = Math.max(0, grant.authority.dailyCapUsd - grant.state.dailySpentUsd);

  const effectiveCap = Math.min(
    policy.maxUsdPerAction,
    remainingLifetimeCap,
    grant.authority.perActionCapUsd,
    remainingDailyCap,
    bandCap,
    availableCapacityUsd
  );

  // 6. CLAMP-ONLY: authorizedAmount = min(intent.amountUsd, effectiveCap)
  // Raising the limit is mathematically and structurally impossible here.
  const authorizedAmountUsd = Math.min(intent.amountUsd, effectiveCap);
  if (authorizedAmountUsd <= 0) {
    throw new Error(`POLICY COMPILER REJECT: Authorized amount is $0.00 (effectiveCap: $${effectiveCap})`);
  }
  checks.push(`intent_clamped:requested_${intent.amountUsd}_authorized_${authorizedAmountUsd}`);

  // 7. Convert to token wei via live price & decimals
  const priceUsd = snapshot.assetPriceUsd > 0 ? snapshot.assetPriceUsd : 1.0;
  const tokenDecimalUnits = authorizedAmountUsd / priceUsd;
  const standardWei = BigInt(Math.floor(tokenDecimalUnits * 10 ** snapshot.debtDecimals));

  // Repay-max semantics only when authorized amount covers full debt AND stays within effective cap
  let repayMax = false;
  let finalWei = standardWei.toString();
  if (
    intent.action === "repay" &&
    authorizedAmountUsd >= snapshot.totalDebtUsd &&
    snapshot.totalDebtUsd <= effectiveCap
  ) {
    repayMax = true;
    finalWei = UINT256_MAX;
    checks.push("repay_max_enabled");
  } else {
    checks.push(`exact_wei_computed:${finalWei}`);
  }

  // 8. Compute Authority Hash binding Grant + Policy + Compiled Bounds
  const validUntil = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15-minute execution validity window

  const authorityCore = {
    grantId: grant.grantId,
    grantHash: grant.grantHash,
    policyId: policy.policyId,
    policyHash: computePolicyHash(policy),
    intentHash,
    action: intent.action,
    asset: intent.asset.toLowerCase(),
    authorizedAmountUsd: Math.round(authorizedAmountUsd * 100) / 100,
    amountWei: finalWei,
    repayMax,
    validUntil,
  };

  const authorityHash = "0x" + createHash("sha256").update(canonicalizeJson(authorityCore)).digest("hex");
  checks.push(`authority_hash_bound:${authorityHash}`);

  return {
    grantId: grant.grantId,
    authorityHash,
    intentHash,
    action: intent.action,
    asset: intent.asset,
    authorizedAmountUsd: Math.round(authorizedAmountUsd * 100) / 100,
    amountWei: finalWei,
    repayMax,
    validUntil,
    checks,
  };
}
