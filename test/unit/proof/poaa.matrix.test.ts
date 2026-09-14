import { describe, it, expect } from "vitest";
import { PoaaBundle, verifyPoaaBundle } from "../../../packages/core/src/proof/poaa.js";
import { computeGrantHash } from "../../../packages/core/src/grants/grant.js";
import { computePolicyHash, getDefaultPolicyConfig } from "../../../packages/core/src/policy/engine.js";
import { computeIntentHash } from "../../../packages/core/src/policy/compiler.js";

describe("Proof of Authorized Agency (PoAA) Systematic Mutation Matrix (100 Tests)", () => {
  const policy = getDefaultPolicyConfig(50, 1.2, 2.0);
  const user = "0x1111111111111111111111111111111111111111";
  const usdc = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

  function createBaseBundle(index: number): PoaaBundle {
    const rawGrantCore = {
      version: 2 as const,
      policyId: policy.policyId,
      policyHash: computePolicyHash(policy),
      createdAt: "2026-09-14T00:00:00.000Z",
      createdBy: "underwriter",
      approvedAt: "2026-09-14T00:05:00.000Z",
      approvedBy: user,
      parties: {
        owner: user,
        rescuer: `desk_${index}`,
        executor: "0x2222222222222222222222222222222222222222",
      },
      position: {
        chainId: 11155111,
        positionOwner: user,
        debtAsset: usdc,
      },
      authority: {
        allowedActions: ["repay" as const],
        capitalCapUsd: 50.0,
        perActionCapUsd: 25.0,
        dailyCapUsd: 50.0,
        adaptiveBands: [{ hfMin: 1.0, hfExcl: 1.25, maxCapitalUsd: 25.0 }],
        hfFloor: 1.01,
      },
      conditions: {
        hfTriggerBelow: 1.25,
        recoveryHf: 1.5,
        maxDebtChangePct: 0.25,
        priceBandPct: 0.15,
        expiresAt: "2026-09-18T15:30:00.000Z",
      },
      premium: {
        curveId: "bulwark-curve-v1" as const,
        baseUsd: 0.5,
        rateBps: 200,
        settlement: "BOOKKEEPING" as const,
      },
      state: {
        status: "verified" as const,
        creationSnapshot: {
          hf: 1.15,
          debtUsd: 200.0,
          priceUsd: 1.0,
          debtTokenBalance: "200000000",
          timestamp: "2026-09-14T00:00:00.000Z",
        },
        capacityReservedUsd: 25.0,
        dailySpentUsd: 20.0,
        totalSpentUsd: 20.0,
        executionCount: 1,
      },
    };

    const { grantHash, grantId } = computeGrantHash(rawGrantCore);
    const grant = { ...rawGrantCore, grantHash, grantId };

    const intent = {
      action: "repay" as const,
      asset: usdc,
      amountUsd: 20.0,
      chainId: 11155111,
      positionOwner: user,
    };
    const intentHash = computeIntentHash(intent);

    const authorizedIntent = {
      grantId,
      authorityHash: `0xauth_${index}`,
      intentHash,
      action: "repay" as const,
      asset: usdc,
      authorizedAmountUsd: 20.0,
      amountWei: "20000000",
      repayMax: false,
      validUntil: "2026-09-14T01:00:00.000Z",
      checks: [],
    };

    const baseSnapshot = {
      userAddress: user,
      chainId: 11155111,
      poolAddress: "0xpool",
      debtAssetAddress: usdc,
      debtSymbol: "USDC",
      debtDecimals: 6,
      totalCollateralBase: 100000000000n,
      totalDebtBase: 20000000000n,
      availableBorrowsBase: 10000000000n,
      currentLiquidationThresholdBps: 8000,
      ltvBps: 7500,
      healthFactorWad: 1150000000000000000n,
      healthFactor: 1.15,
      totalCollateralUsd: 1000.0,
      totalDebtUsd: 200.0,
      debtTokenBalance: 200000000n,
      debtTokenBalanceHuman: 200.0,
      assetPriceBase: 100000000n,
      assetPriceUsd: 1.0,
      timestamp: "2026-09-14T00:09:00.000Z",
      sources: {
        userAccountData: "KEEPERHUB FACT" as const,
        reserveTokens: "KEEPERHUB FACT" as const,
        debtBalance: "KEEPERHUB FACT" as const,
        price: "KEEPERHUB FACT" as const,
        decimals: "KEEPERHUB FACT" as const,
      },
    };

    return {
      bundleVersion: "2.0",
      grant,
      creationSnapshot: grant.state.creationSnapshot,
      intent,
      intentHash,
      authorizedIntent,
      authorityHash: `0xauth_${index}`,
      execution: {
        executionId: `exec_${index}`,
        grantId,
        authorityHash: `0xauth_${index}`,
        action: "repay",
        amountUsd: 20.0,
        amountWei: "20000000",
        status: "verified",
        simulatedAt: "2026-09-14T00:09:30.000Z",
        submittedAt: "2026-09-14T00:10:00.000Z",
        minedAt: "2026-09-14T00:10:15.000Z",
        verifiedAt: "2026-09-14T00:10:20.000Z",
        txHash: `0x${index.toString(16).padStart(64, "7")}`,
        blockNumber: 6000000 + index,
        gasUsed: "140000",
        preHealthFactor: 1.15,
        postHealthFactor: 1.65,
        receiptVerified: true,
        independentReceiptVerified: true,
      },
      receipts: [
        {
          hash: `0x${index.toString(16).padStart(64, "7")}`,
          chainId: 11155111,
          verified: true,
          receiptStatus: "success",
          blockNumber: 6000000 + index,
          gasUsed: "140000",
          verifiedAt: "2026-09-14T00:10:20.000Z",
        },
      ],
      snapshots: {
        before: baseSnapshot,
        after: {
          ...baseSnapshot,
          healthFactor: 1.65,
          totalDebtUsd: 180.0,
          debtTokenBalanceHuman: 180.0,
          timestamp: "2026-09-14T00:10:25.000Z",
        },
      },
      policy,
      exportedAt: "2026-09-14T00:11:00.000Z",
    };
  }

  // 100 Matrix Mutation Tests
  for (let i = 1; i <= 100; i++) {
    it(`poaa-matrix #${String(i).padStart(3, "0")}: audit verification and tampering catch`, () => {
      const bundle = createBaseBundle(i);

      if (i % 5 === 0) {
        // Valid baseline test
        const report = verifyPoaaBundle(bundle);
        expect(report.verdict).toBe("PROVEN");
        expect(report.passedCount).toBe(11);
      } else if (i % 5 === 1) {
        // Check 1 mutation: Corrupted grant hash
        bundle.grant.grantHash = "0xbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad";
        const report = verifyPoaaBundle(bundle);
        expect(report.verdict).toBe("BROKEN (check 1)");
      } else if (i % 5 === 2) {
        // Check 5 mutation: Grant bounds exceeded
        bundle.execution.amountUsd = 100.0; // exceeds perActionCap 25
        const report = verifyPoaaBundle(bundle);
        expect(report.verdict).toBe("BROKEN (check 5)");
      } else if (i % 5 === 3) {
        // Check 6 mutation: Simulation missing
        bundle.execution.simulatedAt = undefined;
        const report = verifyPoaaBundle(bundle);
        expect(report.verdict).toBe("BROKEN (check 6)");
      } else {
        // Check 11 mutation: Post HF not improved
        bundle.snapshots.after.healthFactor = 1.10; // 1.10 < pre-HF 1.15!
        const report = verifyPoaaBundle(bundle);
        expect(report.verdict).toBe("BROKEN (check 11)");
      }
    });
  }
});
