import { describe, it, expect } from "vitest";
import {
  evaluatePolicy,
  resolveAdaptiveBand,
  getDefaultPolicyConfig,
  computePolicyHash,
} from "../../packages/core/src/policy/engine.js";
import { RescueGrantV2, computeGrantHash } from "../../packages/core/src/grants/grant.js";
import { PositionSnapshot } from "../../packages/core/src/aave/reader.js";

describe("Policy Engine (Pure Invariants & Adaptive Bands)", () => {
  const policy = getDefaultPolicyConfig(25, 1.2, 2.0);

  const mockSnapshot: PositionSnapshot = {
    userAddress: "0x1111111111111111111111111111111111111111",
    chainId: 11155111,
    poolAddress: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
    debtAssetAddress: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    debtSymbol: "USDC",
    debtDecimals: 6,
    totalCollateralBase: 100000000000n,
    totalDebtBase: 50000000000n,
    availableBorrowsBase: 10000000000n,
    currentLiquidationThresholdBps: 8000,
    ltvBps: 7500,
    healthFactorWad: 1180000000000000000n,
    healthFactor: 1.18,
    totalCollateralUsd: 1000.0,
    totalDebtUsd: 500.0,
    debtTokenBalance: 500000000n,
    debtTokenBalanceHuman: 500.0,
    assetPriceBase: 100000000n,
    assetPriceUsd: 1.0,
    timestamp: "2026-09-14T10:00:00Z",
    sources: {
      userAccountData: "KEEPERHUB FACT",
      reserveTokens: "KEEPERHUB FACT",
      debtBalance: "KEEPERHUB FACT",
      price: "KEEPERHUB FACT",
      decimals: "KEEPERHUB FACT",
    },
  };

  const createArmedGrant = (overrides?: Partial<RescueGrantV2>): RescueGrantV2 => {
    const raw = {
      version: 2 as const,
      policyId: policy.policyId,
      policyHash: computePolicyHash(policy),
      createdAt: "2026-09-14T00:00:00Z",
      createdBy: "underwriter",
      parties: {
        owner: "0x1111111111111111111111111111111111111111",
        rescuer: "desk",
        executor: "0x2222222222222222222222222222222222222222",
      },
      position: {
        chainId: 11155111,
        positionOwner: "0x1111111111111111111111111111111111111111",
        debtAsset: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
      },
      authority: {
        allowedActions: ["repay" as const],
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
        expiresAt: "2026-09-18T15:30:00Z",
      },
      premium: {
        curveId: "bulwark-curve-v1" as const,
        baseUsd: 0.5,
        rateBps: 200,
        settlement: "BOOKKEEPING" as const,
      },
      state: {
        status: "armed" as const,
        creationSnapshot: {
          hf: 1.18,
          debtUsd: 500.0,
          priceUsd: 1.0,
          debtTokenBalance: "500000000",
          timestamp: "2026-09-14T00:00:00Z",
        },
        capacityReservedUsd: 15.0,
        dailySpentUsd: 0,
        totalSpentUsd: 0,
        executionCount: 0,
      },
      ...overrides,
    };
    const { grantHash, grantId } = computeGrantHash(raw);
    return { ...raw, grantHash, grantId };
  };

  it("passes an armed grant under normal critical conditions", () => {
    const grant = createArmedGrant();
    const result = evaluatePolicy(policy, grant, mockSnapshot, 50.0);
    expect(result.ok).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.resolvedBand?.maxCapitalUsd).toBe(15.0); // HF 1.18 falls into 1.15-1.25 band
    expect(result.effectiveCapUsd).toBe(15.0);
  });

  it("rejects proposed grant (Rule: proposed never executes)", () => {
    const grant = createArmedGrant();
    grant.state.status = "proposed";
    const result = evaluatePolicy(policy, grant, mockSnapshot, 50.0);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("Grant not armed"))).toBe(true);
  });

  it("rejects expired grant", () => {
    const grant = createArmedGrant();
    grant.conditions.expiresAt = "2026-09-01T00:00:00Z"; // past
    const result = evaluatePolicy(policy, grant, mockSnapshot, 50.0);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("expired"))).toBe(true);
  });

  it("rejects duplicate or terminal grant execution", () => {
    const grant = createArmedGrant();
    grant.state.status = "submitted";
    const result = evaluatePolicy(policy, grant, mockSnapshot, 50.0);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("Duplicate execution refusal"))).toBe(true);
  });

  it("suspends auto-rescue when HF breaches hfFloor", () => {
    const grant = createArmedGrant();
    const badSnapshot = { ...mockSnapshot, healthFactor: 1.03 }; // Below floor 1.05
    const result = evaluatePolicy(policy, grant, badSnapshot, 50.0);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("HF Floor breached"))).toBe(true);
  });

  it("invalidates when position has recovered (HF >= recoveryHf)", () => {
    const grant = createArmedGrant();
    const recoveredSnapshot = { ...mockSnapshot, healthFactor: 1.55 }; // >= 1.5
    const result = evaluatePolicy(policy, grant, recoveredSnapshot, 50.0);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("INVALIDATED: position recovered"))).toBe(true);
  });

  it("invalidates on excessive debt drift", () => {
    const grant = createArmedGrant();
    const driftedSnapshot = { ...mockSnapshot, totalDebtUsd: 700.0 }; // 40% drift vs 500 creationDebt > 20%
    const result = evaluatePolicy(policy, grant, driftedSnapshot, 50.0);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("INVALIDATED: debt drift"))).toBe(true);
  });

  it("invalidates on excessive price drift", () => {
    const grant = createArmedGrant();
    const priceDriftSnapshot = { ...mockSnapshot, assetPriceUsd: 1.30 }; // 30% drift vs 1.0 > 15%
    const result = evaluatePolicy(policy, grant, priceDriftSnapshot, 50.0);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("INVALIDATED: asset price drift"))).toBe(true);
  });

  it("rejects non-allowlisted asset or hostile address injection", () => {
    const grant = createArmedGrant();
    grant.position.debtAsset = "0x000000000000000000000000000000000000dead";
    const result = evaluatePolicy(policy, grant, mockSnapshot, 50.0);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("not allowlisted"))).toBe(true);
  });
});
