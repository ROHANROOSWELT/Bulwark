import { describe, it, expect } from "vitest";
import { PoaaBundle, verifyPoaaBundle } from "../../../packages/core/src/proof/poaa.js";
import { computeGrantHash } from "../../../packages/core/src/grants/grant.js";
import { computePolicyHash, getDefaultPolicyConfig } from "../../../packages/core/src/policy/engine.js";
import { computeIntentHash } from "../../../packages/core/src/policy/compiler.js";

describe("PoAA Cryptographic State Fuzzing Suite (150 Tests)", () => {
  const chains = [11155111, 8453, 1];

  for (let i = 1; i <= 150; i++) {
    const chainId = chains[i % chains.length]!;
    const user = `0x${i.toString(16).padStart(40, "1")}`;
    const asset = `0x${i.toString(16).padStart(40, "2")}`;
    const policy = getDefaultPolicyConfig(100, 1.2, 2.0);

    const rawGrant = {
      version: 2 as const,
      policyId: policy.policyId,
      policyHash: computePolicyHash(policy),
      createdAt: "2026-09-14T00:00:00.000Z",
      createdBy: "underwriter",
      approvedAt: "2026-09-14T00:01:00.000Z",
      approvedBy: user,
      parties: {
        owner: user,
        rescuer: `desk_${i}`,
        executor: "0x2222222222222222222222222222222222222222",
      },
      position: {
        chainId,
        positionOwner: user,
        debtAsset: asset,
      },
      authority: {
        allowedActions: ["repay" as const],
        capitalCapUsd: 100.0,
        perActionCapUsd: 50.0,
        dailyCapUsd: 100.0,
        adaptiveBands: [{ hfMin: 1.0, hfExcl: 1.3, maxCapitalUsd: 50.0 }],
        hfFloor: 1.01,
      },
      conditions: {
        hfTriggerBelow: 1.30,
        recoveryHf: 1.60,
        maxDebtChangePct: 0.30,
        priceBandPct: 0.20,
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
          hf: 1.12,
          debtUsd: 500.0,
          priceUsd: 1.0,
          debtTokenBalance: "500000000",
          timestamp: "2026-09-14T00:00:00.000Z",
        },
        capacityReservedUsd: 25.0,
        dailySpentUsd: 25.0,
        totalSpentUsd: 25.0,
        executionCount: 1,
      },
    };

    const { grantHash, grantId } = computeGrantHash(rawGrant);
    const grant = { ...rawGrant, grantHash, grantId };

    const intent = {
      action: "repay" as const,
      asset,
      amountUsd: 25.0,
      chainId,
      positionOwner: user,
    };
    const intentHash = computeIntentHash(intent);

    const authorizedIntent = {
      grantId,
      authorityHash: `0xauth_fuzz_${i}`,
      intentHash,
      action: "repay" as const,
      asset,
      authorizedAmountUsd: 25.0,
      amountWei: "25000000",
      repayMax: false,
      validUntil: "2026-09-14T01:00:00.000Z",
      checks: [],
    };

    const snapshot = {
      userAddress: user,
      chainId,
      poolAddress: "0xpool",
      debtAssetAddress: asset,
      debtSymbol: "DEBT",
      debtDecimals: 6,
      totalCollateralBase: 200000000000n,
      totalDebtBase: 50000000000n,
      availableBorrowsBase: 10000000000n,
      currentLiquidationThresholdBps: 8000,
      ltvBps: 7500,
      healthFactorWad: 1120000000000000000n,
      healthFactor: 1.12,
      totalCollateralUsd: 2000.0,
      totalDebtUsd: 500.0,
      debtTokenBalance: 500000000n,
      debtTokenBalanceHuman: 500.0,
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

    const txHash = `0x${i.toString(16).padStart(64, "e")}`;

    const bundle: PoaaBundle = {
      bundleVersion: "2.0",
      grant,
      creationSnapshot: grant.state.creationSnapshot,
      intent,
      intentHash,
      authorizedIntent,
      authorityHash: `0xauth_fuzz_${i}`,
      execution: {
        executionId: `exec_fuzz_${i}`,
        grantId,
        authorityHash: `0xauth_fuzz_${i}`,
        action: "repay",
        amountUsd: 25.0,
        amountWei: "25000000",
        status: "verified",
        simulatedAt: "2026-09-14T00:09:30.000Z",
        submittedAt: "2026-09-14T00:10:00.000Z",
        minedAt: "2026-09-14T00:10:15.000Z",
        verifiedAt: "2026-09-14T00:10:20.000Z",
        txHash,
        blockNumber: 7000000 + i,
        gasUsed: "145000",
        preHealthFactor: 1.12,
        postHealthFactor: 1.55,
        receiptVerified: true,
        independentReceiptVerified: true,
      },
      receipts: [
        {
          hash: txHash,
          chainId,
          verified: true,
          receiptStatus: "success",
          blockNumber: 7000000 + i,
          gasUsed: "145000",
          verifiedAt: "2026-09-14T00:10:20.000Z",
        },
      ],
      snapshots: {
        before: snapshot,
        after: {
          ...snapshot,
          healthFactor: 1.55,
          totalDebtUsd: 475.0,
          debtTokenBalanceHuman: 475.0,
          timestamp: "2026-09-14T00:10:25.000Z",
        },
      },
      policy,
      exportedAt: "2026-09-14T00:11:00.000Z",
    };

    it(`poaa-fuzz #${String(i).padStart(3, "0")}: chain=${chainId}, user=${user.slice(0, 8)}...`, () => {
      const report = verifyPoaaBundle(bundle);
      expect(report.verdict).toBe("PROVEN");
      expect(report.passedCount).toBe(11);
      expect(report.totalChecks).toBe(11);
    });
  }
});
