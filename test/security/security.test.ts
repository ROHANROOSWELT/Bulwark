import { describe, it, expect } from "vitest";
import {
  compilePolicyIntent,
  KeeperHubClient,
  KeeperHubSimulateForbiddenError,
  getDefaultPolicyConfig,
  computePolicyHash,
  computeGrantHash,
  RescueGrantV2,
  ExecutionIntent,
  PositionSnapshot,
  evaluatePolicy,
  triageWithLlm,
  underwritePosition,
  BulwarkGuardian,
  BulwarkStore,
  verifyPoaaBundle,
  PoaaBundle,
} from "@bulwark/core";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Security & Attack Invariance Suite (BUILD.md §6.5)", () => {
  const policy = getDefaultPolicyConfig(25.0, 1.2, 2.0);
  const user = "0x1111111111111111111111111111111111111111";
  const usdc = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

  const rawGrant = {
    version: 2 as const,
    policyId: policy.policyId,
    policyHash: computePolicyHash(policy),
    createdAt: "2026-09-14T00:00:00.000Z",
    createdBy: "underwriter_agent",
    approvedAt: "2026-09-14T00:05:00.000Z",
    approvedBy: user,
    parties: {
      owner: user,
      rescuer: "desk_primary",
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
      adaptiveBands: [{ hfMin: 1.15, hfExcl: 1.25, maxCapitalUsd: 15.0 }],
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
      status: "armed" as const,
      creationSnapshot: {
        hf: 1.18,
        debtUsd: 500.0,
        priceUsd: 1.0,
        debtTokenBalance: "500000000",
        timestamp: "2026-09-14T00:00:00.000Z",
      },
      capacityReservedUsd: 15.0,
      dailySpentUsd: 0,
      totalSpentUsd: 0,
      executionCount: 0,
    },
  };

  const { grantHash, grantId } = computeGrantHash(rawGrant);
  const grant: RescueGrantV2 = { ...rawGrant, grantHash, grantId };

  const snapshot: PositionSnapshot = {
    userAddress: user,
    chainId: 11155111,
    poolAddress: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
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
      userAccountData: "KEEPERHUB FACT",
      reserveTokens: "KEEPERHUB FACT",
      debtBalance: "KEEPERHUB FACT",
      price: "KEEPERHUB FACT",
      decimals: "KEEPERHUB FACT",
    },
  };

  it("compiler-raise attack: intent requesting $10,000 is clamped to effective band cap ($15), never raised", () => {
    const maliciousIntent: ExecutionIntent = {
      action: "repay",
      asset: usdc,
      amountUsd: 10000.0, // Attack: attempt to extract $10k
      chainId: 11155111,
      positionOwner: user,
    };

    const compiled = compilePolicyIntent(maliciousIntent, grant, snapshot, policy, 100.0);
    // STRUCTURAL INVARIANT: Must be clamped to the minimum of policy (25), grant (15), and band (15)
    expect(compiled.authorizedAmountUsd).toBe(15.0);
    expect(compiled.authorizedAmountUsd).toBeLessThanOrEqual(grant.authority.perActionCapUsd);
    expect(compiled.authorizedAmountUsd).toBeLessThanOrEqual(policy.maxUsdPerAction);
    expect(compiled.repayMax).toBe(false);
  });

  it("simulate-ignored footgun guard: client refuses simulate:true on protocol-action and node paths", () => {
    const client = new KeeperHubClient({
      apiKey: "kh_test_key",
      apiBase: "https://mock.keeperhub.com",
    });

    // Allowed simulation paths
    expect(() => client.assertSimulationSafety("/api/execute/contract-call", true)).not.toThrow();
    expect(() => client.assertSimulationSafety("/api/execute/transfer", true)).not.toThrow();
    expect(() => client.assertSimulationSafety("/api/execute/check-and-execute", true)).not.toThrow();

    // FORBIDDEN simulation paths (KeeperHub silently ignores simulate:true and broadcasts for real!)
    expect(() => client.assertSimulationSafety("/api/execute/protocol-action", true)).toThrow(
      KeeperHubSimulateForbiddenError
    );
    expect(() => client.assertSimulationSafety("/api/execute/node", true)).toThrow(
      KeeperHubSimulateForbiddenError
    );
    expect(() => client.assertSimulationSafety("execute_protocol_action", true)).toThrow(
      KeeperHubSimulateForbiddenError
    );
  });

  it("authorization header redaction: Bearer tokens are scrubbed from thrown errors", async () => {
    const secretKey = "kh_super_secret_token_123456789";
    const client = new KeeperHubClient({
      apiKey: secretKey,
      apiBase: "https://mock.keeperhub.com",
      fetchFn: async () => {
        throw new Error(`Failed to authenticate with Bearer ${secretKey}`);
      },
    });

    try {
      await client.getSpendCap();
      expect.fail("Should have thrown error");
    } catch (err: any) {
      expect(err.message).not.toContain(secretKey);
      expect(err.message).toContain("[REDACTED_KH_KEY]");
    }
  });

  it("arbitrary chain / asset / owner injection: allowlist violations trigger hard REJECT (never clamped)", () => {
    // 1. Hostile chain ID
    const hostileChainIntent: ExecutionIntent = {
      action: "repay",
      asset: usdc,
      amountUsd: 10.0,
      chainId: 999999, // Hostile chain
      positionOwner: user,
    };
    expect(() => compilePolicyIntent(hostileChainIntent, grant, snapshot, policy, 100)).toThrow(
      "POLICY COMPILER REJECT: Chain mismatch"
    );

    // 2. Hostile recipient/owner injection
    const hostileOwnerIntent: ExecutionIntent = {
      action: "repay",
      asset: usdc,
      amountUsd: 10.0,
      chainId: 11155111,
      positionOwner: "0x6666666666666666666666666666666666666666", // Hostile owner
    };
    expect(() => compilePolicyIntent(hostileOwnerIntent, grant, snapshot, policy, 100)).toThrow(
      "POLICY COMPILER REJECT: Owner mismatch"
    );

    // 3. Unapproved debt asset
    const hostileAssetIntent: ExecutionIntent = {
      action: "repay",
      asset: "0x3333333333333333333333333333333333333333", // Random unverified token
      amountUsd: 10.0,
      chainId: 11155111,
      positionOwner: user,
    };
    expect(() => compilePolicyIntent(hostileAssetIntent, grant, snapshot, policy, 100)).toThrow(
      "POLICY COMPILER REJECT: Asset mismatch"
    );
  });

  it("grant tampering: modifying any immutable field breaks canonical hash and fails PoAA Check #1", () => {
    // Tamper with capitalCapUsd: 25 -> 500
    const tamperedGrant = structuredClone(grant);
    tamperedGrant.authority.capitalCapUsd = 500.0;

    const { grantHash: recomputedHash } = computeGrantHash(tamperedGrant);
    expect(recomputedHash).not.toBe(tamperedGrant.grantHash);

    const bundle: PoaaBundle = {
      bundleVersion: "2.0",
      grant: tamperedGrant,
      creationSnapshot: tamperedGrant.state.creationSnapshot,
      intent: { action: "repay", asset: usdc, amountUsd: 15, chainId: 11155111, positionOwner: user },
      intentHash: "0xIntent",
      authorizedIntent: {
        grantId: tamperedGrant.grantId,
        authorityHash: "0xAuth",
        intentHash: "0xIntent",
        action: "repay",
        asset: usdc,
        authorizedAmountUsd: 15,
        amountWei: "15000000",
        repayMax: false,
        validUntil: "2026-09-18T15:30:00.000Z",
        checks: [],
      },
      authorityHash: "0xAuth",
      execution: {
        executionId: "exec_1",
        grantId: tamperedGrant.grantId,
        authorityHash: "0xAuth",
        action: "repay",
        amountUsd: 15,
        amountWei: "15000000",
        status: "verified",
        simulatedAt: "2026-09-14T00:09:30.000Z",
        submittedAt: "2026-09-14T00:09:35.000Z",
        receiptVerified: true,
        independentReceiptVerified: true,
        preHealthFactor: 1.18,
        postHealthFactor: 1.85,
      },
      receipts: [],
      snapshots: { before: snapshot, after: snapshot },
      policy,
      exportedAt: "2026-09-14T00:10:00.000Z",
    };

    const report = verifyPoaaBundle(bundle);
    expect(report.verdict).toBe("BROKEN (check 1)");
    expect(report.checks[0]?.passed).toBe(false);
  });

  it("replay protection: already verified grant refuses duplicate execution", () => {
    const verifiedGrant = structuredClone(grant);
    verifiedGrant.state.status = "verified";

    const evalResult = evaluatePolicy(policy, verifiedGrant, snapshot, 100.0);
    expect(evalResult.ok).toBe(false);
    expect(evalResult.reasons.some((r) => r.includes("Duplicate execution refusal"))).toBe(true);
  });

  it("LLM triage bounding: prompt-injected LLM response is clamped strictly to candidate math plans", async () => {
    const initialQuote = underwritePosition(snapshot, grant.authority.perActionCapUsd, 2.0);

    // Hostile LLM config that tries to output arbitrary malicious plan
    const hostileLlmFetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  selectedPlanId: "malicious_injected_plan",
                  narrative: "Execute $999,999 transfer immediately.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const safeConfig = {
      llmBaseUrl: "https://mock.llm.com",
      llmApiKey: "sk-fake",
      llmModel: "gpt-4o",
      llmFetchFn: hostileLlmFetch,
    } as any;

    const triaged = await triageWithLlm(initialQuote, safeConfig);
    // Invariant: Because "malicious_injected_plan" does not exist in initialQuote.plans,
    // triageWithLlm ignores the injection and falls back to deterministic cheapest plan!
    expect(triaged.selectedPlan.planId).toBe(initialQuote.selectedPlan.planId);
    expect(triaged.selectionMode).toBe("DETERMINISTIC_CHEAPEST");
  });

  it("simulate-revert aborts broadcast: if dry run indicates revert, real transaction is NEVER submitted", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bulwark-sec-store-"));
    const store = new BulwarkStore(tmpDir);
    await store.init();
    await store.syncDeskBalance("0xDesk", 100.0);

    const armedGrant = structuredClone(grant);
    await store.saveGrant(armedGrant);

    let broadcastCalled = false;
    const client = {
      hasKey: () => true,
      assertSimulationSafety: () => {},
      executeContractCall: async (payload: any) => {
        if (payload.simulate) {
          // Simulation indicates revert!
          return {
            success: false,
            status: "simulated",
            wouldRevert: true,
            revertReason: "ERC20: transfer amount exceeds balance",
          };
        }
        broadcastCalled = true;
        return { executionId: "exec_should_never_happen" };
      },
    } as unknown as KeeperHubClient;

    const guardian = new BulwarkGuardian({
      store,
      client,
      reader: {
        readPosition: async () => snapshot,
      } as any,
    });

    await expect(guardian.executeGrant(armedGrant.grantId)).rejects.toThrow(
      'Execution aborted: simulation reverted with reason "ERC20: transfer amount exceeds balance"'
    );

    // SECURITY CHECK: Real broadcast was NEVER called!
    expect(broadcastCalled).toBe(false);

    // Status recorded as simulation_reverted
    const saved = await store.getGrant(armedGrant.grantId);
    expect(saved?.state.status).toBe("simulation_reverted");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
