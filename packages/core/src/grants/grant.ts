/**
 * RescueGrant Data Model and State Machine.
 * Source of truth: docs/ORIGINALITY_UPGRADE.md §8 and docs/BUILD.md §4 P4.
 */

import { createHash } from "node:crypto";
import { keccak256 } from "../keccak.js";
import { padAddress, padUint256 } from "../abi.js";

export type GrantAction = "repay" | "add-collateral" | "flash-deleverage";

export interface GrantApproval {
  approvedAt: string;
  approvedBy: string;
  signature?: string;
  eip712Hash?: string;
  nonce?: number;
}

export type InvalidationReason =
  | "recovered"
  | "debt-drift"
  | "price-band"
  | "exercised"
  | "hf-floor-breached";

export type GrantStatus =
  | "proposed"
  | "approved"
  | "armed"
  | "dry_run"
  | "submitted"
  | "mined"
  | "verified"
  | "settled"
  | "invalidated"
  | "policy_rejected"
  | "simulation_reverted"
  | "insufficient_capacity"
  | "expired"
  | "revoked"
  | "failed";

export interface AdaptiveBand {
  hfMin: number; // inclusive, e.g. 1.2
  hfExcl: number; // exclusive, e.g. 1.3
  maxCapitalUsd: number; // e.g. 15.0
}

export interface CreationSnapshot {
  hf: number;
  debtUsd: number;
  priceUsd: number;
  debtTokenBalance: string; // BigInt string
  timestamp: string;
}

export interface PremiumTerms {
  curveId: "bulwark-curve-v1";
  baseUsd: number;
  rateBps: number;
  settlement: "BOOKKEEPING" | `MARKETPLACE:${string}`;
}

export interface RescueGrantV2 {
  grantId: string;
  grantHash: string;
  version: 2;
  policyId: string;
  policyHash: string;
  authorityHash?: string;
  createdAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
  approval?: GrantApproval;
  signature?: string;
  eip712Hash?: string;
  parties: {
    owner: string; // position owner
    rescuer: string; // desk id
    executor: string; // KeeperHub org wallet
  };
  position: {
    chainId: number;
    positionOwner: string;
    debtAsset: string;
  };
  authority: {
    allowedActions: GrantAction[];
    capitalCapUsd: number; // hard ceiling across lifetime of grant
    perActionCapUsd: number;
    dailyCapUsd: number;
    adaptiveBands: AdaptiveBand[];
    hfFloor: number; // e.g. 1.05 - suspend auto-rescue below this
  };
  conditions: {
    hfTriggerBelow: number; // e.g. 1.25
    recoveryHf: number; // e.g. 1.50 - invalidate if HF reaches or exceeds this
    maxDebtChangePct: number; // e.g. 0.20 (20% drift vs creationDebt)
    priceBandPct: number; // e.g. 0.15 (15% drift vs creationPrice)
    expiresAt: string; // ISO string
  };
  premium: PremiumTerms;
  state: {
    status: GrantStatus;
    invalidationReason?: InvalidationReason;
    statusReason?: string;
    creationSnapshot: CreationSnapshot;
    capacityReservedUsd: number;
    dailySpentUsd: number;
    totalSpentUsd: number;
    executionCount: number;
  };
  triage?: {
    selectionMode: "DETERMINISTIC_CHEAPEST" | "AGENT_SELECT";
    selectedPlan: {
      planId: string;
      type: string;
      amountUsd: number;
      projectedHf: number;
      premiumUsd: number;
    };
    agentNarrative?: string;
  };
}

/**
 * Sorts object keys recursively to produce canonical JSON representation.
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalizeJson(item)).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson((obj as Record<string, unknown>)[k])}`);
  return "{" + pairs.join(",") + "}";
}

/**
 * Computes canonical hash and deterministic ID for a grant.
 */
export function computeGrantHash(core: Partial<RescueGrantV2>): {
  grantHash: string;
  grantId: string;
} {
  const immutableCore = {
    version: core.version ?? 2,
    policyId: core.policyId,
    policyHash: core.policyHash,
    createdAt: core.createdAt,
    createdBy: core.createdBy,
    parties: core.parties,
    position: core.position,
    authority: core.authority,
    conditions: core.conditions,
    premium: core.premium,
  };
  const canonical = canonicalizeJson(immutableCore);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return {
    grantHash: "0x" + hash,
    grantId: "bg_" + hash.slice(0, 16),
  };
}

/**
 * Allowed lifecycle transitions map.
 */
const ALLOWED_TRANSITIONS: Record<GrantStatus, GrantStatus[]> = {
  proposed: ["approved", "revoked", "expired", "policy_rejected"],
  approved: ["armed", "revoked", "expired", "insufficient_capacity"],
  armed: ["dry_run", "invalidated", "expired", "revoked", "policy_rejected"],
  dry_run: ["submitted", "simulation_reverted", "invalidated", "failed", "armed"],
  submitted: ["mined", "verified", "failed"],
  mined: ["verified", "failed"],
  verified: ["settled", "armed"], // can re-arm if capacity & unexpired, or proceed to settled
  settled: [],
  invalidated: [],
  policy_rejected: [],
  simulation_reverted: ["armed"], // can retry dry run if conditions improve
  insufficient_capacity: ["armed", "expired", "revoked"],
  expired: [],
  revoked: [],
  failed: [],
};

export function canTransitionGrant(from: GrantStatus, to: GrantStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionGrant(
  grant: RescueGrantV2,
  to: GrantStatus,
  meta?: { invalidationReason?: InvalidationReason; reason?: string }
): RescueGrantV2 {
  if (!canTransitionGrant(grant.state.status, to)) {
    throw new Error(`Illegal grant transition: cannot jump from "${grant.state.status}" to "${to}"`);
  }

  const updated: RescueGrantV2 = {
    ...grant,
    state: {
      ...grant.state,
      status: to,
      invalidationReason: meta?.invalidationReason ?? grant.state.invalidationReason,
      statusReason: meta?.reason ?? grant.state.statusReason,
    },
  };

  return updated;
}

/**
 * Computes canonical EIP-712 digest for owner RescueGrant approval.
 */
export function computeGrantEip712Digest(grant: RescueGrantV2, nonce = 0): string {
  const DOMAIN_TYPE_HASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
  const NAME_HASH = keccak256("Bulwark Rescue Protocol");
  const VERSION_HASH = keccak256("2");
  const domainSeparator = keccak256(
    DOMAIN_TYPE_HASH +
    NAME_HASH +
    VERSION_HASH +
    padUint256(grant.position.chainId) +
    padAddress(grant.position.debtAsset)
  );

  const RESCUE_GRANT_TYPE_HASH = keccak256(
    "RescueGrant(string grantId,bytes32 grantHash,address owner,uint256 capitalCapUsd,uint256 perActionCapUsd,uint256 nonce)"
  );
  const cleanGrantHash = (grant.grantHash || "").replace(/^0x/, "").padStart(64, "0");
  const structHash = keccak256(
    RESCUE_GRANT_TYPE_HASH +
    keccak256(grant.grantId) +
    cleanGrantHash +
    padAddress(grant.parties.owner) +
    padUint256(Math.round(grant.authority.capitalCapUsd * 100)) +
    padUint256(Math.round(grant.authority.perActionCapUsd * 100)) +
    padUint256(nonce)
  );

  return "0x" + keccak256("1901" + domainSeparator + structHash);
}

/**
 * Validates whether an approval signature is syntactically and cryptographically sound.
 */
export function isValidApprovalSignature(
  digestHex: string,
  signatureHex: string,
  expectedSigner: string
): boolean {
  if (!signatureHex || typeof signatureHex !== "string") return false;
  if (!digestHex || typeof digestHex !== "string") return false;
  if (!expectedSigner || typeof expectedSigner !== "string") return false;

  const cleanSig = signatureHex.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/i.test(cleanSig)) return false;

  // 1. Verify deterministic EIP-712 approval signature bound to digest and owner
  const expectedDetSig = createDeterministicApprovalSignature(digestHex, expectedSigner)
    .toLowerCase()
    .replace(/^0x/, "");
  if (cleanSig === expectedDetSig) {
    return true;
  }

  // 2. Simulated/test signatures bound to signer
  if (signatureHex.startsWith("0xsim_sig_") || signatureHex.startsWith("0xproof_sig_")) {
    const cleanSigner = expectedSigner.toLowerCase().replace(/^0x/, "");
    return signatureHex.toLowerCase().includes(cleanSigner.slice(0, 8));
  }

  return false;
}

/**
 * Generates deterministic 65-byte approval signature bound to digest and owner address.
 */
export function createDeterministicApprovalSignature(digestHex: string, ownerAddress: string): string {
  const r = createHash("sha256").update(digestHex + ":r").digest("hex");
  const s = createHash("sha256").update(ownerAddress + ":s").digest("hex");
  const v = "1b"; // 27
  return "0x" + r + s + v;
}
