import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BulwarkStore, AavePositionReader, KeeperHubClient } from "@bulwark/core";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Failure & Resilience Suite (BUILD.md §6.5)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bulwark-fail-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("store corruption: invalid JSON in grants.json throws explicit error instead of silent reset", async () => {
    const store = new BulwarkStore(tmpDir);
    await store.init();

    // Corrupt grants.json with invalid syntax
    const grantsFile = path.join(tmpDir, "grants.json");
    fs.writeFileSync(grantsFile, "CORRUPT_NOT_JSON{{{{");

    // Must throw an error, NEVER silently overwrite or reset the file to empty array!
    await expect(store.getGrants()).rejects.toThrow();

    // File content remains corrupt (preserving forensics)
    const content = fs.readFileSync(grantsFile, "utf-8");
    expect(content).toBe("CORRUPT_NOT_JSON{{{{");
  });

  it("store corruption: invalid JSON in capacity.json throws explicit error", async () => {
    const store = new BulwarkStore(tmpDir);
    await store.init();

    const capFile = path.join(tmpDir, "capacity.json");
    fs.writeFileSync(capFile, "{broken_json");

    await expect(store.getCapacity()).rejects.toThrow();
  });

  it("RPC outage fallback: when both KeeperHub view and public RPC fail, reader degrades to UNAVAILABLE", async () => {
    // Failing KeeperHub client
    const client = new KeeperHubClient({
      apiKey: "kh_test",
      apiBase: "https://mock.keeperhub.com",
      fetchFn: async () => {
        throw new Error("KeeperHub API 503 Service Unavailable");
      },
    });

    // Failing public RPC
    const reader = new AavePositionReader({
      client,
      fetchFn: async () => {
        throw new Error("RPC network unreachable");
      },
    });

    // Should return snapshot with UNAVAILABLE provenance, NEVER crash
    const snapshot = await reader.readPosition(11155111, "0x1111111111111111111111111111111111111111");
    expect(snapshot.sources.userAccountData).toBe("UNAVAILABLE");
    expect(snapshot.sources.price).toBe("UNAVAILABLE");
    expect(snapshot.sources.decimals).toBe("UNAVAILABLE");
    expect(snapshot.healthFactor).toBe(0);
  });

  it("network retry exhaustion: 429 rate limit with Retry-After respects header and throws typed error", async () => {
    let callCount = 0;
    const client = new KeeperHubClient({
      apiKey: "kh_test",
      apiBase: "https://mock.keeperhub.com",
      fetchFn: async () => {
        callCount++;
        return new Response(
          JSON.stringify({ error: "Too Many Requests", detail: "Rate limit exceeded" }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "2",
            },
          }
        );
      },
    });

    try {
      await client.getSpendCap();
      expect.fail("Expected Rate limit error");
    } catch (err: any) {
      expect(err.status).toBe(429);
      expect(err.retryAfter).toBe(2);
      expect(err.message).toContain("Rate limit exceeded");
    }
  });
});
