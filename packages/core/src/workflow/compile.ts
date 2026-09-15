/**
 * Payload & Workflow Compiler.
 * Compiles an AuthorizedIntent into:
 * 1. Direct execution payload (POST /api/execute/contract-call)
 * 2. Standing workflow JSON (KeeperHub workflow schema)
 * 3. Watchtower workflow JSON (Schedule -> Read -> Condition -> Webhook)
 * Source of truth: docs/RESEARCH_KEEPERHUB.md and docs/BUILD.md §4 P7.
 */

import { AuthorizedIntent } from "../policy/compiler.js";
import { RescueGrantV2 } from "../grants/grant.js";
import {
  ContractCallRequest,
  CheckAndExecuteRequest,
  WorkflowCreateRequest,
  WorkflowNode,
  WorkflowEdge,
} from "../keeperhub/types.js";
import { AAVE_V3_REPAY_ABI, AAVE_V3_SUPPLY_ABI, AAVE_V3_USER_ACCOUNT_DATA_ABI } from "../abi.js";
import { getChainConfig } from "../chains.js";

export interface CompiledPayloads {
  directCall: ContractCallRequest;
  checkAndExecute: CheckAndExecuteRequest;
  standingWorkflow: WorkflowCreateRequest;
  watchtowerWorkflow: WorkflowCreateRequest;
  authorityHash: string;
}

/**
 * Compiles an AuthorizedIntent and Grant into verified KeeperHub direct and workflow payloads.
 */
export function compileExecutionPayloads(
  authorizedIntent: AuthorizedIntent,
  grant: RescueGrantV2,
  webhookUrl = "https://app.keeperhub.com/desk/webhook"
): CompiledPayloads {
  const chainConfig = getChainConfig(grant.position.chainId);
  const poolAddress = chainConfig.pool;

  // 1. Direct Execution Payload (Primary Rescue Path)
  // repay(address asset, uint256 amount, uint256 interestRateMode=2, address onBehalfOf=owner)
  const repayArgs = [
    authorizedIntent.asset,
    authorizedIntent.amountWei,
    2,
    grant.position.positionOwner,
  ];

  // supply(address asset, uint256 amount, address onBehalfOf=owner, uint16 referralCode=0)
  const supplyArgs = [
    authorizedIntent.asset,
    authorizedIntent.amountWei,
    grant.position.positionOwner,
    0,
  ];

  const isSupply = authorizedIntent.action === "add-collateral";
  const actionArgs = isSupply ? supplyArgs : repayArgs;
  const functionName = isSupply ? "supply" : "repay";
  const actionAbi = isSupply ? AAVE_V3_SUPPLY_ABI : AAVE_V3_REPAY_ABI;
  const actionLabel = isSupply ? "Aave V3 Supply Collateral" : "Aave V3 Repay Debt";

  const directCall: ContractCallRequest = {
    contractAddress: poolAddress,
    chainId: grant.position.chainId,
    functionName,
    functionArgs: JSON.stringify(actionArgs),
    abi: JSON.stringify(actionAbi),
    gasLimitMultiplier: 1.1,
  };

  // 1b. Native Check-and-Execute Payload (Scalar Guard + Atomic Repay/Supply)
  const triggerHfWad = (
    BigInt(Math.floor(grant.conditions.hfTriggerBelow * 10000)) * 100000000000000n
  ).toString();
  const checkAndExecute: CheckAndExecuteRequest = {
    contractAddress: poolAddress,
    chainId: grant.position.chainId,
    functionName: "getUserAccountData",
    functionArgs: JSON.stringify([grant.position.positionOwner]),
    abi: JSON.stringify(AAVE_V3_USER_ACCOUNT_DATA_ABI),
    condition: {
      operator: "lt",
      value: triggerHfWad,
    },
    action: {
      contractAddress: poolAddress,
      functionName,
      functionArgs: JSON.stringify(actionArgs),
      abi: JSON.stringify(actionAbi),
      gasLimitMultiplier: 1.1,
    },
    simulate: false,
  };

  // 2. Standing Workflow (Marketplace-ready standing rescue order)
  const triggerNodeId = "trigger_manual_0";
  const actionNodeId = isSupply ? "action_supply_0" : "action_repay_0";

  const triggerNode: WorkflowNode = {
    id: triggerNodeId,
    type: "trigger",
    data: {
      label: "Manual Trigger",
      type: "manual",
      config: {
        network: String(grant.position.chainId),
      },
    },
  };

  const actionNode: WorkflowNode = {
    id: actionNodeId,
    type: "action",
    data: {
      label: actionLabel,
      type: "web3/write-contract",
      config: {
        actionType: "web3/write-contract",
        network: String(grant.position.chainId), // string chain ID
        contractAddress: poolAddress,
        functionName,
        functionArgs: JSON.stringify(actionArgs),
        abi: JSON.stringify(actionAbi),
        gasLimitMultiplier: "1.1",
        web3Connection: "default",
      },
    },
  };

  const standingEdges: WorkflowEdge[] = [
    {
      id: "edge_trigger_to_action",
      source: triggerNodeId,
      target: actionNodeId,
    },
  ];

  const standingWorkflow: WorkflowCreateRequest = {
    name: `BULWARK Standing Rescue - ${grant.grantId}`,
    description: `Standing rescue order bounded by RescueGrant ${grant.grantId} (authorityHash: ${authorizedIntent.authorityHash})`,
    nodes: [triggerNode, actionNode],
    edges: standingEdges,
    enabled: true,
  };

  // 3. Watchtower Workflow (Schedule -> Read -> Condition -> Webhook)
  // Marked PARTIAL as per BUILD.md §4 P7 until live MCP schema validation
  const schedNodeId = "watchtower_schedule_0";
  const readNodeId = "watchtower_read_0";
  const conditionNodeId = "watchtower_condition_0";
  const webhookNodeId = "watchtower_webhook_0";

  const schedNode: WorkflowNode = {
    id: schedNodeId,
    type: "trigger",
    data: {
      label: "Schedule Monitor",
      type: "schedule",
      config: {
        network: String(grant.position.chainId),
        cron: "*/5 * * * *", // Every 5 minutes
      },
    },
  };

  const readNode: WorkflowNode = {
    id: readNodeId,
    type: "action",
    data: {
      label: "Read Aave Position",
      type: "web3/read-contract",
      config: {
        network: String(grant.position.chainId),
        contractAddress: poolAddress,
        functionName: "getUserAccountData",
        functionArgs: JSON.stringify([grant.position.positionOwner]),
      },
    },
  };

  const conditionNode: WorkflowNode = {
    id: conditionNodeId,
    type: "action",
    data: {
      label: "Check Critical HF",
      type: "flow/condition",
      config: {
        network: String(grant.position.chainId),
        operator: "lt",
        field: `{{@${readNodeId}:Read Aave Position.healthFactor}}`,
        value: String(grant.conditions.hfTriggerBelow * 1e18),
      },
    },
  };

  const webhookNode: WorkflowNode = {
    id: webhookNodeId,
    type: "action",
    data: {
      label: "Notify Desk Webhook",
      type: "network/webhook",
      config: {
        network: String(grant.position.chainId),
        url: webhookUrl,
        method: "POST",
        payload: JSON.stringify({
          grantId: grant.grantId,
          authorityHash: authorizedIntent.authorityHash,
          alert: "Position below critical threshold",
        }),
      },
    },
  };

  const watchtowerEdges: WorkflowEdge[] = [
    { id: "e_sched_to_read", source: schedNodeId, target: readNodeId },
    { id: "e_read_to_cond", source: readNodeId, target: conditionNodeId },
    { id: "e_cond_to_hook", source: conditionNodeId, target: webhookNodeId, sourceHandle: "true" },
  ];

  const watchtowerWorkflow: WorkflowCreateRequest = {
    name: `BULWARK Watchtower - ${grant.grantId}`,
    description: `Standing monitoring watchtower (PARTIAL) for grant ${grant.grantId}`,
    nodes: [schedNode, readNode, conditionNode, webhookNode],
    edges: watchtowerEdges,
    enabled: false,
  };

  return {
    directCall,
    checkAndExecute,
    standingWorkflow,
    watchtowerWorkflow,
    authorityHash: authorizedIntent.authorityHash,
  };
}
