/**
 * Verified Type Definitions for KeeperHub REST API surfaces.
 * Source of truth: docs/RESEARCH_KEEPERHUB.md
 */

export type DirectExecutionReceiptStatus =
  | "success"
  | "reverted"
  | "safe_inner_failure"
  | "not_found"
  | "timeout";

export interface DirectExecutionReceipt {
  hash: string;
  chainId: number;
  verified: boolean;
  receiptStatus: DirectExecutionReceiptStatus;
  blockNumber?: number;
  gasUsed?: string;
  verifiedAt?: string;
}

export type DirectExecutionStatusKind =
  | "pending"
  | "running"
  | "unconfirmed"
  | "completed"
  | "failed"
  | "success"
  | "error"
  | "system_error"
  | "cancelled"
  | "simulated";

export interface DirectExecutionStatusResponse {
  executionId: string;
  status: DirectExecutionStatusKind;
  type?: string;
  network?: string | number;
  transactionHash?: string;
  transactionLink?: string;
  sponsored?: boolean;
  retryCount?: number;
  receipts?: DirectExecutionReceipt[];
  gasUsedWei?: string;
  gasPriceWei?: string;
  result?: string;
  error?: string;
  createdAt?: string;
  completedAt?: string;
}

export interface SimulationResult {
  success: boolean;
  status: "simulated";
  from?: string;
  to?: string;
  value?: string;
  gasEstimate?: string;
  simulatedReturnValue?: string;
  wouldRevert: boolean;
  revertReason?: string;
}

export interface TransferRequest {
  chainId: number;
  recipientAddress: string;
  amount: string; // decimal string
  tokenAddress?: string;
  tokenConfig?: Record<string, unknown>;
  gasLimitMultiplier?: number;
  simulate?: boolean;
}

export interface ContractCallRequest {
  contractAddress: string;
  chainId: number;
  functionName: string;
  functionArgs: string; // JSON-array string e.g. "[\"0x...\", \"100\"]"
  abi?: string; // JSON string
  value?: string;
  gasLimitMultiplier?: number;
  simulate?: boolean;
}

export interface CheckAndExecuteCondition {
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte";
  value: string; // BigInt-compatible decimal or hex string
}

export interface CheckAndExecuteAction {
  contractAddress: string;
  functionName: string;
  functionArgs: string; // JSON-array string
  abi?: string;
  gasLimitMultiplier?: number;
}

export interface CheckAndExecuteRequest {
  contractAddress: string;
  chainId: number;
  functionName: string;
  functionArgs: string;
  abi?: string;
  condition: CheckAndExecuteCondition;
  action: CheckAndExecuteAction;
  simulate?: boolean;
}

export interface WorkflowNode {
  id: string;
  type: "action" | "trigger";
  data: {
    label: string;
    description?: string;
    type: string;
    status?: string;
    config: {
      actionType?: string;
      network: string; // string chain id e.g. "11155111"
      contractAddress?: string;
      functionName?: string;
      functionArgs?: string;
      abi?: string;
      gasLimitMultiplier?: string;
      web3Connection?: "default" | "eoa" | `safe:${string}`;
      [key: string]: unknown;
    };
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: "true" | "false" | "loop" | "done" | string;
}

export interface WorkflowCreateRequest {
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  description?: string;
  projectId?: string;
  tagId?: string;
  enabled?: boolean;
}

export interface WorkflowUpdateRequest {
  name?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  description?: string;
  enabled?: boolean;
}

export interface WorkflowObject {
  id: string;
  name: string;
  description?: string;
  visibility?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  enabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecutionSummary {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "unconfirmed" | "success" | "error" | "system_error" | "cancelled";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  transactionHashes?: string[];
}

export interface WorkflowExecutionStatus {
  id: string;
  workflowId: string;
  status: string;
  nodeStatuses?: Record<string, string>;
  progress?: {
    totalSteps: number;
    completedSteps: number;
    runningSteps: number;
    currentNodeId?: string;
    currentNodeName?: string;
    percentage: number;
  };
  errorContext?: string;
  transactionHashes?: string[];
}

export interface WorkflowNodeLog {
  id: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  duration?: number;
  startedAt?: string;
  completedAt?: string;
  iterationIndex?: number;
  forEachNodeId?: string;
}

export interface SpendCapInfo {
  dailyNativeCapWei?: string;
  remainingWei?: string;
  stablecoinCapUsd?: number;
  resetAt?: string;
}

export interface ChainInfo {
  id: number;
  name: string;
  isTestnet?: boolean;
  rpcUrl?: string;
}

export interface MarketplaceWorkflowListing {
  slug: string;
  title: string;
  description?: string;
  priceUsd?: number;
  currency?: string;
  author?: string;
}
