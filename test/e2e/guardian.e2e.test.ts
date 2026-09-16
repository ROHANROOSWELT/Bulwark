import { describe, it, expect, beforeEach } from "vitest";
import { BulwarkGuardian } from "../../packages/core/src/guardian.js";
import { KeeperHubClient } from "../../packages/core/src/keeperhub/client.js";
import { AavePositionReader, PositionSnapshot } from "../../packages/core/src/aave/reader.js";
import { BulwarkStore } from "../../packages/core/src/grants/store.js";
import { getDefaultPolicyConfig } from "../../packages/core/src/policy/engine.js";
import { loadConfig } from "../../packages/core/src/config.js";
import { promises as fs } from "node:fs";

describe("BulwarkGuardian Full Lifecycle E2E (FIXTURE Suite)", () => {
  const testDir = ".bulwark_e2e_fixture";
  const user = "0x1111111111111111111111111111111111111111";
  const usdc = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

  let currentHf = 1.18;
  let currentDebt = 500.0;

  beforeEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
    currentHf = 1.18;
    currentDebt = 500.0;
  });

  function createMockReader(): AavePositionReader {
    return {
      readPosition: async (): Promise<PositionSnapshot> => ({
        userAddress: user,
        chainId: 11155111,
        poolAddress: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
        debtAssetAddress: usdc,
        debtSymbol: "USDC",
        debtDecimals: 6,
        totalCollateralBase: 100000000000n,
        totalDebtBase: BigInt(Math.floor(currentDebt * 1e8)),
        availableBorrowsBase: 10000000000n,
        currentLiquidationThresholdBps: 8000,
        ltvBps: 7500,
        healthFactorWad: BigInt(Math.floor(currentHf * 1e18)),
        healthFactor: currentHf,
        totalCollateralUsd: 1000.0,
        totalDebtUsd: currentDebt,
        debtTokenBalance: BigInt(Math.floor(currentDebt * 1e6)),
        debtTokenBalanceHuman: currentDebt,
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
  }

  function createMockClient(simulateWouldRevert = false): KeeperHubClient {
    return {
      hasKey: () => true,
      assertSimulationSafety: () => {},
      executeContractCall: async (payload: any) => {
        if (payload.simulate) {
          return {
            success: !simulateWouldRevert,
            status: "simulated",
            gasEstimate: "180000",
            wouldRevert: simulateWouldRevert,
            revertReason: simulateWouldRevert ? "Execution would revert" : undefined,
          };
        }
        // Real broadcast mock: updates chain state to post-execution values
        currentHf = 2.03;
        currentDebt = 485.0;

        return {
          executionId: "exec_fixture_01",
          status: "completed",
          transactionHash: "0x" + "c".repeat(64),
          receipts: [
            {
              hash: "0x" + "c".repeat(64),
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
          transactionHash: "0x" + "c".repeat(64),
          receipts: [
            {
              hash: "0x" + "c".repeat(64),
              chainId: 11155111,
              verified: true,
              receiptStatus: "success" as const,
              blockNumber: 7000000,
              gasUsed: "125000",
            },
          ],
        },
        pollIntervalHintSeconds: 0,
      }),
    } as unknown as KeeperHubClient;
  }

  it("completes full happy path: propose -> approve -> arm -> dry run -> execute -> verify -> PoAA PROVEN", async () => {
    const config = loadConfig({ BULWARK_STORE_DIR: testDir });
    const store = new BulwarkStore(testDir);
    await store.init();
    await store.syncDeskBalance("0xdesk", 100.0); // Fund desk with $100 capacity

    const guardian = new BulwarkGuardian({
      config,
      store,
      reader: createMockReader(),
      client: createMockClient(false),
    });

    // 1. Propose Grant (status = proposed)
    const proposed = await guardian.proposeRescueGrant(user);
    expect(proposed.state.status).toBe("proposed");
    expect(proposed.grantId.startsWith("bg_")).toBe(true);

    // Rule: proposed grant cannot execute directly
    await expect(guardian.executeGrant(proposed.grantId)).rejects.toThrow(/Cannot execute grant in status "proposed"/);

    // 2. Approve Grant by Owner -> Armed
    const armed = await guardian.approveGrant(proposed.grantId, user);
    expect(armed.state.status).toBe("armed");
    expect(armed.state.capacityReservedUsd).toBe(15.0); // Band cap reserved

    // 3. Dry Run Simulation
    const sim = await guardian.dryRunGrant(proposed.grantId);
    expect(sim.status).toBe("simulated");
    expect(sim.wouldRevert).toBe(false);

    // 4. Execute Grant via KeeperHub (broadcasting updates on-chain state to HF 2.03)
    const result = await guardian.executeGrant(proposed.grantId);
    expect(result.execution.status).toBe("verified");
    expect(result.execution.receiptVerified).toBe(true);
    expect(result.execution.txHash).toBe("0x" + "c".repeat(64));

    // 5. Verify 11-check PoAA
    const poaaReport = guardian.verifyProof(result.bundle);
    expect(poaaReport.verdict).toBe("PROVEN");
    expect(poaaReport.passedCount).toBe(11);
  });

  it("handles simulation revert path gracefully", async () => {
    const config = loadConfig({ BULWARK_STORE_DIR: testDir });
    const store = new BulwarkStore(testDir);
    await store.init();
    await store.syncDeskBalance("0xdesk", 100.0);

    const guardian = new BulwarkGuardian({
      config,
      store,
      reader: createMockReader(),
      client: createMockClient(true), // Simulation reverts!
    });

    const proposed = await guardian.proposeRescueGrant(user);
    await guardian.approveGrant(proposed.grantId, user);

    const sim = await guardian.dryRunGrant(proposed.grantId);
    expect(sim.wouldRevert).toBe(true);

    // Execution must refuse because dry run reverted
    await expect(guardian.executeGrant(proposed.grantId)).rejects.toThrow(/simulation/i);
  });

  it("tick auto-invalidates recovered positions", async () => {
    const config = loadConfig({ BULWARK_STORE_DIR: testDir });
    const store = new BulwarkStore(testDir);
    await store.init();
    await store.syncDeskBalance("0xdesk", 100.0);

    const guardian = new BulwarkGuardian({
      config,
      store,
      reader: createMockReader(),
      client: createMockClient(false),
    });

    const proposed = await guardian.proposeRescueGrant(user);
    await guardian.approveGrant(proposed.grantId, user);

    // Position recovers on its own to HF 2.1 >= recoveryHf 2.0
    currentHf = 2.1;

    const tickRes = await guardian.tick();
    expect(tickRes.invalidated).toBe(1);

    const updated = await store.getGrant(proposed.grantId);
    expect(updated?.state.status).toBe("invalidated");
    expect(updated?.state.invalidationReason).toBe("recovered");
  });

  it("tick autonomously executes rescue when armed position breaches critical trigger without human intervention", async () => {
    const config = loadConfig({ BULWARK_STORE_DIR: testDir });
    const store = new BulwarkStore(testDir);
    await store.init();
    await store.syncDeskBalance("0xdesk", 100.0);

    const guardian = new BulwarkGuardian({
      config,
      store,
      reader: createMockReader(),
      client: createMockClient(false),
    });

    // 1. Borrower pre-authorizes agency in advance (signing EIP-712 RescueGrant)
    const proposed = await guardian.proposeRescueGrant(user);
    const armed = await guardian.approveGrant(proposed.grantId, user);
    expect(armed.state.status).toBe("armed");

    // 2. Position is in danger: currentHf = 1.18 < hfTriggerBelow (1.20)
    currentHf = 1.18;

    // 3. Autonomous Daemon Tick runs (zero human button clicks)
    const tickRes = await guardian.tick();
    expect(tickRes.executed).toBe(1);

    // 4. Verify the grant reached 'verified' status autonomously on-chain
    const executedGrant = await store.getGrant(proposed.grantId);
    expect(executedGrant?.state.status).toBe("verified");
    expect(executedGrant?.state.executionCount).toBe(1);

    // 5. Verify dual-receipt execution record and PoAA bundle
    const executions = await store.getExecutions();
    expect(executions.length).toBe(1);
    expect(executions[0]!.status).toBe("verified");
    expect(executions[0]!.txHash).toBe("0x" + "c".repeat(64));

    const latestProof = await store.getProofBundle(proposed.grantId);
    expect(latestProof).toBeDefined();
    const poaa = guardian.verifyProof(latestProof!);
    expect(poaa.verdict).toBe("PROVEN");
    expect(poaa.passedCount).toBe(11);
  });
});
