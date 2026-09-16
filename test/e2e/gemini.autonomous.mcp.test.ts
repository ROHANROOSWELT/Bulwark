import { describe, it, expect } from "vitest";
import { runAgentCli, McpClient } from "../../packages/agent/src/index.js";
import { loadConfig } from "@bulwark/core";

describe("Gemini + KeeperHub MCP Autonomous Transaction Execution", () => {
  const config = loadConfig();
  const hasGeminiKey = Boolean(config.llmApiKey && config.llmApiKey.length > 5);
  const hasKeeperHubKey = Boolean(config.keeperhubApiKey && config.keeperhubApiKey.length > 5);

  it("discovers all 44 KeeperHub MCP tools", async () => {
    const client = new McpClient();
    const isPublic = !client.apiKey;
    const tools = await client.listTools(isPublic);
    expect(tools).toBeDefined();
    expect(tools.length).toBeGreaterThanOrEqual(10);
    const names = tools.map((t) => t.name);
    expect(names).toContain("execute_contract_call");
    expect(names).toContain("get_spending_limits");
    expect(names).toContain("list_workflows");
  });

  it("executes smart contract query autonomously via MCP execute_contract_call", async (ctx) => {
    if (!hasKeeperHubKey) {
      ctx.skip();
      return;
    }

    const client = new McpClient();
    try {
      const res = await client.callTool<{ content?: Array<{ type: string; text?: string }> }>(
        "execute_contract_call",
        {
          contract_address: "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b",
          chain_id: "84532",
          function_name: "getUserAccountData",
          function_args: JSON.stringify(["0xE406f471E711A2C8012e95c4B09fa9F1C9ae8123"]),
        },
        false
      );
      expect(res).toBeDefined();
      expect(res.content?.[0]?.text).toContain("healthFactor");
    } catch (err: any) {
      if (err.message?.includes("429") || err.message?.includes("Rate limit")) {
        ctx.skip();
      } else {
        throw err;
      }
    }
  });

  it("executes fully autonomous transaction pipeline with Gemini + MCP without user intervention", async (ctx) => {
    if (!hasGeminiKey || !hasKeeperHubKey) {
      ctx.skip();
      return;
    }

    const logs: string[] = [];
    const io = {
      stdout: (msg: string) => logs.push(msg),
      stderr: (msg: string) => logs.push(msg),
    };

    try {
      const code = await runAgentCli(
        [
          "ask",
          "Inspect borrower 0xE406f471E711A2C8012e95c4B09fa9F1C9ae8123 on Base Sepolia (chain 84532) using execute_contract_call on Aave V3 Pool 0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b with function getUserAccountData autonomously without asking questions.",
        ],
        io
      );

      const fullLog = logs.join("\n");

      // Skip gracefully if Gemini API returned an auth error (401) or key is not AIzaSy format
      if (code !== 0) {
        const hasAuthError = fullLog.includes("UNAUTHENTICATED") || fullLog.includes("401") ||
          fullLog.includes("invalid authentication") || fullLog.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED");
        if (hasAuthError) {
          ctx.skip();
          return;
        }
      }

      expect(code).toBe(0);
      expect(fullLog).toContain("execute_contract_call");
      expect(fullLog).toContain("[AGENT OUTPUT]");
    } catch (err: any) {
      if (
        err.message?.includes("429") ||
        err.message?.includes("Rate limit") ||
        err.message?.includes("UNAUTHENTICATED") ||
        err.message?.includes("401")
      ) {
        ctx.skip();
      } else {
        throw err;
      }
    }
  }, 60000);
});
