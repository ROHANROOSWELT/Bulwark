import { describe, it, expect } from "vitest";
import { compilePolicyIntent } from "../../../packages/core/src/policy/compiler.js";
import { RescueGrantV2, computeGrantHash } from "../../../packages/core/src/grants/grant.js";
import { getDefaultPolicyConfig, computePolicyHash, resolveAdaptiveBand } from "../../../packages/core/src/policy/engine.js";
import { PositionSnapshot } from "../../../packages/core/src/aave/reader.js";
import { ExecutionIntent } from "../../../packages/core/src/policy/types.js";

describe("Clamp-Only Policy Compiler Invariance Suite (150 Tests)", () => {
  const user = "0x1111111111111111111111111111111111111111";
  const usdc = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

  const snapshot: PositionSnapshot = {
    userAddress: user,
    chainId: 11155111,
    poolAddress: "0xpool",
    debtAssetAddress: usdc,
    debtSymbol: "USDC",
    debtDecimals: 6,
    totalCollateralBase: 10000000000n, // $100
    totalDebtBase: 8000000000n,       // $80
    availableBorrowsBase: 1000000000n,
    currentLiquidationThresholdBps: 8000,
    ltvBps: 7500,
    healthFactorWad: 1050000000000000000n,
    healthFactor: 1.05,
    totalCollateralUsd: 100.0,
    totalDebtUsd: 80.0,
    debtTokenBalance: 80000000n,
    debtTokenBalanceHuman: 80.0,
    assetPriceBase: 100000000n,
    assetPriceUsd: 1.0,
    timestamp: "2026-09-14T00:00:00Z",
    sources: {
      userAccountData: "KEEPERHUB FACT",
      reserveTokens: "KEEPERHUB FACT",
      debtBalance: "KEEPERHUB FACT",
      price: "KEEPERHUB FACT",
      decimals: "KEEPERHUB FACT",
    },
  };

  for (let i = 1; i <= 150; i++) {
    const requestedAmount = 1 + (i % 25) * 5; // $1 to $125
    const grantCap = 10 + (i % 10) * 5;      // $10 to $55
    const policyMax = 15 + (i % 8) * 5;      // $15 to $50
    const bandCap = 12 + (i % 6) * 3;        // $12 to $27
    const deskCapacity = 5 + (i % 20) * 10;  // $5 to $195

    const policy = getDefaultPolicyConfig(policyMax, 1.2, 2.0);

    const grantCore = {
      version: 2 as const,
      policyId: policy.policyId,
      policyHash: computePolicyHash(policy),
      createdAt: "2026-09-14T00:00:00Z",
      createdBy: "underwriter",
      approvedAt: "2026-09-14T00:01:00Z",
      approvedBy: user,
      parties: {
        owner: user,
        rescuer: "desk",
        executor: "0x2222222222222222222222222222222222222222",
      },
      position: {
        chainId: 11155111,
        positionOwner: user,
        debtAsset: usdc,
      },
      authority: {
        allowedActions: ["repay" as const],
        capitalCapUsd: grantCap,
        perActionCapUsd: grantCap,
        dailyCapUsd: grantCap,
        adaptiveBands: [
          { hfMin: 1.0, hfExcl: 1.15, maxCapitalUsd: bandCap },
        ],
        hfFloor: 1.01,
      },
      conditions: {
        hfTriggerBelow: 1.25,
        recoveryHf: 1.5,
        maxDebtChangePct: 0.25,
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
          debtUsd: 80.0,
          priceUsd: 1.0,
          debtTokenBalance: "80000000",
          timestamp: "2026-09-14T00:00:00Z",
        },
        capacityReservedUsd: 10.0,
        dailySpentUsd: 0,
        totalSpentUsd: 0,
        executionCount: 0,
      },
    };

    const { grantHash, grantId } = computeGrantHash(grantCore);
    const grant: RescueGrantV2 = { ...grantCore, grantHash, grantId };

    const intent: ExecutionIntent = {
      action: "repay",
      asset: usdc,
      amountUsd: requestedAmount,
      chainId: 11155111,
      positionOwner: user,
    };

    it(`clamp-invariant #${String(i).padStart(3, "0")}: req=$${requestedAmount}, grantCap=$${grantCap}, policyMax=$${policyMax}, bandCap=$${bandCap}, cap=$${deskCapacity}`, () => {
      const authorized = compilePolicyIntent(intent, grant, snapshot, policy, deskCapacity);

      // Clamped Ceiling Theorem: authorizedAmount <= min of all four limits
      const expectedLimit = Math.min(requestedAmount, grantCap, policyMax, bandCap, deskCapacity);
      expect(authorized.authorizedAmountUsd).toBeLessThanOrEqual(expectedLimit + 0.001);

      // Structural impossibility: agent cannot raise limits
      expect(authorized.authorizedAmountUsd).toBeLessThanOrEqual(requestedAmount);
      expect(authorized.authorizedAmountUsd).toBeLessThanOrEqual(grantCap);
      expect(authorized.authorizedAmountUsd).toBeLessThanOrEqual(policyMax);
      expect(authorized.authorizedAmountUsd).toBeLessThanOrEqual(bandCap);
      expect(authorized.authorizedAmountUsd).toBeLessThanOrEqual(deskCapacity);

      // Hash binding integrity
      expect(authorized.grantId).toBe(grant.grantId);
      expect(authorized.authorityHash.startsWith("0x")).toBe(true);
    });
  }
});
