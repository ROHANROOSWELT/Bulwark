import { describe, it, expect } from "vitest";
import { PoaaBundle, verifyPoaaBundle } from "../../packages/core/src/proof/poaa.js";
import { computeGrantHash } from "../../packages/core/src/grants/grant.js";
import { computePolicyHash, getDefaultPolicyConfig } from "../../packages/core/src/policy/engine.js";
import { computeIntentHash } from "../../packages/core/src/policy/compiler.js";

describe("Proof of Authorized Agency (PoAA) 11-Check Verifier", () => {
  const policy = getDefaultPolicyConfig(25, 1.2, 2.0);
  const user = "0x1111111111111111111111111111111111111111";
  const usdc = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

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
      rescuer: "desk_01",
      executor: "0x2222222222222222222222222222222222222222",
    },
    position: {
      chainId: 11155111,
      positionOwner: user,
      debtAsset: usdc,
    },
    authority: {
      allowedActions: ["repay" as const],
      capitalCapUsd: 25.0,
      perActionCapUsd: 15.0,
      dailyCapUsd: 25.0,
      adaptiveBands: [
        { hfMin: 1.15, hfExcl: 1.25, maxCapitalUsd: 15.0 },
      ],
      hfFloor: 1.05,
    },
    conditions: {
      hfTriggerBelow: 1.25,
      recoveryHf: 1.50,
      maxDebtChangePct: 0.20,
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
        hf: 1.18,
        debtUsd: 500.0,
        priceUsd: 1.0,
        debtTokenBalance: "500000000",
        timestamp: "2026-09-14T00:00:00.000Z",
      },
      capacityReservedUsd: 15.0,
      dailySpentUsd: 15.0,
      totalSpentUsd: 15.0,
      executionCount: 1,
    },
  };

  const { grantHash, grantId } = computeGrantHash(rawGrantCore);
  const grant = { ...rawGrantCore, grantHash, grantId };

  const intent = {
    action: "repay" as const,
    asset: usdc,
    amountUsd: 15.0,
    chainId: 11155111,
    positionOwner: user,
  };
  const intentHash = computeIntentHash(intent);

  const authorizedIntent = {
    grantId,
    authorityHash: "0xauth_test_123",
    intentHash,
    action: "repay" as const,
    asset: usdc,
    authorizedAmountUsd: 15.0,
    amountWei: "15000000",
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
    timestamp: "2026-09-14T00:09:00.000Z",
    sources: {
      userAccountData: "KEEPERHUB FACT" as const,
      reserveTokens: "KEEPERHUB FACT" as const,
      debtBalance: "KEEPERHUB FACT" as const,
      price: "KEEPERHUB FACT" as const,
      decimals: "KEEPERHUB FACT" as const,
    },
  };

  const goldenBundle: PoaaBundle = {
    bundleVersion: "2.0",
    grant,
    creationSnapshot: grant.state.creationSnapshot,
    intent,
    intentHash,
    authorizedIntent,
    authorityHash: "0xauth_test_123",
    execution: {
      executionId: "exec_golden_01",
      grantId,
      authorityHash: "0xauth_test_123",
      action: "repay",
      amountUsd: 15.0,
      amountWei: "15000000",
      status: "verified",
      simulatedAt: "2026-09-14T00:09:30.000Z",
      submittedAt: "2026-09-14T00:10:00.000Z",
      minedAt: "2026-09-14T00:10:15.000Z",
      verifiedAt: "2026-09-14T00:10:20.000Z",
      txHash: "0x" + "1".repeat(64),
      blockNumber: 6000000,
      gasUsed: "150000",
      preHealthFactor: 1.18,
      postHealthFactor: 2.03,
      receiptVerified: true,
      independentReceiptVerified: true,
    },
    receipts: [
      {
        hash: "0x" + "1".repeat(64),
        chainId: 11155111,
        verified: true,
        receiptStatus: "success",
        blockNumber: 6000000,
        gasUsed: "150000",
        verifiedAt: "2026-09-14T00:10:20.000Z",
      },
    ],
    snapshots: {
      before: baseSnapshot,
      after: {
        ...baseSnapshot,
        healthFactor: 2.03,
        totalDebtUsd: 485.0,
        debtTokenBalanceHuman: 485.0,
        timestamp: "2026-09-14T00:10:25.000Z",
      },
    },
    policy,
    exportedAt: "2026-09-14T00:11:00.000Z",
  };

  it("evaluates golden bundle as PROVEN (11/11 checks passed)", () => {
    const report = verifyPoaaBundle(goldenBundle);
    expect(report.verdict).toBe("PROVEN");
    expect(report.passedCount).toBe(11);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it("BROKEN (check 1): detects tampered grant hash", () => {
    const tampered = structuredClone(goldenBundle);
    tampered.grant.authority.capitalCapUsd = 9999; // Tampered authority!
    const report = verifyPoaaBundle(tampered);
    expect(report.verdict).toBe("BROKEN (check 1)");
    expect(report.checks[0]?.passed).toBe(false);
  });

  it("BROKEN (check 2): detects missing owner approval", () => {
    const tampered = structuredClone(goldenBundle);
    tampered.grant.approvedAt = undefined;
    const report = verifyPoaaBundle(tampered);
    expect(report.verdict).toBe("BROKEN (check 2)");
  });

  it("BROKEN (check 4): detects tampered agent intent", () => {
    const tampered = structuredClone(goldenBundle);
    tampered.intent.amountUsd = 999; // Mutated intent amount!
    const report = verifyPoaaBundle(tampered);
    expect(report.verdict).toBe("BROKEN (check 4)");
  });

  it("BROKEN (check 5): detects execution exceeding grant cap", () => {
    const tampered = structuredClone(goldenBundle);
    tampered.execution.amountUsd = 20.0; // Exceeds band cap $15!
    const report = verifyPoaaBundle(tampered);
    expect(report.verdict).toBe("BROKEN (check 5)");
  });

  it("BROKEN (check 6): detects execution without simulate-first", () => {
    const tampered = structuredClone(goldenBundle);
    tampered.execution.simulatedAt = undefined;
    const report = verifyPoaaBundle(tampered);
    expect(report.verdict).toBe("BROKEN (check 6)");
  });

  it("BROKEN (check 7): detects execution of expired grant", () => {
    const tampered = structuredClone(goldenBundle);
    tampered.execution.submittedAt = "2026-09-20T00:00:00.000Z"; // After expiresAt 2026-09-18
    const report = verifyPoaaBundle(tampered);
    expect(report.verdict).toBe("BROKEN (check 7)");
  });

  it("BROKEN (check 9): detects unverified KeeperHub receipt", () => {
    const tampered = structuredClone(goldenBundle);
    tampered.receipts[0]!.verified = false;
    const report = verifyPoaaBundle(tampered);
    expect(report.verdict).toBe("BROKEN (check 9)");
  });

  it("BROKEN (check 11): detects post-HF not improved", () => {
    const tampered = structuredClone(goldenBundle);
    tampered.snapshots.after.healthFactor = 1.10; // Post-HF dropped from 1.18 to 1.10!
    const report = verifyPoaaBundle(tampered);
    expect(report.verdict).toBe("BROKEN (check 11)");
  });

  it("verifies immutable on-chain Sepolia rescue fixture is PROVEN (11/11)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fixturePath = path.resolve(process.cwd(), "test/fixtures/live-sepolia-proof.json");

    expect(fs.existsSync(fixturePath)).toBe(true);
    const raw = fs.readFileSync(fixturePath, "utf-8");
    const bundle = JSON.parse(raw);

    const report = verifyPoaaBundle(bundle);
    expect(report.verdict).toBe("PROVEN");
    expect(report.passedCount).toBe(11);
    expect(report.totalChecks).toBe(11);
  });
});
