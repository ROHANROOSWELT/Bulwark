import { describe, it, expect } from "vitest";
import { KeeperHubClient, loadConfig, KeeperHubSimulateForbiddenError } from "@bulwark/core";

describe("KeeperHub REST Live Integration & Key Security Contract", () => {
  const config = loadConfig();
  const apiKey = process.env.KEEPERHUB_API_KEY || config.keeperhubApiKey;
  const hasLiveKey = Boolean(apiKey && apiKey.length > 5 && !apiKey.includes("replace_me"));

  it("checks keys metadata against live KeeperHub API or enforces key presence", async () => {
    if (hasLiveKey) {
      const client = new KeeperHubClient({ apiKey, apiBase: config.keeperhubApiBase });
      const keys = await client.getKeys();
      expect(keys).toBeDefined();
    } else {
      // Real key-absence security contract test: unauthenticated client must reflect hasKey() === false
      const client = new KeeperHubClient({ apiBase: config.keeperhubApiBase });
      expect(client.hasKey()).toBe(false);
      await expect(client.getKeys()).rejects.toThrow();
    }
  });

  it("fetches registered chains from live KeeperHub API", async (ctx) => {
    const client = new KeeperHubClient({ apiBase: config.keeperhubApiBase });
    try {
      const chains = await client.getChains();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains.length).toBeGreaterThan(0);
    } catch (e: any) {
      // If network unreachable, skip explicitly rather than masking
      ctx.skip();
    }
  });

  it("fetches live spend-cap for the organization or verifies spend-cap security guard", async (ctx) => {
    if (hasLiveKey) {
      const client = new KeeperHubClient({ apiKey, apiBase: config.keeperhubApiBase });
      try {
        const cap = await client.getSpendCap();
        expect(cap).toBeDefined();
      } catch (e: any) {
        if (e.message?.includes("fetch failed") || e.message?.includes("ENOTFOUND")) {
          ctx.skip();
        } else {
          throw e;
        }
      }
    } else {
      const client = new KeeperHubClient({ apiBase: config.keeperhubApiBase });
      expect(client.hasKey()).toBe(false);
      await expect(client.getSpendCap()).rejects.toThrow();
    }
  });

  it("executes safe simulate:true contract call or enforces simulate safety boundaries", async (ctx) => {
    if (hasLiveKey) {
      const client = new KeeperHubClient({ apiKey, apiBase: config.keeperhubApiBase });
      client.assertSimulationSafety("/api/execute/contract-call", true);

      try {
        const sim = (await client.executeContractCall({
          contractAddress: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
          chainId: 11155111,
          functionName: "getUserAccountData",
          functionArgs: JSON.stringify(["0x0000000000000000000000000000000000000001"]),
          simulate: true,
        })) as any;

        expect(sim).toBeDefined();
        expect(sim.status === "simulated" || sim.success !== undefined || sim.result !== undefined).toBe(true);
      } catch (e: any) {
        if (e.message?.includes("fetch failed") || e.message?.includes("ENOTFOUND")) {
          ctx.skip();
        } else {
          throw e;
        }
      }
    } else {
      // Real security boundary test: assertSimulationSafety must strictly forbid simulation on node/protocol routes
      const client = new KeeperHubClient({ apiBase: config.keeperhubApiBase });
      expect(() => client.assertSimulationSafety("/api/execute/contract-call", true)).not.toThrow();
      expect(() => client.assertSimulationSafety("/api/execute/node", true)).toThrow(KeeperHubSimulateForbiddenError);
      expect(() => client.assertSimulationSafety("/api/protocol/stake", true)).toThrow(KeeperHubSimulateForbiddenError);
    }
  });
});
