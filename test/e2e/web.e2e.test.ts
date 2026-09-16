import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { createWebServer } from "@bulwark/web";
import {
  BulwarkGuardian,
  BulwarkStore,
  KeeperHubClient,
  AavePositionReader,
  PoaaBundle,
  getDefaultPolicyConfig,
  computePolicyHash,
  computeGrantHash,
  computeIntentHash,
} from "@bulwark/core";

describe("BULWARK Web Dashboard & Public /verify (P11)", () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;
  let tmpDir: string;
  let store: BulwarkStore;
  let guardian: BulwarkGuardian;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bulwark-web-test-"));
    store = new BulwarkStore(tmpDir);
    await store.init();

    // Seed desk capacity
    await store.syncDeskBalance("0x1111111111111111111111111111111111111111", 500.0);

    const user = "0x0000000000000000000000000000000000000001";
    const usdc = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

    const mockClient = {
      hasKey: () => true,
      assertSimulationSafety: () => {},
      executeContractCall: async (payload: any) => {
        if (payload.simulate) {
          return {
            success: true,
            status: "simulated",
            gasEstimate: "180000",
            wouldRevert: false,
          };
        }
        return {
          executionId: "exec_fixture_web",
          status: "completed",
          transactionHash: "0x" + "a".repeat(64),
          receipts: [
            {
              hash: "0x" + "a".repeat(64),
              chainId: 11155111,
              verified: true,
              receiptStatus: "success",
              blockNumber: 7000000,
              gasUsed: "125000",
            },
          ],
        };
      },
      getExecutionStatus: async (executionId: string) => ({
        data: {
          executionId,
          status: "completed" as const,
          transactionHash: "0x" + "a".repeat(64),
          receipts: [
            {
              hash: "0x" + "a".repeat(64),
              chainId: 11155111,
              verified: true,
              receiptStatus: "success",
              blockNumber: 7000000,
              gasUsed: "125000",
            },
          ],
        },
        pollIntervalHintSeconds: 1,
      }),
    } as unknown as KeeperHubClient;

    const mockReader = {
      readPosition: async (): Promise<PositionSnapshot> => ({
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
        timestamp: new Date().toISOString(),
        sources: {
          userAccountData: "KEEPERHUB FACT",
          reserveTokens: "KEEPERHUB FACT",
          debtBalance: "KEEPERHUB FACT",
          price: "KEEPERHUB FACT",
          decimals: "KEEPERHUB FACT",
        },
      }),
      callView: async () => ({ resultHex: "0x", source: "KEEPERHUB FACT" }),
    } as unknown as AavePositionReader;

    guardian = new BulwarkGuardian({
      store,
      client: mockClient,
      reader: mockReader,
    });
    await guardian.init();

    server = createWebServer({
      guardian,
      watchlist: ["0x0000000000000000000000000000000000000001"],
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 4567;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("serves static pages: / (index.html) and /verify (verify.html) with style.css", async () => {
    // 1. GET /
    const resHome = await fetch(`${baseUrl}/`);
    expect(resHome.status).toBe(200);
    const htmlHome = await resHome.text();
    expect(htmlHome).toContain("BULWARK");
    expect(htmlHome).toContain("dashboard-grid");

    // 2. GET /verify
    const resVerify = await fetch(`${baseUrl}/verify`);
    expect(resVerify.status).toBe(200);
    const htmlVerify = await resVerify.text();
    expect(htmlVerify).toContain("Proof of Authorized Agency (PoAA) Independent Verifier");

    // 3. GET /style.css
    const resCss = await fetch(`${baseUrl}/style.css`);
    expect(resCss.status).toBe(200);
    const css = await resCss.text();
    expect(css).toContain("overflow: hidden");
    expect(css).toContain("chip-keeperhub");
  });

  it("serves GET /api/state and verifies zero secrets leaked", async () => {
    const res = await fetch(`${baseUrl}/api/state`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.chainId).toBeDefined();
    expect(data.hasKey).toBe(true);
    expect(data.capacity).toBeDefined();
    expect(data.capacity.deskBalanceUsd).toBe(500.0);
    expect(data.reputation).toBeDefined();
    expect(Array.isArray(data.grants)).toBe(true);
    expect(Array.isArray(data.executions)).toBe(true);
    expect(Array.isArray(data.audit)).toBe(true);

    // SECURITY CHECK: Ensure API keys are never leaked to client!
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("kh_test_key");
    expect(serialized).not.toContain("apiKey");
  });

  it("handles POST /api/tick", async () => {
    const operatorKey = process.env.BULWARK_OPERATOR_KEY;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (operatorKey) headers["x-operator-key"] = operatorKey;
    const res = await fetch(`${baseUrl}/api/tick`, { method: "POST", headers });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scanned).toBeDefined();
  });

  it("handles full grant lifecycle via API: approve, dry, revoke", async () => {
    // Propose a grant first
    const grant = await guardian.proposeRescueGrant("0x0000000000000000000000000000000000000001", 11155111, {
      capitalCapUsd: 25.0,
      perActionCapUsd: 15.0,
    });
    expect(grant.state.status).toBe("proposed");

    const operatorKey = process.env.BULWARK_OPERATOR_KEY;
    const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (operatorKey) authHeaders["x-operator-key"] = operatorKey;

    // 1. POST /api/grants/:id/approve
    const approveRes = await fetch(`${baseUrl}/api/grants/${grant.grantId}/approve`, { method: "POST", headers: authHeaders });
    expect(approveRes.status).toBe(200);
    const approvedData = await approveRes.json();
    expect(approvedData.state.status).toBe("armed");

    // 2. POST /api/grants/:id/dry
    const dryRes = await fetch(`${baseUrl}/api/grants/${grant.grantId}/dry`, { method: "POST", headers: authHeaders });
    expect(dryRes.status).toBe(200);
    const dryData = await dryRes.json();
    expect(dryData.wouldRevert).toBe(false);

    // 3. POST /api/grants/:id/revoke
    const revokeRes = await fetch(`${baseUrl}/api/grants/${grant.grantId}/revoke`, { method: "POST", headers: authHeaders });
    expect(revokeRes.status).toBe(200);
    const revokeData = await revokeRes.json();
    expect(revokeData.state.status).toBe("revoked");
  });

  it("handles POST /api/proof/verify on golden bundle returning PROVEN (11/11)", async () => {
    const policy = getDefaultPolicyConfig(25, 1.2, 2.0);
    const policyHash = computePolicyHash(policy);
    const user = "0x1111111111111111111111111111111111111111";
    const usdc = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

    const rawCore = {
      version: 2 as const,
      policyId: policy.policyId,
      policyHash,
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
        adaptiveBands: [{ hfMin: 1.15, hfExcl: 1.25, maxCapitalUsd: 15.0 }],
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

    const { grantHash, grantId } = computeGrantHash(rawCore);
    const grant = { ...rawCore, grantHash, grantId };

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
      authorityHash: "0xauth_test_web",
      intentHash,
      action: "repay" as const,
      asset: usdc,
      authorizedAmountUsd: 15.0,
      amountWei: "15000000",
      repayMax: false,
      validUntil: "2026-09-14T01:00:00.000Z",
      checks: [],
    };

    const goldenBundle: PoaaBundle = {
      bundleVersion: "2.0",
      grant,
      creationSnapshot: grant.state.creationSnapshot,
      intent,
      intentHash,
      authorizedIntent,
      authorityHash: "0xauth_test_web",
      execution: {
        executionId: "exec_golden_web",
        grantId,
        authorityHash: "0xauth_test_web",
        action: "repay",
        amountUsd: 15.0,
        amountWei: "15000000",
        status: "verified",
        simulatedAt: "2026-09-14T00:09:30.000Z",
        submittedAt: "2026-09-14T00:09:35.000Z",
        receiptVerified: true,
        independentReceiptVerified: true,
        txHash: "0xRealTxHashWeb",
        blockNumber: 1234567,
        preHealthFactor: 1.18,
        postHealthFactor: 1.95,
      },
      receipts: [
        {
          hash: "0xRealTxHashWeb",
          chainId: 11155111,
          verified: true,
          receiptStatus: "success",
          blockNumber: 1234567,
        },
      ],
      snapshots: {
        before: {
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
            userAccountData: "KEEPERHUB FACT",
            reserveTokens: "KEEPERHUB FACT",
            debtBalance: "KEEPERHUB FACT",
            price: "KEEPERHUB FACT",
            decimals: "KEEPERHUB FACT",
          },
        },
        after: {
          userAddress: user,
          chainId: 11155111,
          poolAddress: "0xpool",
          debtAssetAddress: usdc,
          debtSymbol: "USDC",
          debtDecimals: 6,
          totalCollateralBase: 100000000000n,
          totalDebtBase: 48500000000n,
          availableBorrowsBase: 12000000000n,
          currentLiquidationThresholdBps: 8000,
          ltvBps: 7500,
          healthFactorWad: 1950000000000000000n,
          healthFactor: 1.95,
          totalCollateralUsd: 1000.0,
          totalDebtUsd: 485.0,
          debtTokenBalance: 485000000n,
          debtTokenBalanceHuman: 485.0,
          assetPriceBase: 100000000n,
          assetPriceUsd: 1.0,
          timestamp: "2026-09-14T00:10:00.000Z",
          sources: {
            userAccountData: "KEEPERHUB FACT",
            reserveTokens: "KEEPERHUB FACT",
            debtBalance: "KEEPERHUB FACT",
            price: "KEEPERHUB FACT",
            decimals: "KEEPERHUB FACT",
          },
        },
      },
      policy,
      exportedAt: "2026-09-14T00:11:00.000Z",
    };

    const res = await fetch(`${baseUrl}/api/proof/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle: goldenBundle }, (k, v) => (typeof v === "bigint" ? v.toString() : v)),
    });

    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.verdict).toBe("PROVEN");
    expect(report.passedCount).toBe(11);
    expect(report.totalChecks).toBe(11);
  });

  it("enforces operator authentication on mutating endpoints when operatorKey is configured", async () => {
    const authServer = createWebServer({
      guardian,
      operatorKey: "secret-op-key-123",
      watchlist: ["0x0000000000000000000000000000000000000001"],
    });

    let authPort: number = 0;
    await new Promise<void>((resolve) => {
      authServer.listen(0, "127.0.0.1", () => {
        const addr = authServer.address();
        authPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });

    const authUrl = `http://127.0.0.1:${authPort}`;

    try {
      // 1. Unauthenticated mutating request to /api/tick -> 401
      const unauthTick = await fetch(`${authUrl}/api/tick`, { method: "POST" });
      expect(unauthTick.status).toBe(401);
      const unauthTickData = await unauthTick.json();
      expect(unauthTickData.error).toContain("Operator authorization required");

      // 2. Unauthenticated mutating request to /api/grants/propose -> 401
      const unauthPropose = await fetch(`${authUrl}/api/grants/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "0x0000000000000000000000000000000000000001" }),
      });
      expect(unauthPropose.status).toBe(401);

      // 3. Unauthenticated mutating request to nonexistent grant execute -> 401 before looking up grant!
      const unauthExec = await fetch(`${authUrl}/api/grants/does_not_exist/execute`, { method: "POST" });
      expect(unauthExec.status).toBe(401);

      // 4. Authenticated request with x-operator-key -> 200
      const authTick = await fetch(`${authUrl}/api/tick`, {
        method: "POST",
        headers: { "x-operator-key": "secret-op-key-123" },
      });
      expect(authTick.status).toBe(200);

      // 5. Authenticated request with Bearer Authorization -> 200
      const authTickBearer = await fetch(`${authUrl}/api/tick`, {
        method: "POST",
        headers: { authorization: "Bearer secret-op-key-123" },
      });
      expect(authTickBearer.status).toBe(200);
    } finally {
      authServer.closeAllConnections?.();
      await new Promise<void>((resolve) => authServer.close(() => resolve()));
    }
  });
});
