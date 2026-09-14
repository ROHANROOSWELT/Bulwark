import { describe, it, expect, vi } from "vitest";
import { KeeperHubClient } from "../../../packages/core/src/keeperhub/client.js";
import { KeeperHubApiError, KeeperHubSimulateForbiddenError } from "../../../packages/core/src/keeperhub/errors.js";

// Labeled FIXTURE transport for hermetic testing
function createFixtureTransport(responseResolver: (req: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}) => { status: number; body: unknown; headers?: Record<string, string> }): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (typeof (init.headers as any).forEach === "function") {
        (init.headers as any).forEach((v: string, k: string) => {
          headers[k.toLowerCase()] = v;
        });
      } else {
        for (const [k, v] of Object.entries(init.headers)) {
          headers[k.toLowerCase()] = String(v);
        }
      }
    }

    const { status, body, headers: respHeaders } = responseResolver({
      url,
      method,
      headers,
      body: init?.body ? String(init.body) : undefined,
    });

    const responseHeaderObj = new Headers({
      "content-type": "application/json",
      ...(respHeaders ?? {}),
    });

    return new Response(JSON.stringify(body), {
      status,
      statusText: status >= 400 ? "Error" : "OK",
      headers: responseHeaderObj,
    });
  };
}

describe("KeeperHubClient - FIXTURE suite", () => {
  const apiKey = "kh_fixture_test_secret_key_12345";

  it("GET /api/chains (public, no auth sent)", async () => {
    let capturedReq: any;
    const fetchFn = createFixtureTransport((req) => {
      capturedReq = req;
      return {
        status: 200,
        body: [{ id: 11155111, name: "Sepolia" }, { id: 8453, name: "Base" }],
      };
    });

    const client = new KeeperHubClient({ apiKey, fetchFn });
    const chains = await client.getChains();

    expect(capturedReq.method).toBe("GET");
    expect(capturedReq.url).toBe("https://app.keeperhub.com/api/chains");
    expect(capturedReq.headers["authorization"]).toBeUndefined();
    expect(chains).toHaveLength(2);
    expect(chains[0]?.id).toBe(11155111);
  });

  it("GET /api/keys (authenticated)", async () => {
    let capturedReq: any;
    const fetchFn = createFixtureTransport((req) => {
      capturedReq = req;
      return { status: 200, body: { orgId: "org_123", keyName: "Default" } };
    });

    const client = new KeeperHubClient({ apiKey, fetchFn });
    const keys = await client.getKeys();

    expect(capturedReq.method).toBe("GET");
    expect(capturedReq.headers["authorization"]).toBe(`Bearer ${apiKey}`);
    expect(keys["orgId"]).toBe("org_123");
  });

  it("GET /api/analytics/spend-cap", async () => {
    let capturedReq: any;
    const fetchFn = createFixtureTransport((req) => {
      capturedReq = req;
      return {
        status: 200,
        body: { dailyNativeCapWei: "20000000000000000", remainingWei: "15000000000000000" },
      };
    });

    const client = new KeeperHubClient({ apiKey, fetchFn });
    const cap = await client.getSpendCap();

    expect(capturedReq.url).toBe("https://app.keeperhub.com/api/analytics/spend-cap");
    expect(cap.dailyNativeCapWei).toBe("20000000000000000");
  });

  it("POST /api/execute/contract-call (view call returning instant result)", async () => {
    let capturedReq: any;
    const fetchFn = createFixtureTransport((req) => {
      capturedReq = req;
      return { status: 200, body: { result: "0x0000000000000000000000000000000000000000" } };
    });

    const client = new KeeperHubClient({ apiKey, fetchFn });
    const res = await client.executeContractCall({
      contractAddress: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
      chainId: 11155111,
      functionName: "getUserAccountData",
      functionArgs: "[\"0x1234\"]",
    });

    expect(capturedReq.method).toBe("POST");
    expect(capturedReq.url).toBe("https://app.keeperhub.com/api/execute/contract-call");
    const parsedBody = JSON.parse(capturedReq.body);
    expect(parsedBody.contractAddress).toBe("0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951");
    expect((res as any).result).toBe("0x0000000000000000000000000000000000000000");
  });

  it("POST /api/execute/contract-call (simulate:true)", async () => {
    let capturedReq: any;
    const fetchFn = createFixtureTransport((req) => {
      capturedReq = req;
      return {
        status: 200,
        body: {
          success: true,
          status: "simulated",
          gasEstimate: "210000",
          wouldRevert: false,
        },
      };
    });

    const client = new KeeperHubClient({ apiKey, fetchFn });
    const res = await client.executeContractCall({
      contractAddress: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
      chainId: 11155111,
      functionName: "repay",
      functionArgs: "[\"0xusdc\", \"100\", 2, \"0xowner\"]",
      simulate: true,
    });

    const parsedBody = JSON.parse(capturedReq.body);
    expect(parsedBody.simulate).toBe(true);
    expect((res as any).status).toBe("simulated");
    expect((res as any).wouldRevert).toBe(false);
  });

  it("POST /api/execute/transfer with Idempotency-Key", async () => {
    let capturedReq: any;
    const fetchFn = createFixtureTransport((req) => {
      capturedReq = req;
      return {
        status: 200,
        body: { executionId: "exec_tx_123", status: "completed" },
      };
    });

    const client = new KeeperHubClient({ apiKey, fetchFn });
    const res = await client.executeTransfer(
      {
        chainId: 11155111,
        recipientAddress: "0x1111111111111111111111111111111111111111",
        amount: "1.5",
      },
      "idemp-transfer-001"
    );

    expect(capturedReq.headers["idempotency-key"]).toBe("idemp-transfer-001");
    expect((res as any).executionId).toBe("exec_tx_123");
  });

  it("POST /api/execute/check-and-execute", async () => {
    let capturedReq: any;
    const fetchFn = createFixtureTransport((req) => {
      capturedReq = req;
      return {
        status: 200,
        body: { executionId: "exec_cae_456", status: "pending" },
      };
    });

    const client = new KeeperHubClient({ apiKey, fetchFn });
    const res = await client.executeCheckAndExecute({
      contractAddress: "0xtoken",
      chainId: 11155111,
      functionName: "balanceOf",
      functionArgs: "[\"0xowner\"]",
      condition: { operator: "gt", value: "0" },
      action: {
        contractAddress: "0xpool",
        functionName: "repay",
        functionArgs: "[\"0xtoken\", \"100\", 2, \"0xowner\"]",
      },
    });

    expect(capturedReq.url).toBe("https://app.keeperhub.com/api/execute/check-and-execute");
    expect((res as any).executionId).toBe("exec_cae_456");
  });

  it("refuses simulate:true on protocol actions or node route", () => {
    const client = new KeeperHubClient({ apiKey });
    expect(() => client.assertSimulationSafety("aave-v3/supply", true)).toThrow(
      KeeperHubSimulateForbiddenError
    );
    expect(() => client.assertSimulationSafety("/api/execute/node", true)).toThrow(
      KeeperHubSimulateForbiddenError
    );
    // Allowed on contract-call
    expect(() => client.assertSimulationSafety("/api/execute/contract-call", true)).not.toThrow();
  });

  it("GET /api/execute/{id}/status parses receipts and X-Poll-Interval-Hint header", async () => {
    const fetchFn = createFixtureTransport(() => ({
      status: 200,
      headers: { "x-poll-interval-hint": "5" },
      body: {
        executionId: "exec_789",
        status: "completed",
        transactionHash: "0xabc",
        receipts: [
          {
            hash: "0xabc",
            chainId: 11155111,
            verified: true,
            receiptStatus: "success",
            blockNumber: 5000000,
          },
        ],
      },
    }));

    const client = new KeeperHubClient({ apiKey, fetchFn });
    const res = await client.getExecutionStatus("exec_789");

    expect(res.pollIntervalHintSeconds).toBe(5);
    expect(res.data.status).toBe("completed");
    expect(res.data.receipts?.[0]?.verified).toBe(true);
    expect(res.data.receipts?.[0]?.receiptStatus).toBe("success");
  });

  it("handles 429 and Retry-After header", async () => {
    const fetchFn = createFixtureTransport(() => ({
      status: 429,
      headers: { "retry-after": "12" },
      body: { error: "rate_limited", detail: "Too many requests" },
    }));

    const client = new KeeperHubClient({ apiKey, fetchFn });
    try {
      await client.getKeys();
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(KeeperHubApiError);
      expect(err.status).toBe(429);
      expect(err.retryAfter).toBe(12);
      expect(err.errorName).toBe("rate_limited");
    }
  });

  it("redacts sensitive Authorization Bearer key in errors", async () => {
    const fetchFn = async (): Promise<Response> => {
      throw new Error(`Connection reset with Bearer ${apiKey}`);
    };

    const client = new KeeperHubClient({ apiKey, fetchFn });
    try {
      await client.getKeys();
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.message).not.toContain(apiKey);
      expect(err.message).toContain("[REDACTED_KH_KEY]");
    }
  });

  it("workflow CRUD operations", async () => {
    let capturedReq: any;
    const fetchFn = createFixtureTransport((req) => {
      capturedReq = req;
      if (req.method === "POST" && req.url.includes("/execute")) {
        return { status: 200, body: { executionId: "wfe_1", status: "running" } };
      }
      if (req.method === "DELETE") {
        return { status: 200, body: { success: true } };
      }
      return {
        status: 200,
        body: {
          id: "wf_1",
          name: "Test Workflow",
          nodes: [],
          edges: [],
          createdAt: "2026-09-14T00:00:00Z",
          updatedAt: "2026-09-14T00:00:00Z",
        },
      };
    });

    const client = new KeeperHubClient({ apiKey, fetchFn });

    const created = await client.createWorkflow({
      name: "Test Workflow",
      nodes: [],
      edges: [],
    });
    expect(created.id).toBe("wf_1");

    const fetched = await client.getWorkflow("wf_1");
    expect(fetched.name).toBe("Test Workflow");

    const executed = await client.executeWorkflow("wf_1", { foo: "bar" });
    expect(executed.executionId).toBe("wfe_1");

    const deleted = await client.deleteWorkflow("wf_1", true);
    expect(deleted.success).toBe(true);
  });

  it("marketplace endpoints", async () => {
    const fetchFn = createFixtureTransport((req) => {
      if (req.url.includes("/mcp/workflows/bulwark-desk/call")) {
        return { status: 200, body: { executionId: "mp_exec_1", status: "running" } };
      }
      return {
        status: 200,
        body: [{ slug: "bulwark-desk", title: "Bulwark Backstop Desk", priceUsd: 0 }],
      };
    });

    const client = new KeeperHubClient({ apiKey, fetchFn });
    const listings = await client.listMarketplaceWorkflows();
    expect(listings[0]?.slug).toBe("bulwark-desk");

    const callRes = await client.callMarketplaceWorkflow("bulwark-desk");
    expect(callRes["executionId"]).toBe("mp_exec_1");
  });

  it("subscribes to execution status with reactive fallback to polling", async () => {
    let callCount = 0;
    const fetchFn = createFixtureTransport((req) => {
      if (req.url.includes("/events")) {
        // Mock SSE returning 404 to trigger resilient polling fallback
        return { status: 404, body: { error: "SSE not found" } };
      }
      callCount++;
      if (callCount === 1) {
        return { status: 200, body: { executionId: "exec_stream_1", status: "running" } };
      }
      return {
        status: 200,
        body: {
          executionId: "exec_stream_1",
          status: "completed",
          transactionHash: "0xfeedbeef",
        },
      };
    });

    const client = new KeeperHubClient({ apiKey, fetchFn });
    const updates: string[] = [];

    const finalStatus = await client.subscribeExecutionStatus(
      "exec_stream_1",
      (update) => updates.push(update.status),
      5000
    );

    expect(finalStatus.status).toBe("completed");
    expect(finalStatus.transactionHash).toBe("0xfeedbeef");
    expect(updates).toContain("running");
    expect(updates).toContain("completed");
  });
});
