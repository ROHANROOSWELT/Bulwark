import { describe, it, expect } from "vitest";
import {
  encodeEscrowDeposit,
  encodeEscrowSettle,
  validateEscrowSettlement,
  EscrowDeposit,
  EscrowSettlementRequest,
} from "../../packages/core/src/escrow/escrow.js";

describe("Bulwark On-Chain Escrow & Real Settlement Protocol", () => {
  const sampleGrantHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const sampleAuthHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const sampleToken = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
  const sampleDesk = "0x1111111111111111111111111111111111111111";

  const sampleDeposit: EscrowDeposit = {
    depositId: "escrow_001",
    grantHash: sampleGrantHash,
    depositorAddress: "0x2222222222222222222222222222222222222222",
    tokenAddress: sampleToken,
    amountWei: "20000000", // 20 USDC
    amountUsd: 20.0,
    status: "locked",
    createdAt: "2026-09-14T00:00:00Z",
    expiresAt: "2026-09-18T00:00:00Z",
  };

  it("encodes deposit and settle calldata with verified selectors", () => {
    const depCall = encodeEscrowDeposit(sampleGrantHash, sampleToken, 20000000n);
    expect(depCall.startsWith("0x")).toBe(true);
    // Selector (4 bytes / 8 hex) + 3 words (96 bytes / 192 hex) = 202 chars
    expect(depCall.length).toBe(10 + 64 * 3);

    const setCall = encodeEscrowSettle(sampleGrantHash, sampleAuthHash, sampleDesk, 15000000n, 1500000n);
    // Selector + 5 words (grantHash, authHash, rescuer, reimb, prem) = 10 + 64 * 5 = 330 chars
    expect(setCall.length).toBe(10 + 64 * 5);
  });

  it("approves settlement when PoAA is PROVEN and payout is within locked funds", () => {
    const validReq: EscrowSettlementRequest = {
      grantHash: sampleGrantHash,
      authorityHash: sampleAuthHash,
      rescuerDesk: sampleDesk,
      reimbursementWei: "15000000", // 15 USDC
      premiumWei: "1500000",        // 1.5 USDC
      poaaProofHash: "0xproof_valid",
      isPoaaProven: true,
    };

    const res = validateEscrowSettlement(sampleDeposit, validReq, new Date("2026-09-14T12:00:00Z"));
    expect(res.ok).toBe(true);
    expect(res.status).toBe("settled");
    expect(res.payoutTotalWei).toBe("16500000"); // 16.5 USDC
  });

  it("refuses settlement when PoAA proof is DISPROVEN / unproven", () => {
    const unprovenReq: EscrowSettlementRequest = {
      grantHash: sampleGrantHash,
      authorityHash: sampleAuthHash,
      rescuerDesk: sampleDesk,
      reimbursementWei: "15000000",
      premiumWei: "1500000",
      poaaProofHash: "0xproof_invalid",
      isPoaaProven: false, // Unproven!
    };

    const res = validateEscrowSettlement(sampleDeposit, unprovenReq, new Date("2026-09-14T12:00:00Z"));
    expect(res.ok).toBe(false);
    expect(res.status).toBe("rejected");
    expect(res.reason).toContain("PoAA verification is not PROVEN");
  });

  it("refuses settlement if requested payout exceeds locked escrow deposit", () => {
    const greedyReq: EscrowSettlementRequest = {
      grantHash: sampleGrantHash,
      authorityHash: sampleAuthHash,
      rescuerDesk: sampleDesk,
      reimbursementWei: "25000000", // 25 USDC > 20 USDC locked
      premiumWei: "5000000",
      poaaProofHash: "0xproof_valid",
      isPoaaProven: true,
    };

    const res = validateEscrowSettlement(sampleDeposit, greedyReq, new Date("2026-09-14T12:00:00Z"));
    expect(res.ok).toBe(false);
    expect(res.status).toBe("rejected");
    expect(res.reason).toContain("exceeds locked escrow deposit");
  });
});
