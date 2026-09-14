/**
 * Receipt Verification and Status Mapping.
 * Dual verification: KeeperHub on-chain receipts + Independent public RPC receipts.
 * Source of truth: docs/RESEARCH_KEEPERHUB.md and docs/BUILD.md §4 P8.
 */

import { DirectExecutionStatusResponse, DirectExecutionReceipt } from "../keeperhub/types.js";
import { getChainConfig } from "../chains.js";

export type MappedExecutionStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "UNKNOWN";

export interface DualReceiptVerificationResult {
  isVerified: boolean;
  keeperhubVerified: boolean;
  keeperhubReceipt?: DirectExecutionReceipt;
  independentVerified: boolean;
  independentStatus: "success" | "reverted" | "unavailable";
  blockNumber?: number;
  gasUsed?: string;
  reasons: string[];
}

/**
 * Maps KeeperHub execution status to standard Bulwark status (Fail-Closed).
 */
export function mapKeeperHubStatus(statusStr: string): MappedExecutionStatus {
  const s = statusStr.toLowerCase();
  if (s === "completed" || s === "success") return "SUCCESS";
  if (s === "pending") return "PENDING";
  if (s === "running" || s === "unconfirmed") return "RUNNING";
  if (
    s === "failed" ||
    s === "error" ||
    s === "system_error" ||
    s === "cancelled" ||
    s === "timeout" ||
    s === "not_found" ||
    s === "reverted"
  ) {
    return "FAILED";
  }
  return "UNKNOWN";
}

/**
 * Dual verification: verifies both KeeperHub receipt and queries independent public-RPC.
 */
export async function verifyExecutionReceipts(
  statusResponse: DirectExecutionStatusResponse,
  rpcUrlOverride?: string,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<DualReceiptVerificationResult> {
  const reasons: string[] = [];

  // 1. Check KeeperHub on-chain receipt verification (KEEPERHUB FACT)
  const khReceipt = statusResponse.receipts?.[0];
  let khVerified = false;

  if (khReceipt) {
    if (khReceipt.verified === true && khReceipt.receiptStatus === "success") {
      khVerified = true;
    } else {
      reasons.push(`KeeperHub receipt unverified or non-success: status "${khReceipt.receiptStatus}"`);
    }
  } else if (mapKeeperHubStatus(statusResponse.status) === "SUCCESS") {
    // If completed without receipts array populated yet
    khVerified = false;
    reasons.push("KeeperHub status completed but receipts array empty");
  } else {
    reasons.push(`Execution not in success state: "${statusResponse.status}"`);
  }

  // 2. Independent Verification via public RPC eth_getTransactionReceipt
  let indepVerified = false;
  let indepStatus: "success" | "reverted" | "unavailable" = "unavailable";
  let blockNumber = khReceipt?.blockNumber;
  let gasUsed = khReceipt?.gasUsed;

  const txHash = statusResponse.transactionHash ?? khReceipt?.hash;
  if (txHash && txHash.startsWith("0x") && txHash.length === 66) {
    const chainId = typeof statusResponse.network === "number"
      ? statusResponse.network
      : parseInt(String(statusResponse.network ?? "11155111"), 10);

    const rpcUrl = rpcUrlOverride ?? (getChainConfig(chainId)?.defaultRpcUrl || "");

    if (rpcUrl) {
      try {
        const res = await fetchFn(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getTransactionReceipt",
            params: [txHash],
          }),
        });

        if (res.ok) {
          const json = (await res.json()) as any;
          const receipt = json?.result;
          if (receipt && typeof receipt === "object") {
            const statusHex = receipt.status;
            if (statusHex === "0x1" || statusHex === 1) {
              indepVerified = true;
              indepStatus = "success";
              if (receipt.blockNumber) {
                blockNumber = parseInt(receipt.blockNumber, 16);
              }
              if (receipt.gasUsed) {
                gasUsed = BigInt(receipt.gasUsed).toString();
              }
            } else if (statusHex === "0x0" || statusHex === 0) {
              indepStatus = "reverted";
              reasons.push("Independent RPC reports transaction REVERTED (status 0x0)");
            }
          }
        }
      } catch (err: unknown) {
        // Public RPC failed; mark independent: unavailable (never fabricate!)
        indepStatus = "unavailable";
        reasons.push(`Independent RPC query failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const isVerified = khVerified && (indepVerified || indepStatus === "unavailable");

  return {
    isVerified,
    keeperhubVerified: khVerified,
    keeperhubReceipt: khReceipt,
    independentVerified: indepVerified,
    independentStatus: indepStatus,
    blockNumber,
    gasUsed,
    reasons,
  };
}
