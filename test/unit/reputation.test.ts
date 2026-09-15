import { describe, it, expect } from "vitest";
import { computeDeskReputation } from "../../packages/core/src/desk/reputation.js";
import { ExecutionRecord, AuditRecord } from "../../packages/core/src/grants/store.js";
import { RescueGrantV2, computeGrantHash } from "../../packages/core/src/grants/grant.js";

describe("Execution Reputation", () => {
  it("returns zeroed statistics on empty history", () => {
    const rep = computeDeskReputation([], [], []);
    expect(rep.totalGrantsProposed).toBe(0);
    expect(rep.totalExecutionsAttempted).toBe(0);
    expect(rep.totalExecutionsVerified).toBe(0);
    expect(rep.totalCapitalDeployedUsd).toBe(0);
    expect(rep.averageLatencyMs).toBe(0);
    expect(rep.hfImprovements.average).toBe(0);
    expect(rep.provenance).toBe("BOOKKEEPING");
  });

  it("accurately computes reputation metrics from verified records", () => {
    const mockGrants: RescueGrantV2[] = [
      {
        ...computeGrantHash({
          version: 2,
          policyId: "p1",
          policyHash: "0x1",
          createdAt: "2026-09-14T00:00:00Z",
          createdBy: "agent",
          parties: { owner: "0x1", rescuer: "d1", executor: "0x2" },
          position: { chainId: 11155111, positionOwner: "0x1", debtAsset: "0xusdc" },
          authority: { allowedActions: ["repay"], capitalCapUsd: 25, perActionCapUsd: 15, dailyCapUsd: 25, adaptiveBands: [], hfFloor: 1.05 },
          conditions: { hfTriggerBelow: 1.2, recoveryHf: 1.5, maxDebtChangePct: 0.2, priceBandPct: 0.1, expiresAt: "2026-09-18T00:00:00Z" },
          premium: { curveId: "bulwark-curve-v1", baseUsd: 0.5, rateBps: 200, settlement: "BOOKKEEPING" },
          state: {
            status: "verified",
            creationSnapshot: { hf: 1.18, debtUsd: 500, priceUsd: 1, debtTokenBalance: "500", timestamp: "2026-09-14T00:00:00Z" },
            capacityReservedUsd: 15,
            dailySpentUsd: 15,
            totalSpentUsd: 15,
            executionCount: 1,
          },
        }),
        version: 2,
        policyId: "p1",
        policyHash: "0x1",
        createdAt: "2026-09-14T00:00:00Z",
        createdBy: "agent",
        parties: { owner: "0x1", rescuer: "d1", executor: "0x2" },
        position: { chainId: 11155111, positionOwner: "0x1", debtAsset: "0xusdc" },
        authority: { allowedActions: ["repay"], capitalCapUsd: 25, perActionCapUsd: 15, dailyCapUsd: 25, adaptiveBands: [], hfFloor: 1.05 },
        conditions: { hfTriggerBelow: 1.2, recoveryHf: 1.5, maxDebtChangePct: 0.2, priceBandPct: 0.1, expiresAt: "2026-09-18T00:00:00Z" },
        premium: { curveId: "bulwark-curve-v1", baseUsd: 0.5, rateBps: 200, settlement: "BOOKKEEPING" },
        state: {
          status: "verified",
          creationSnapshot: { hf: 1.18, debtUsd: 500, priceUsd: 1, debtTokenBalance: "500", timestamp: "2026-09-14T00:00:00Z" },
          capacityReservedUsd: 15,
          dailySpentUsd: 15,
          totalSpentUsd: 15,
          executionCount: 1,
        },
      },
    ];

    const mockExecutions: ExecutionRecord[] = [
      {
        executionId: "ex1",
        grantId: "g1",
        authorityHash: "0xa",
        action: "repay",
        amountUsd: 15.0,
        amountWei: "15000000",
        status: "verified",
        submittedAt: "2026-09-14T00:10:00Z",
        verifiedAt: "2026-09-14T00:10:10Z", // 10s latency = 10000ms
        preHealthFactor: 1.18,
        postHealthFactor: 2.03, // improvement 0.85
        receiptVerified: true,
      },
    ];

    const mockAudit: AuditRecord[] = [
      {
        id: "a1",
        timestamp: "2026-09-14T00:09:00Z",
        type: "SIMULATION",
        details: { wouldRevert: false },
        provenance: "KEEPERHUB FACT",
      },
    ];

    const rep = computeDeskReputation(mockGrants, mockExecutions, mockAudit);
    expect(rep.totalGrantsArmed).toBe(1);
    expect(rep.totalExecutionsVerified).toBe(1);
    expect(rep.totalCapitalDeployedUsd).toBe(15.0);
    expect(rep.averageLatencyMs).toBe(10000);
    expect(rep.hfImprovements.average).toBe(0.85);
    expect(rep.totalSimulationFailures).toBe(0);
  });

  it("does not count revoked, expired, or insufficient_capacity grants as armed", () => {
    const makeGrant = (status: any): RescueGrantV2 => ({
      ...computeGrantHash({
        version: 2,
        policyId: "p1",
        policyHash: "0x1",
        createdAt: "2026-09-14T00:00:00Z",
        createdBy: "agent",
        parties: { owner: "0x1", rescuer: "d1", executor: "0x2" },
        position: { chainId: 11155111, positionOwner: "0x1", debtAsset: "0xusdc" },
        authority: { allowedActions: ["repay"], capitalCapUsd: 25, perActionCapUsd: 15, dailyCapUsd: 25, adaptiveBands: [], hfFloor: 1.05 },
        conditions: { hfTriggerBelow: 1.2, recoveryHf: 1.5, maxDebtChangePct: 0.2, priceBandPct: 0.1, expiresAt: "2026-09-18T00:00:00Z" },
        premium: { curveId: "bulwark-curve-v1", baseUsd: 0.5, rateBps: 200, settlement: "BOOKKEEPING" },
        state: { status, capacityReservedUsd: 0, dailySpentUsd: 0, totalSpentUsd: 0, executionCount: 0 },
      }),
      version: 2,
      policyId: "p1",
      policyHash: "0x1",
      createdAt: "2026-09-14T00:00:00Z",
      createdBy: "agent",
      parties: { owner: "0x1", rescuer: "d1", executor: "0x2" },
      position: { chainId: 11155111, positionOwner: "0x1", debtAsset: "0xusdc" },
      authority: { allowedActions: ["repay"], capitalCapUsd: 25, perActionCapUsd: 15, dailyCapUsd: 25, adaptiveBands: [], hfFloor: 1.05 },
      conditions: { hfTriggerBelow: 1.2, recoveryHf: 1.5, maxDebtChangePct: 0.2, priceBandPct: 0.1, expiresAt: "2026-09-18T00:00:00Z" },
      premium: { curveId: "bulwark-curve-v1", baseUsd: 0.5, rateBps: 200, settlement: "BOOKKEEPING" },
      state: { status, capacityReservedUsd: 0, dailySpentUsd: 0, totalSpentUsd: 0, executionCount: 0 },
    });

    const grants = [
      makeGrant("proposed"),
      makeGrant("approved"),
      makeGrant("armed"),
      makeGrant("revoked"),
      makeGrant("insufficient_capacity"),
      makeGrant("expired"),
    ];

    const rep = computeDeskReputation(grants, [], []);
    expect(rep.totalGrantsProposed).toBe(6);
    expect(rep.totalGrantsApproved).toBe(2); // approved + armed
    expect(rep.totalGrantsArmed).toBe(1); // only armed
  });
});
