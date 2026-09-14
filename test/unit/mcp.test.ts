import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpClient, runAgentCli } from "../../packages/agent/src/index.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("BULWARK MCP Client (P10)", () => {
  it("initializes connection and parses JSON-RPC response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-type": "application/json",
        "mcp-session-id": "sess_test_123",
      }),
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "keeperhub", version: "1.2.0" },
        },
      }),
    });

    const client = new McpClient({
      baseUrl: "https://mock.keeperhub.com",
      apiKey: "kh_test_key",
      fetchFn: mockFetch as any,
    });

    const res = await client.initialize(false);
    expect(res.serverInfo.name).toBe("keeperhub");
    expect(res.protocolVersion).toBe("2024-11-05");
    expect(client.getSessionId()).toBe("sess_test_123");

    // Verify request headers
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe("https://mock.keeperhub.com/mcp");
    expect(callArgs[1].headers["Authorization"]).toBe("Bearer kh_test_key");
  });

  it("handles Server-Sent Events (SSE data: stream) correctly", async () => {
    const sseBody = [
      "event: message",
      'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"validate_workflow","description":"Validate node graph"}]}}',
      "",
      "data: [DONE]",
    ].join("\n");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-type": "text/event-stream",
      }),
      text: async () => sseBody,
    });

    const client = new McpClient({
      baseUrl: "https://mock.keeperhub.com",
      fetchFn: mockFetch as any,
    });

    const tools = await client.listTools(true);
    expect(tools.length).toBe(1);
    expect(tools[0]?.name).toBe("validate_workflow");
  });

  it("propagates Mcp-Session-Id in subsequent requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ jsonrpc: "2.0", id: 2, result: { tools: [] } }),
    });

    const client = new McpClient({
      baseUrl: "https://mock.keeperhub.com",
      fetchFn: mockFetch as any,
    });
    client.setSessionId("sess_custom_abc");

    await client.listTools(true);
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["Mcp-Session-Id"]).toBe("sess_custom_abc");
  });

  it("executes callTool with arguments", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        jsonrpc: "2.0",
        id: 3,
        result: {
          content: [{ type: "text", text: "Workflow valid" }],
        },
      }),
    });

    const client = new McpClient({
      baseUrl: "https://mock.keeperhub.com",
      fetchFn: mockFetch as any,
    });

    const res = await client.callTool<{ content: Array<{ text: string }> }>(
      "validate_workflow",
      { workflow: { nodes: [], edges: [] } },
      true
    );

    expect(res.content[0]?.text).toBe("Workflow valid");
  });

  it("throws error when MCP server returns JSON-RPC error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        jsonrpc: "2.0",
        id: 4,
        error: { code: -32601, message: "Method not found" },
      }),
    });

    const client = new McpClient({
      baseUrl: "https://mock.keeperhub.com",
      fetchFn: mockFetch as any,
    });

    await expect(client.sendRpc("mcp", "unknown_method")).rejects.toThrow("MCP RPC Error (-32601): Method not found");
  });
});

describe("BULWARK Agent CLI Commands", () => {
  let tmpDir: string;
  let stdoutLogs: string[] = [];
  let stderrLogs: string[] = [];

  const captureStdout = (msg: string) => stdoutLogs.push(msg);
  const captureStderr = (msg: string) => stderrLogs.push(msg);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bulwark-agent-test-"));
    stdoutLogs = [];
    stderrLogs = [];
  });

  it("prints help on --help", async () => {
    const code = await runAgentCli(["--help"], { stdout: captureStdout, stderr: captureStderr });
    expect(code).toBe(0);
    expect(stdoutLogs.join("\n")).toContain("BULWARK AGENT");
    expect(stdoutLogs.join("\n")).toContain("discover");
    expect(stdoutLogs.join("\n")).toContain("validate");
  });

  it("prints version on --version", async () => {
    const code = await runAgentCli(["--version"], { stdout: captureStdout, stderr: captureStderr });
    expect(code).toBe(0);
    expect(stdoutLogs.join("\n")).toContain("bulwark-agent v0.1.0");
  });

  it("validates workflow file locally when network absent", async () => {
    const workflowPath = path.join(tmpDir, "test-wf.json");
    fs.writeFileSync(
      workflowPath,
      JSON.stringify({
        name: "Test Rescue Workflow",
        nodes: [{ id: "1", type: "trigger", data: {} }],
        edges: [],
      })
    );

    const code = await runAgentCli(["validate", workflowPath], {
      stdout: captureStdout,
      stderr: captureStderr,
    });
    expect(code).toBe(0);
    expect(stdoutLogs.join("\n")).toContain("Local validation PASS");
  });

  it("runs guard loop for 1 tick", async () => {
    process.env.BULWARK_STORE_DIR = tmpDir;
    const code = await runAgentCli(["guard", "--once"], {
      stdout: captureStdout,
      stderr: captureStderr,
    });
    expect(code).toBe(0);
    expect(stdoutLogs.join("\n")).toContain("Guardian tick result");
    delete process.env.BULWARK_STORE_DIR;
  });
});
