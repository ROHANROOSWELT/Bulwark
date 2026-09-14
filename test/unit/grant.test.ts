import { describe, it, expect } from "vitest";
import {
  computeGrantHash,
  canonicalizeJson,
  canTransitionGrant,
  transitionGrant,
  RescueGrantV2,
} from "../../packages/core/src/grants/grant.js";

describe("RescueGrant Model & State Machine", () => {
  const baseGrantCore: Omit<RescueGrantV2, "grantId" | "grantHash" | "authorityHash"> = {
    version: 2,
    policyId: "policy_sepolia_v1",
    policyHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    createdAt: "2026-09-14T00:00:00.000Z",
    createdBy: "underwriter_agent",
    parties: {
      owner: "0x1111111111111111111111111111111111111111",
      rescuer: "desk_keeperhub_01",
      executor: "0x2222222222222222222222222222222222222222",
    },
    position: {
      chainId: 11155111,
      positionOwner: "0x1111111111111111111111111111111111111111",
      debtAsset: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    },
    authority: {
      allowedActions: ["repay"],
      capitalCapUsd: 25.0,
      perActionCapUsd: 15.0,
      dailyCapUsd: 25.0,
      adaptiveBands: [
        { hfMin: 1.25, hfExcl: 1.35, maxCapitalUsd: 5.0 },
        { hfMin: 1.15, hfExcl: 1.25, maxCapitalUsd: 15.0 },
        { hfMin: 1.05, hfExcl: 1.15, maxCapitalUsd: 25.0 },
      ],
      hfFloor: 1.05,
    },
    conditions: {
      hfTriggerBelow: 1.25,
      recoveryHf: 1.5,
      maxDebtChangePct: 0.2,
      priceBandPct: 0.15,
      expiresAt: "2026-09-18T15:30:00.000Z",
    },
    premium: {
      curveId: "bulwark-curve-v1",
      baseUsd: 0.5,
      rateBps: 200,
      settlement: "BOOKKEEPING",
    },
    state: {
      status: "proposed",
      creationSnapshot: {
        hf: 1.18,
        debtUsd: 500.0,
        priceUsd: 1.0,
        debtTokenBalance: "500000000",
        timestamp: "2026-09-14T00:00:00.000Z",
      },
      capacityReservedUsd: 0,
      dailySpentUsd: 0,
      totalSpentUsd: 0,
      executionCount: 0,
    },
  };

  it("produces deterministic canonical JSON and hash regardless of key order", () => {
    const { grantHash: h1, grantId: id1 } = computeGrantHash(baseGrantCore);

    // Perturb key order in a clone
    const reordered: any = {
      state: baseGrantCore.state,
      version: 2,
      authority: baseGrantCore.authority,
      createdAt: baseGrantCore.createdAt,
      createdBy: baseGrantCore.createdBy,
      premium: baseGrantCore.premium,
      position: baseGrantCore.position,
      parties: baseGrantCore.parties,
      conditions: baseGrantCore.conditions,
      policyId: baseGrantCore.policyId,
      policyHash: baseGrantCore.policyHash,
    };

    const { grantHash: h2, grantId: id2 } = computeGrantHash(reordered);
    expect(h1).toBe(h2);
    expect(id1).toBe(id2);
    expect(id1.startsWith("bg_")).toBe(true);
  });

  it("enforces lifecycle transition legality", () => {
    expect(canTransitionGrant("proposed", "approved")).toBe(true);
    expect(canTransitionGrant("proposed", "submitted")).toBe(false); // Illegal jump!
    expect(canTransitionGrant("approved", "armed")).toBe(true);
    expect(canTransitionGrant("armed", "dry_run")).toBe(true);
    expect(canTransitionGrant("dry_run", "submitted")).toBe(true);
    expect(canTransitionGrant("submitted", "mined")).toBe(true);
    expect(canTransitionGrant("mined", "verified")).toBe(true);
    expect(canTransitionGrant("verified", "settled")).toBe(true);

    // Invalidation reachable from armed
    expect(canTransitionGrant("armed", "invalidated")).toBe(true);
    expect(canTransitionGrant("settled", "armed")).toBe(false);
  });

  it("transitions grant and updates status metadata", () => {
    const { grantHash, grantId } = computeGrantHash(baseGrantCore);
    const grant: RescueGrantV2 = {
      ...baseGrantCore,
      grantHash,
      grantId,
    };

    const approved = transitionGrant(grant, "approved", { reason: "Owner clicked approve in CLI" });
    expect(approved.state.status).toBe("approved");
    expect(approved.state.statusReason).toBe("Owner clicked approve in CLI");

    const armed = transitionGrant(approved, "armed");
    expect(armed.state.status).toBe("armed");

    const invalidated = transitionGrant(armed, "invalidated", {
      invalidationReason: "recovered",
      reason: "Position HF climbed back to 1.6 >= recoveryHf 1.5",
    });
    expect(invalidated.state.status).toBe("invalidated");
    expect(invalidated.state.invalidationReason).toBe("recovered");

    expect(() => transitionGrant(invalidated, "submitted")).toThrow(/Illegal grant transition/);
  });
});
