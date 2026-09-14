/**
 * Bulwark On-Chain Escrow & Real Settlement Engine.
 * Transitions premium tracking from "BOOKKEEPING" to "SETTLED_ESCROW".
 * Provides non-custodial deposit, PoAA-contingent claim, and expiration refund primitives.
 * Source of truth: docs/WINNER.md and docs/ORIGINALITY_UPGRADE.md §13.
 */

import { padAddress, padUint256 } from "../abi.js";
import { functionSelector } from "../keccak.js";

export interface EscrowDeposit {
  depositId: string;
  grantHash: string;
  depositorAddress: string;
  tokenAddress: string;
  amountWei: string;
  amountUsd: number;
  status: "locked" | "settled" | "refunded";
  createdAt: string;
  expiresAt: string;
  settledAt?: string;
  rescuerRecipient?: string;
}

export interface EscrowSettlementRequest {
  grantHash: string;
  authorityHash: string;
  rescuerDesk: string;
  reimbursementWei: string;
  premiumWei: string;
  poaaProofHash: string;
  isPoaaProven: boolean;
}

export interface EscrowSettlementResult {
  ok: boolean;
  status: "settled" | "rejected";
  payoutTotalWei: string;
  reason?: string;
}

// Function selectors for BulwarkEscrow contract
export const ESCROW_SELECTORS = {
  deposit: functionSelector("deposit(bytes32,address,uint256)"),
  settle: functionSelector("settle(bytes32,bytes32,address,uint256,uint256)"),
  refund: functionSelector("refund(bytes32)"),
} as const;

export const BULWARK_ESCROW_ABI = [
  {
    inputs: [
      { internalType: "bytes32", name: "grantHash", type: "bytes32" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "deposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "grantHash", type: "bytes32" },
      { internalType: "bytes32", name: "authorityHash", type: "bytes32" },
      { internalType: "address", name: "rescuer", type: "address" },
      { internalType: "uint256", name: "reimbursement", type: "uint256" },
      { internalType: "uint256", name: "premium", type: "uint256" },
    ],
    name: "settle",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "grantHash", type: "bytes32" }],
    name: "refund",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export function padBytes32(hexString: string): string {
  const clean = hexString.replace(/^0x/, "");
  if (clean.length > 64) throw new Error(`bytes32 overflow: ${hexString}`);
  return clean.padStart(64, "0");
}

/**
 * Encodes deposit call to BulwarkEscrow.
 */
export function encodeEscrowDeposit(grantHash: string, tokenAddress: string, amountWei: bigint): string {
  return (
    ESCROW_SELECTORS.deposit +
    padBytes32(grantHash) +
    padAddress(tokenAddress) +
    padUint256(amountWei)
  );
}

/**
 * Encodes settle call to BulwarkEscrow contingent on PoAA proof.
 */
export function encodeEscrowSettle(
  grantHash: string,
  authorityHash: string,
  rescuerAddress: string,
  reimbursementWei: bigint,
  premiumWei: bigint
): string {
  return (
    ESCROW_SELECTORS.settle +
    padBytes32(grantHash) +
    padBytes32(authorityHash) +
    padAddress(rescuerAddress) +
    padUint256(reimbursementWei) +
    padUint256(premiumWei)
  );
}

/**
 * Validates whether an escrow settlement request is legally payable against a locked deposit.
 */
export function validateEscrowSettlement(
  deposit: EscrowDeposit,
  req: EscrowSettlementRequest,
  now = new Date()
): EscrowSettlementResult {
  if (deposit.status !== "locked") {
    return {
      ok: false,
      status: "rejected",
      payoutTotalWei: "0",
      reason: `Escrow deposit is not in locked status (current status: ${deposit.status})`,
    };
  }

  if (deposit.grantHash.toLowerCase() !== req.grantHash.toLowerCase()) {
    return {
      ok: false,
      status: "rejected",
      payoutTotalWei: "0",
      reason: `Grant hash mismatch: deposit ${deposit.grantHash} != request ${req.grantHash}`,
    };
  }

  if (!req.isPoaaProven) {
    return {
      ok: false,
      status: "rejected",
      payoutTotalWei: "0",
      reason: "PoAA verification is not PROVEN. Escrow cannot release funds without cryptographic proof of agency.",
    };
  }

  const expiresAtDate = new Date(deposit.expiresAt);
  if (now.getTime() > expiresAtDate.getTime()) {
    return {
      ok: false,
      status: "rejected",
      payoutTotalWei: "0",
      reason: `Escrow validity expired at ${deposit.expiresAt}`,
    };
  }

  const totalPayout = BigInt(req.reimbursementWei) + BigInt(req.premiumWei);
  const locked = BigInt(deposit.amountWei);

  if (totalPayout > locked) {
    return {
      ok: false,
      status: "rejected",
      payoutTotalWei: "0",
      reason: `Requested payout ${totalPayout.toString()} exceeds locked escrow deposit ${locked.toString()}`,
    };
  }

  return {
    ok: true,
    status: "settled",
    payoutTotalWei: totalPayout.toString(),
  };
}
