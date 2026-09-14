import { describe, it, expect } from "vitest";
import {
  compilePolicyIntent,
  computeIntentHash,
  UINT256_MAX,
} from "../../packages/core/src/policy/compiler.js";
import { getDefaultPolicyConfig, computePolicyHash } from "../../packages/core/src/policy/engine.js";
import { RescueGrantV2, computeGrantHash } from "../../packages/core/src/grants/grant.js";
import { PositionSnapshot } from "../../packages/core/src/aave/reader.js";
import { ExecutionIntent } from "../../packages/core/src/policy/types.js";

describe("Policy Compiler (Clamp-only & Hash Binding)", () => {
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
    healthFactor: 1.18, // Falls in 1.15 - 1.25 band -> cap $15
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

  const rawGrant = {
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
      perActionCapUsd: 20.0,
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
      capacityReservedUsd: 20.0,
      dailySpentUsd: 0,
      totalSpentUsd: 0,
      executionCount: 0,
    },
  };

  const { grantHash, grantId } = computeGrantHash(rawGrant);
  const grant: RescueGrantV2 = { ...rawGrant, grantHash, grantId };

  it("clamps agent intent when requested amount exceeds adaptive band cap (NEVER raises)", () => {
    // Agent asks for $22, but live HF 1.18 has band cap $15
    const intent: ExecutionIntent = {
      action: "repay",
      asset: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
      amountUsd: 22.0,
      chainId: 11155111,
      positionOwner: "0x1111111111111111111111111111111111111111",
    };

    const fixedNow = new Date("2026-09-14T11:00:00Z");
    const compiled = compilePolicyIntent(intent, grant, mockSnapshot, policy, 50.0, fixedNow);

    expect(compiled.authorizedAmountUsd).toBe(15.0); // Clamped from $22 to $15!
    expect(compiled.repayMax).toBe(false);
    expect(compiled.amountWei).toBe((15 * 1e6).toString()); // 15 USDC @ 6 decimals
    expect(compiled.authorityHash.startsWith("0x")).toBe(true);
    expect(compiled.intentHash).toBe(computeIntentHash(intent));
  });

  it("does not clamp when requested amount is below effective cap", () => {
    const intent: ExecutionIntent = {
      action: "repay",
      asset: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
      amountUsd: 10.0,
      chainId: 11155111,
      positionOwner: "0x1111111111111111111111111111111111111111",
    };

    const compiled = compilePolicyIntent(intent, grant, mockSnapshot, policy, 50.0);
    expect(compiled.authorizedAmountUsd).toBe(10.0);
    expect(compiled.amountWei).toBe((10 * 1e6).toString());
  });

  it("ensures hash stability: identical inputs produce identical authorityHash", () => {
    const intent: ExecutionIntent = {
      action: "repay",
      asset: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
      amountUsd: 12.0,
      chainId: 11155111,
      positionOwner: "0x1111111111111111111111111111111111111111",
    };

    const fixedTime = new Date("2026-09-14T12:00:00Z");
    const c1 = compilePolicyIntent(intent, grant, mockSnapshot, policy, 50.0, fixedTime);
    const c2 = compilePolicyIntent(intent, grant, mockSnapshot, policy, 50.0, fixedTime);

    expect(c1.authorityHash).toBe(c2.authorityHash);
    expect(c1.intentHash).toBe(c2.intentHash);
  });

  it("REJECTS (never clamps) allowlist violations", () => {
    // Wrong chain
    expect(() =>
      compilePolicyIntent(
        {
          action: "repay",
          asset: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
          amountUsd: 10,
          chainId: 1, // Wrong chain!
          positionOwner: "0x1111111111111111111111111111111111111111",
        },
        grant,
        mockSnapshot,
        policy,
        50
      )
    ).toThrow(/POLICY COMPILER REJECT: Chain mismatch/);

    // Wrong owner
    expect(() =>
      compilePolicyIntent(
        {
          action: "repay",
          asset: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
          amountUsd: 10,
          chainId: 11155111,
          positionOwner: "0x9999999999999999999999999999999999999999", // Wrong owner!
        },
        grant,
        mockSnapshot,
        policy,
        50
      )
    ).toThrow(/POLICY COMPILER REJECT: Owner mismatch/);
  });
});
