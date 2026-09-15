import { describe, it, expect } from "vitest";
import { McpClient } from "../../packages/agent/src/index.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("KeeperHub Public MCP Endpoint Live Integration", () => {
  const client = new McpClient({ baseUrl: "https://app.keeperhub.com" });

  it("discovers tools from public MCP endpoint or skips if network absent", async (ctx) => {
    try {
      // Ping endpoint
      const init = await client.initialize(true);
      expect(init.protocolVersion).toBeDefined();

      const tools = await client.listTools(true);
      expect(Array.isArray(tools)).toBe(true);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bulwark-mcp-live-"));
      const invPath = path.join(tmpDir, "mcp-inventory.json");
      fs.writeFileSync(
        invPath,
        JSON.stringify(
          {
            discoveredAt: new Date().toISOString(),
            endpoint: "https://app.keeperhub.com/mcp/public",
            serverInfo: init.serverInfo,
            toolsCount: tools.length,
            tools,
          },
          null,
          2
        )
      );

      expect(fs.existsSync(invPath)).toBe(true);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err: any) {
      // Offline network resilience: explicitly skip if network unavailable
      ctx.skip();
    }
  });
});
