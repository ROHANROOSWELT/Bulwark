/**
 * Policy Types and Configuration.
 */

import { AdaptiveBand, RescueGrantV2 } from "../grants/grant.js";
import { PositionSnapshot } from "../aave/reader.js";

export interface BulwarkPolicyConfig {
  policyId: string;
  maxUsdPerAction: number;
  hfCritical: number;
  hfTarget: number;
  allowedChains: number[];
  allowedActions: string[];
  allowedDebtAssets: Record<number, string[]>; // chainId -> asset addresses
}

export interface PolicyValidationResult {
  ok: boolean;
  reasons: string[];
  resolvedBand?: AdaptiveBand;
  effectiveCapUsd?: number;
}

export interface ExecutionIntent {
  action: "repay" | "add-collateral" | "flash-deleverage";
  asset: string;
  amountUsd: number;
  chainId: number;
  positionOwner: string;
  rationaleHash?: string;
}
