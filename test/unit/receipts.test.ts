import { describe, it, expect } from "vitest";
import { mapKeeperHubStatus, verifyExecutionReceipts } from "../../packages/core/src/receipts/verify.js";
import { DirectExecutionStatusResponse } from "../../packages/core/src/keeperhub/types.js";

describe("Receipts Verification & Status Mapping", () => {
  it("maps status strings fail-closed", () => {
    expect(mapKeeperHubStatus("completed")).toBe("SUCCESS");
    expect(mapKeeperHubStatus("success")).toBe("SUCCESS");
    expect(mapKeeperHubStatus("pending")).toBe("PENDING");
    expect(mapKeeperHubStatus("running")).toBe("RUNNING");
    expect(mapKeeperHubStatus("failed")).toBe("FAILED");
    expect(mapKeeperHubStatus("error")).toBe("FAILED");
    expect(mapKeeperHubStatus("timeout")).toBe("FAILED");
    expect(mapKeeperHubStatus("not_found")).toBe("FAILED");
    expect(mapKeeperHubStatus("random_junk")).toBe("UNKNOWN");
  });

  it("verifies dual receipts when both KeeperHub and independent RPC confirm", async () => {
    const statusResp: DirectExecutionStatusResponse = {
      executionId: "exec_123",
      status: "completed",
      transactionHash: "0x" + "a".repeat(64),
      network: 11155111,
      receipts: [
        {
          hash: "0x" + "a".repeat(64),
          chainId: 11155111,
          verified: true,
          receiptStatus: "success",
          blockNumber: 123456,
          gasUsed: "21000",
        },
      ],
    };

    const mockRpcFetch = async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            status: "0x1",
            blockNumber: "0x1e240", // 123456
            gasUsed: "0x5208", // 21000
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const res = await verifyExecutionReceipts(statusResp, "https://rpc.mock", mockRpcFetch);
    expect(res.isVerified).toBe(true);
    expect(res.keeperhubVerified).toBe(true);
    expect(res.independentVerified).toBe(true);
    expect(res.independentStatus).toBe("success");
    expect(res.blockNumber).toBe(123456);
  });

  it("fails verification when independent RPC reports transaction reverted", async () => {
    const statusResp: DirectExecutionStatusResponse = {
      executionId: "exec_123",
      status: "completed",
      transactionHash: "0x" + "b".repeat(64),
      network: 11155111,
      receipts: [
        {
          hash: "0x" + "b".repeat(64),
          chainId: 11155111,
          verified: true,
          receiptStatus: "success",
        },
      ],
    };

    const revertedRpcFetch = async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { status: "0x0" }, // Reverted!
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const res = await verifyExecutionReceipts(statusResp, "https://rpc.mock", revertedRpcFetch);
    expect(res.isVerified).toBe(false);
    expect(res.independentStatus).toBe("reverted");
  });
});
