import { describe, it, expect } from "vitest";
import { compileExecutionPayloads } from "../../packages/core/src/workflow/compile.js";
import { AuthorizedIntent } from "../../packages/core/src/policy/compiler.js";
import { RescueGrantV2, computeGrantHash } from "../../packages/core/src/grants/grant.js";

describe("Payload & Workflow Compilation", () => {
  const mockGrantCore = {
    version: 2 as const,
    policyId: "pol_1",
    policyHash: "0xpol",
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
      adaptiveBands: [],
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
  };

  const { grantHash, grantId } = computeGrantHash(mockGrantCore);
  const grant: RescueGrantV2 = { ...mockGrantCore, grantHash, grantId };

  const authorizedIntent: AuthorizedIntent = {
    grantId,
    authorityHash: "0xauth_12345",
    intentHash: "0xintent_67890",
    action: "repay",
    asset: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    authorizedAmountUsd: 15.0,
    amountWei: "15000000",
    repayMax: false,
    validUntil: "2026-09-14T12:00:00Z",
    checks: [],
  };

  it("compiles direct execution payload matching verified KeeperHub contract-call shape", () => {
    const payloads = compileExecutionPayloads(authorizedIntent, grant);
    const direct = payloads.directCall;

    expect(direct.chainId).toBe(11155111);
    expect(direct.contractAddress).toBe("0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951"); // Sepolia Pool
    expect(direct.functionName).toBe("repay");
    expect(typeof direct.functionArgs).toBe("string");

    const parsedArgs = JSON.parse(direct.functionArgs);
    expect(parsedArgs).toHaveLength(4);
    expect(parsedArgs[0]).toBe(authorizedIntent.asset);
    expect(parsedArgs[1]).toBe("15000000");
    expect(parsedArgs[2]).toBe(2); // interestRateMode 2 (variable)
    expect(parsedArgs[3]).toBe(grant.position.positionOwner); // onBehalfOf
  });

  it("compiles standing workflow using string chain IDs and verified node types", () => {
    const payloads = compileExecutionPayloads(authorizedIntent, grant);
    const wf = payloads.standingWorkflow;

    expect(wf.name).toContain(grant.grantId);
    expect(wf.nodes).toHaveLength(2);
    expect(wf.nodes[0]?.data.config.network).toBe("11155111"); // String chain id!
    expect(wf.nodes[1]?.data.config.actionType).toBe("web3/write-contract");
    expect(wf.edges).toHaveLength(1);
    expect(wf.edges[0]?.source).toBe(wf.nodes[0]?.id);
    expect(wf.edges[0]?.target).toBe(wf.nodes[1]?.id);
  });

  it("compiles watchtower workflow with condition and webhook nodes", () => {
    const payloads = compileExecutionPayloads(authorizedIntent, grant, "https://my-desk.org/webhook");
    const wt = payloads.watchtowerWorkflow;

    expect(wt.enabled).toBe(false); // Created disabled by default
    expect(wt.nodes).toHaveLength(4);
    expect(wt.nodes[0]?.data.type).toBe("schedule");
    expect(wt.nodes[1]?.data.type).toBe("web3/read-contract");
    expect(wt.nodes[2]?.data.type).toBe("flow/condition");
    expect(wt.nodes[3]?.data.type).toBe("network/webhook");
  });

  it("compiles native check-and-execute payload with atomic scalar health factor guard", () => {
    const payloads = compileExecutionPayloads(authorizedIntent, grant);
    const cne = payloads.checkAndExecute;

    expect(cne.chainId).toBe(11155111);
    expect(cne.contractAddress).toBe("0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951");
    expect(cne.functionName).toBe("getUserAccountData");
    expect(cne.condition.operator).toBe("lt");
    expect(cne.condition.value).toBe("1250000000000000000"); // 1.25 WAD
    expect(cne.action.functionName).toBe("repay");
    expect(cne.simulate).toBe(false);
  });
});
