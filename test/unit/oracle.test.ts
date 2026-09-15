import { describe, it, expect } from "vitest";
import { encodeGetAssetPrice } from "../../packages/core/src/abi.js";
import {
  decodeAssetPrice,
  readAssetPrice,
  basePriceToUsd,
  validatePriceBand,
} from "../../packages/core/src/aave/oracle.js";

describe("Aave V3 Oracle Truth Reader", () => {
  const mockAsset = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8"; // Sepolia USDC
  const mockOracle = "0x287908E6814aC862A1F450e1FcfB1c41A1a03e68";

  it("encodes getAssetPrice selector and padded asset address", () => {
    const encoded = encodeGetAssetPrice(mockAsset);
    expect(encoded.startsWith("0xb3596f07")).toBe(true);
    expect(encoded.length).toBe(10 + 64); // 0x + 8 selector chars + 64 hex chars
    expect(encoded.toLowerCase()).toContain(mockAsset.toLowerCase().replace("0x", ""));
  });

  it("decodes asset price hex correctly", () => {
    // 1 USD in base currency (8 decimals) = 100,000,000 = 0x5f5e100
    const hex = "0x0000000000000000000000000000000000000000000000000000000005f5e100";
    const price = decodeAssetPrice(hex);
    expect(price).toBe(100000000n);
    expect(basePriceToUsd(price)).toBe(1.0);
  });

  it("reads asset price from JSON-RPC and parses base price", async () => {
    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = JSON.parse(init?.body as string);
      expect(body.method).toBe("eth_call");
      expect(body.params[0].to).toBe(mockOracle);

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: "0x0000000000000000000000000000000000000000000000000000000005f5e100", // $1.00 USD
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const price = await readAssetPrice("https://mock-rpc.local", mockOracle, mockAsset, mockFetch as unknown as typeof fetch);
    expect(price).toBe(100000000n);
    expect(basePriceToUsd(price)).toBe(1.0);
  });

  it("validates price band against drift threshold", () => {
    // Within 15% tolerance: $1.00 -> $1.10 = 10% drift -> OK
    const okCheck = validatePriceBand(1.10, 1.00, 0.15);
    expect(okCheck.ok).toBe(true);
    expect(okCheck.driftPct).toBe(10);

    // Exceeds 15% tolerance: $1.00 -> $1.20 = 20% drift -> REJECT
    const failCheck = validatePriceBand(1.20, 1.00, 0.15);
    expect(failCheck.ok).toBe(false);
    expect(failCheck.driftPct).toBe(20);
    expect(failCheck.reason).toContain("exceeding 15% tolerance");
  });
});
