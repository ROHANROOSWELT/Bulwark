import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli } from "../../packages/cli/src/index.js";
import { PoaaBundle, computePolicyHash, getDefaultPolicyConfig } from "@bulwark/core";

describe("BULWARK CLI (P9)", () => {
  let tmpDir: string;
  let stdoutLogs: string[] = [];
  let stderrLogs: string[] = [];

  const captureStdout = (msg: string) => stdoutLogs.push(msg);
  const captureStderr = (msg: string) => stderrLogs.push(msg);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bulwark-cli-test-"));
    process.env.BULWARK_STORE_DIR = tmpDir;
    process.env.BULWARK_CHAIN_ID = "11155111";
    // Seed real desk capacity so approval and armed transitions succeed
    fs.writeFileSync(
      path.join(tmpDir, "capacity.json"),
      JSON.stringify({
        deskWalletAddress: "0x1111111111111111111111111111111111111111",
        deskBalanceUsd: 1000.0,
        reservedUsd: 0,
        availableUsd: 1000.0,
        reservations: {},
        lastUpdated: new Date().toISOString(),
      })
    );
    stdoutLogs = [];
    stderrLogs = [];
  });

  afterEach(() => {
    delete process.env.BULWARK_STORE_DIR;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("prints help on --help and -h", async () => {
    const code1 = await runCli(["--help"], { stdout: captureStdout, stderr: captureStderr });
    expect(code1).toBe(0);
    expect(stdoutLogs.join("\n")).toContain("BULWARK CLI");
    expect(stdoutLogs.join("\n")).toContain("COMMANDS:");

    stdoutLogs = [];
    const code2 = await runCli(["-h"], { stdout: captureStdout, stderr: captureStderr });
    expect(code2).toBe(0);
    expect(stdoutLogs.join("\n")).toContain("BULWARK CLI");
  });

  it("prints version on --version", async () => {
    const code = await runCli(["--version"], { stdout: captureStdout, stderr: captureStderr });
    expect(code).toBe(0);
    expect(stdoutLogs.join("\n")).toContain("bulwark v0.1.0");
  });

  it("runs doctor command and reports environment and store status", async () => {
    const code = await runCli(["doctor"], { stdout: captureStdout, stderr: captureStderr });
    expect(code).toBe(0);
    const output = stdoutLogs.join("\n");
    expect(output).toContain("=== BULWARK DOCTOR ===");
    expect(output).toContain("[CHAIN READ] Configured Chain ID: 11155111");
    expect(output).toContain("[POLICY INVARIANT] Store: OK");
  });

  it("runs keys check command (handles absence of key)", async () => {
    delete process.env.KEEPERHUB_API_KEY;
    const code = await runCli(["keys", "check"], { stdout: captureStdout, stderr: captureStderr });
    expect(code).toBe(0);
    expect(stdoutLogs.join("\n")).toContain("[UNAVAILABLE] KEEPERHUB_API_KEY is not set.");
  });

  it("runs positions scan command", async () => {
    const code = await runCli(
      ["positions", "scan", "--address", "0x0000000000000000000000000000000000000001"],
      { stdout: captureStdout, stderr: captureStderr }
    );
    expect(code).toBe(0);
    const output = stdoutLogs.join("\n");
    expect(output).toContain("Health Factor:");
    expect(output).toContain("Collateral USD:");
    expect(output).toContain("Debt USD:");
  });

  it("runs full grants lifecycle via CLI: propose, list, show, approve, revoke", async () => {
    // 1. Propose
    const proposeCode = await runCli(
      ["grants", "propose", "--address", "0x0000000000000000000000000000000000000001", "--amount", "20"],
      { stdout: captureStdout, stderr: captureStderr }
    );
    expect(proposeCode).toBe(0);
    const proposeOut = stdoutLogs.join("\n");
    expect(proposeOut).toContain("[AGENT OUTPUT] Proposed RescueGrant:");
    expect(proposeOut).toContain("[POLICY INVARIANT] Canonical Grant Hash:");
    expect(proposeOut).toContain("Grants in 'proposed' state NEVER execute without explicit human owner approval");

    // Extract grantId
    const match = proposeOut.match(/Proposed RescueGrant: (bg_[a-zA-Z0-9_-]+)/);
    expect(match).toBeTruthy();
    const grantId = match![1];

    // 2. List
    stdoutLogs = [];
    const listCode = await runCli(["grants", "list"], { stdout: captureStdout, stderr: captureStderr });
    expect(listCode).toBe(0);
    expect(stdoutLogs.join("\n")).toContain(grantId);
    expect(stdoutLogs.join("\n")).toContain("[PROPOSED]");

    // 3. Show
    stdoutLogs = [];
    const showCode = await runCli(["grants", "show", grantId], { stdout: captureStdout, stderr: captureStderr });
    expect(showCode).toBe(0);
    const showOut = stdoutLogs.join("\n");
    expect(showOut).toContain(`=== RESCUE GRANT ${grantId} ===`);
    expect(showOut).toContain("[POLICY INVARIANT] Status: proposed");
    expect(showOut).toContain("[POLICY INVARIANT] Adaptive Bands:");

    // 4. Approve
    stdoutLogs = [];
    const approveCode = await runCli(["grants", "approve", grantId], { stdout: captureStdout, stderr: captureStderr });
    expect(approveCode).toBe(0);
    const approveOut = stdoutLogs.join("\n");
    expect(approveOut).toContain("approved by owner");
    expect(approveOut).toContain("New status: armed");

    // 5. Revoke
    stdoutLogs = [];
    const revokeCode = await runCli(["grants", "revoke", grantId], { stdout: captureStdout, stderr: captureStderr });
    expect(revokeCode).toBe(0);
    expect(stdoutLogs.join("\n")).toContain("New status: revoked");
  });

  it("runs workflow compile command", async () => {
    // First propose and approve a grant
    await runCli(
      ["grants", "propose", "--address", "0x0000000000000000000000000000000000000001", "--amount", "15"],
      { stdout: captureStdout, stderr: captureStderr }
    );
    const out = stdoutLogs.join("\n");
    const match = out.match(/Proposed RescueGrant: (bg_[a-zA-Z0-9_-]+)/);
    const grantId = match![1];
    await runCli(["grants", "approve", grantId], { stdout: captureStdout, stderr: captureStderr });

    // Workflow compile
    stdoutLogs = [];
    const outFile = path.join(tmpDir, "workflow.json");
    const compileCode = await runCli(["workflow", "compile", grantId, "--out", outFile], {
      stdout: captureStdout,
      stderr: captureStderr,
    });
    expect(compileCode).toBe(0);
    expect(fs.existsSync(outFile)).toBe(true);
    const json = JSON.parse(fs.readFileSync(outFile, "utf-8"));
    expect(json.directCall).toBeDefined();
    expect(json.standingWorkflow).toBeDefined();
    expect(json.standingWorkflow.nodes.length).toBeGreaterThan(0);
  });

  it("runs desk tick command", async () => {
    stdoutLogs = [];
    const tickCode = await runCli(["desk", "tick", "--once"], { stdout: captureStdout, stderr: captureStderr });
    expect(tickCode).toBe(0);
    expect(stdoutLogs.join("\n")).toContain("[POLICY INVARIANT] Desk tick completed");
  });

  it("runs audit export command", async () => {
    // Perform an action to create an audit record
    await runCli(
      ["grants", "propose", "--address", "0x0000000000000000000000000000000000000001"],
      { stdout: captureStdout, stderr: captureStderr }
    );

    stdoutLogs = [];
    const auditFile = path.join(tmpDir, "audit.jsonl");
    const auditCode = await runCli(["audit", "export", "--out", auditFile], {
      stdout: captureStdout,
      stderr: captureStderr,
    });
    expect(auditCode).toBe(0);
    expect(fs.existsSync(auditFile)).toBe(true);
    const content = fs.readFileSync(auditFile, "utf-8");
    expect(content).toContain("GRANT_PROPOSED");
  });

  it("runs proof verify command on a golden bundle", async () => {
    // Generate valid PoaaBundle
    const policy = getDefaultPolicyConfig();
    const policyHash = computePolicyHash(policy);
    const goldenBundle: PoaaBundle = {
      bundleVersion: "2.0",
      grant: {
        version: 2,
        grantId: "grant_golden_cli",
        grantHash: "0x1234",
        policyId: policy.policyId,
        policyHash,
        createdAt: "2026-09-14T00:00:00Z",
        createdBy: "underwriter_agent",
        approvedAt: "2026-09-14T00:05:00Z",
        approvedBy: "0xOwner",
        parties: {
          owner: "0xOwner",
          rescuer: "0xDesk",
          executor: "0xExecutor",
        },
        position: {
          chainId: 11155111,
          positionOwner: "0xOwner",
          debtAsset: "0xDebt",
        },
        authority: {
          allowedActions: ["repay"],
          capitalCapUsd: 100,
          perActionCapUsd: 50,
          dailyCapUsd: 100,
          adaptiveBands: [{ hfMin: 1.0, hfExcl: 1.5, maxCapitalUsd: 50 }],
          hfFloor: 1.05,
        },
        conditions: {
          hfTriggerBelow: 1.2,
          recoveryHf: 2.0,
          maxDebtChangePct: 0.2,
          priceBandPct: 0.15,
          expiresAt: "2026-09-18T00:00:00Z",
        },
        premium: {
          curveId: "bulwark-curve-v1",
          baseUsd: 0.5,
          rateBps: 200,
          settlement: "BOOKKEEPING",
        },
        state: {
          status: "settled",
          creationSnapshot: {
            hf: 1.15,
            debtUsd: 1000,
            priceUsd: 1.0,
            debtTokenBalance: "1000000000",
            timestamp: "2026-09-14T00:00:00Z",
          },
          capacityReservedUsd: 0,
          dailySpentUsd: 25,
          totalSpentUsd: 25,
          executionCount: 1,
        },
      },
      creationSnapshot: {
        hf: 1.15,
        debtUsd: 1000,
        priceUsd: 1.0,
        debtTokenBalance: "1000000000",
        timestamp: "2026-09-14T00:00:00Z",
      },
      intent: {
        action: "repay",
        asset: "0xDebt",
        amountUsd: 25,
        chainId: 11155111,
        positionOwner: "0xOwner",
      },
      intentHash: "0xIntentHashGolden",
      authorizedIntent: {
        grantId: "grant_golden_cli",
        authorityHash: "0xAuthHashGolden",
        intentHash: "0xIntentHashGolden",
        action: "repay",
        asset: "0xDebt",
        authorizedAmountUsd: 25,
        amountWei: "25000000",
        repayMax: false,
        validUntil: "2026-09-18T00:00:00Z",
        checks: ["grant_bounds_satisfied", "policy_bounds_satisfied"],
      },
      authorityHash: "0xAuthHashGolden",
      execution: {
        executionId: "exec_golden_cli",
        grantId: "grant_golden_cli",
        authorityHash: "0xAuthHashGolden",
        action: "repay",
        amountUsd: 25,
        amountWei: "25000000",
        status: "verified",
        simulatedAt: "2026-09-14T00:06:00Z",
        submittedAt: "2026-09-14T00:06:05Z",
        receiptVerified: true,
        independentReceiptVerified: true,
        txHash: "0xRealTxHashGolden",
        blockNumber: 1234567,
        preHealthFactor: 1.15,
        postHealthFactor: 1.85,
      },
      receipts: [
        {
          hash: "0xRealTxHashGolden",
          chainId: 11155111,
          verified: true,
          receiptStatus: "success",
          blockNumber: 1234567,
        },
      ],
      snapshots: {
        before: {
          userAddress: "0xOwner",
          chainId: 11155111,
          poolAddress: "0xPool",
          debtAssetAddress: "0xDebt",
          debtSymbol: "USDC",
          debtDecimals: 6,
          totalCollateralBase: 150000000000n,
          totalDebtBase: 100000000000n,
          availableBorrowsBase: 10000000000n,
          currentLiquidationThresholdBps: 8000,
          ltvBps: 7500,
          healthFactorWad: 1150000000000000000n,
          healthFactor: 1.15,
          totalCollateralUsd: 1500,
          totalDebtUsd: 1000,
          debtTokenBalance: 1000000000n,
          debtTokenBalanceHuman: 1000,
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
        },
        after: {
          userAddress: "0xOwner",
          chainId: 11155111,
          poolAddress: "0xPool",
          debtAssetAddress: "0xDebt",
          debtSymbol: "USDC",
          debtDecimals: 6,
          totalCollateralBase: 150000000000n,
          totalDebtBase: 97500000000n,
          availableBorrowsBase: 12000000000n,
          currentLiquidationThresholdBps: 8000,
          ltvBps: 7500,
          healthFactorWad: 1850000000000000000n,
          healthFactor: 1.85,
          totalCollateralUsd: 1500,
          totalDebtUsd: 975,
          debtTokenBalance: 975000000n,
          debtTokenBalanceHuman: 975,
          assetPriceBase: 100000000n,
          assetPriceUsd: 1.0,
          timestamp: "2026-09-14T00:07:00Z",
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
      exportedAt: "2026-09-14T00:08:00Z",
    };

    // Calculate actual valid canonical hash
    const { computeGrantHash, computeIntentHash } = await import("@bulwark/core");
    const { grantHash, grantId } = computeGrantHash(goldenBundle.grant);
    goldenBundle.grant.grantHash = grantHash;
    goldenBundle.grant.grantId = grantId;
    goldenBundle.authorizedIntent.grantId = grantId;
    goldenBundle.execution.grantId = grantId;
    const realIntentHash = computeIntentHash(goldenBundle.intent);
    goldenBundle.intentHash = realIntentHash;
    goldenBundle.authorizedIntent.intentHash = realIntentHash;

    const bundlePath = path.join(tmpDir, "golden-bundle.json");
    fs.writeFileSync(bundlePath, JSON.stringify(goldenBundle, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));

    stdoutLogs = [];
    const verifyCode = await runCli(["proof", "verify", bundlePath], {
      stdout: captureStdout,
      stderr: captureStderr,
    });
    expect(verifyCode).toBe(0);
    const verifyOut = stdoutLogs.join("\n");
    expect(verifyOut).toContain("VERDICT: PROVEN (11/11 checks passed)");
  });
});
