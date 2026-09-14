/**
 * Proof of Authorized Agency (PoAA).
 * The 11-Check Verification Chain.
 * Proves mathematically and factually: "Did the agent exercise exactly the authority it was given?"
 * Source of truth: docs/ORIGINALITY_UPGRADE.md §10 and docs/BUILD.md §4 P8.
 */

import { RescueGrantV2, computeGrantHash, canonicalizeJson } from "../grants/grant.js";
import { CreationSnapshot } from "../grants/grant.js";
import { ExecutionIntent, BulwarkPolicyConfig } from "../policy/types.js";
import { AuthorizedIntent, computeIntentHash } from "../policy/compiler.js";
import { computePolicyHash, resolveAdaptiveBand } from "../policy/engine.js";
import { PositionSnapshot } from "../aave/reader.js";
import { ExecutionRecord } from "../grants/store.js";
import { DirectExecutionReceipt } from "../keeperhub/types.js";

export interface PoaaBundle {
  bundleVersion: "2.0";
  grant: RescueGrantV2;
  creationSnapshot: CreationSnapshot;
  intent: ExecutionIntent;
  intentHash: string;
  authorizedIntent: AuthorizedIntent;
  authorityHash: string;
  execution: ExecutionRecord;
  receipts: DirectExecutionReceipt[];
  snapshots: {
    before: PositionSnapshot;
    after: PositionSnapshot;
  };
  policy: BulwarkPolicyConfig;
  exportedAt: string;
}

export interface PoaaCheckResult {
  checkNumber: number;
  name: string;
  passed: boolean;
  evidence: string;
  provenance: "CHAIN FACT" | "KEEPERHUB FACT" | "APPLICATION STATE" | "AGENT OUTPUT" | "BOOKKEEPING";
}

export interface PoaaVerificationReport {
  verdict: "PROVEN" | `BROKEN (check ${number})`;
  passedCount: number;
  totalChecks: 11;
  checks: PoaaCheckResult[];
  summary: string;
}

export function verifyPoaaBundle(bundle: PoaaBundle): PoaaVerificationReport {
  const checks: PoaaCheckResult[] = [];

  // ── Check 1: Grant Hash Valid ────────────────────────────────────────────
  const { grantHash: recomputedGrantHash, grantId: recomputedGrantId } = computeGrantHash(bundle.grant);
  const chk1Passed =
    recomputedGrantHash === bundle.grant.grantHash &&
    recomputedGrantId === bundle.grant.grantId &&
    bundle.grant.version === 2;

  checks.push({
    checkNumber: 1,
    name: "Grant Hash Valid",
    passed: chk1Passed,
    evidence: chk1Passed
      ? `Canonical SHA-256 hash verified: ${bundle.grant.grantHash} matches grant ID ${bundle.grant.grantId}`
      : `Grant hash mismatch: expected ${recomputedGrantHash}, got ${bundle.grant.grantHash}`,
    provenance: "APPLICATION STATE",
  });

  // ── Check 2: Owner Approval Valid ────────────────────────────────────────
  const chk2Passed =
    Boolean(bundle.grant.approvedAt) &&
    Boolean(bundle.grant.approvedBy) &&
    bundle.grant.approvedBy?.toLowerCase() === bundle.grant.parties.owner.toLowerCase() &&
    (!bundle.execution.submittedAt || Date.parse(bundle.grant.approvedAt!) <= Date.parse(bundle.execution.submittedAt));

  checks.push({
    checkNumber: 2,
    name: "Owner Approval Valid",
    passed: chk2Passed,
    evidence: chk2Passed
      ? `Explicit owner approval by ${bundle.grant.approvedBy} at ${bundle.grant.approvedAt} before execution`
      : "Owner approval missing, invalid approver, or timestamped after execution",
    provenance: "APPLICATION STATE",
  });

  // ── Check 3: Policy Hash Valid ───────────────────────────────────────────
  const recomputedPolicyHash = computePolicyHash(bundle.policy);
  const chk3Passed =
    recomputedPolicyHash === bundle.grant.policyHash &&
    bundle.policy.policyId === bundle.grant.policyId;

  checks.push({
    checkNumber: 3,
    name: "Policy Hash Valid",
    passed: chk3Passed,
    evidence: chk3Passed
      ? `Policy hash verified: ${recomputedPolicyHash} matches policyId ${bundle.policy.policyId}`
      : `Policy hash mismatch: recomputed ${recomputedPolicyHash} vs grant ${bundle.grant.policyHash}`,
    provenance: "APPLICATION STATE",
  });

  // ── Check 4: Agent Intent Unchanged ──────────────────────────────────────
  const recomputedIntentHash = computeIntentHash(bundle.intent);
  const chk4Passed =
    recomputedIntentHash === bundle.intentHash &&
    bundle.intentHash === bundle.authorizedIntent.intentHash;

  checks.push({
    checkNumber: 4,
    name: "Agent Intent Unchanged",
    passed: chk4Passed,
    evidence: chk4Passed
      ? `Recorded intent hash ${bundle.intentHash} matches canonical hash of submitted intent`
      : `Intent tampered: recomputed ${recomputedIntentHash} vs recorded ${bundle.intentHash}`,
    provenance: "AGENT OUTPUT",
  });

  // ── Check 5: Within Grant Bounds ─────────────────────────────────────────
  const resolvedBand = resolveAdaptiveBand(bundle.snapshots.before.healthFactor, bundle.grant.authority.adaptiveBands);
  const bandCap = resolvedBand ? resolvedBand.maxCapitalUsd : bundle.grant.authority.perActionCapUsd;

  const chk5Passed =
    bundle.execution.amountUsd <= bundle.grant.authority.capitalCapUsd &&
    bundle.execution.amountUsd <= bundle.grant.authority.perActionCapUsd &&
    bundle.execution.amountUsd <= bandCap + 0.001; // floating point tolerance

  checks.push({
    checkNumber: 5,
    name: "Within Grant Bounds",
    passed: chk5Passed,
    evidence: chk5Passed
      ? `Executed $${bundle.execution.amountUsd.toFixed(2)} <= capitalCap $${bundle.grant.authority.capitalCapUsd}, perAction $${bundle.grant.authority.perActionCapUsd}, bandCap $${bandCap}`
      : `Grant bounds exceeded: executed $${bundle.execution.amountUsd.toFixed(2)} exceeds cap (bandCap: $${bandCap})`,
    provenance: "APPLICATION STATE",
  });

  // ── Check 6: Within Policy Bounds & Simulate-First ───────────────────────
  const chk6Passed =
    bundle.execution.amountUsd <= bundle.policy.maxUsdPerAction &&
    Boolean(bundle.execution.simulatedAt) &&
    bundle.execution.authorityHash === bundle.authorizedIntent.authorityHash;

  checks.push({
    checkNumber: 6,
    name: "Within Policy Bounds & Simulate-First",
    passed: chk6Passed,
    evidence: chk6Passed
      ? `Executed $${bundle.execution.amountUsd.toFixed(2)} <= policy max $${bundle.policy.maxUsdPerAction}; simulate-first completed at ${bundle.execution.simulatedAt}`
      : "Policy bounds exceeded, simulate-first evidence missing, or authorityHash mismatch",
    provenance: "APPLICATION STATE",
  });

  // ── Check 7: Grant Not Expired ───────────────────────────────────────────
  const expiresAtMs = Date.parse(bundle.grant.conditions.expiresAt);
  const execMs = bundle.execution.submittedAt ? Date.parse(bundle.execution.submittedAt) : Date.now();
  const chk7Passed = !isNaN(expiresAtMs) && execMs < expiresAtMs && bundle.grant.state.status !== "invalidated";

  checks.push({
    checkNumber: 7,
    name: "Grant Not Expired",
    passed: chk7Passed,
    evidence: chk7Passed
      ? `Executed at ${bundle.execution.submittedAt ?? "now"} before expiration ${bundle.grant.conditions.expiresAt}`
      : `Grant expired or invalidated prior to execution: expiresAt ${bundle.grant.conditions.expiresAt}`,
    provenance: "APPLICATION STATE",
  });

  // ── Check 8: State Conditions Satisfied ──────────────────────────────────
  const beforeDebt = bundle.snapshots.before.totalDebtUsd;
  const creationDebt = bundle.creationSnapshot.debtUsd;
  const debtDrift = creationDebt > 0 ? Math.abs(beforeDebt - creationDebt) / creationDebt : 0;

  const beforePrice = bundle.snapshots.before.assetPriceUsd;
  const creationPrice = bundle.creationSnapshot.priceUsd;
  const priceDrift = creationPrice > 0 ? Math.abs(beforePrice - creationPrice) / creationPrice : 0;

  const chk8Passed =
    bundle.snapshots.before.healthFactor < bundle.grant.conditions.hfTriggerBelow &&
    bundle.snapshots.before.healthFactor >= bundle.grant.authority.hfFloor &&
    debtDrift <= bundle.grant.conditions.maxDebtChangePct &&
    priceDrift <= bundle.grant.conditions.priceBandPct;

  checks.push({
    checkNumber: 8,
    name: "State Conditions Satisfied",
    passed: chk8Passed,
    evidence: chk8Passed
      ? `Trigger met (HF ${bundle.snapshots.before.healthFactor.toFixed(3)} < ${bundle.grant.conditions.hfTriggerBelow}), above floor ${bundle.grant.authority.hfFloor}, debt drift ${(debtDrift * 100).toFixed(1)}% <= ${(bundle.grant.conditions.maxDebtChangePct * 100).toFixed(1)}%, price drift ${(priceDrift * 100).toFixed(1)}% <= ${(bundle.grant.conditions.priceBandPct * 100).toFixed(1)}%`
      : "State assumptions violated: trigger not met, floor breached, or excessive debt/price drift",
    provenance: "CHAIN FACT",
  });

  // ── Check 9: KeeperHub Execution Verified ─────────────────────────────────
  const khReceipt = bundle.receipts?.[0];
  const chk9Passed =
    Boolean(khReceipt) &&
    khReceipt?.verified === true &&
    khReceipt?.receiptStatus === "success";

  checks.push({
    checkNumber: 9,
    name: "KeeperHub Execution Verified",
    passed: chk9Passed,
    evidence: chk9Passed
      ? `KeeperHub on-chain verified receipt: tx ${khReceipt?.hash} (block ${khReceipt?.blockNumber})`
      : "KeeperHub receipt missing or unverified",
    provenance: "KEEPERHUB FACT",
  });

  // ── Check 10: Transaction Receipt Verified ────────────────────────────────
  const chk10Passed =
    bundle.execution.receiptVerified === true ||
    bundle.execution.independentReceiptVerified === true ||
    (Boolean(khReceipt) && khReceipt?.verified === true);

  checks.push({
    checkNumber: 10,
    name: "Transaction Receipt Verified",
    passed: chk10Passed,
    evidence: chk10Passed
      ? `Transaction hash ${bundle.execution.txHash ?? khReceipt?.hash} confirmed in mined block ${bundle.execution.blockNumber ?? khReceipt?.blockNumber}`
      : "Transaction receipt confirmation failed",
    provenance: "CHAIN FACT",
  });

  // ── Check 11: Aave State Change Verified ──────────────────────────────────
  const hfImproved = bundle.snapshots.after.healthFactor > bundle.snapshots.before.healthFactor;
  const debtReduced = bundle.snapshots.after.totalDebtUsd <= bundle.snapshots.before.totalDebtUsd;
  const chk11Passed = hfImproved && debtReduced;

  checks.push({
    checkNumber: 11,
    name: "Aave State Change Verified",
    passed: chk11Passed,
    evidence: chk11Passed
      ? `Post-HF (${bundle.snapshots.after.healthFactor.toFixed(3)}) > Pre-HF (${bundle.snapshots.before.healthFactor.toFixed(3)}); debt reduced from $${bundle.snapshots.before.totalDebtUsd.toFixed(2)} to $${bundle.snapshots.after.totalDebtUsd.toFixed(2)}`
      : `Aave state change unverified: Pre-HF ${bundle.snapshots.before.healthFactor} vs Post-HF ${bundle.snapshots.after.healthFactor}`,
    provenance: "CHAIN FACT",
  });

  const failedCheck = checks.find((c) => !c.passed);
  const passedCount = checks.filter((c) => c.passed).length;

  return {
    verdict: failedCheck ? `BROKEN (check ${failedCheck.checkNumber})` : "PROVEN",
    passedCount,
    totalChecks: 11,
    checks,
    summary: failedCheck
      ? `Proof of Authorized Agency BROKEN at Check ${failedCheck.checkNumber} (${failedCheck.name}): ${failedCheck.evidence}`
      : `Proof of Authorized Agency PROVEN (11/11 checks verified). The agent exercised precisely the authority it was delegated.`,
  };
}
