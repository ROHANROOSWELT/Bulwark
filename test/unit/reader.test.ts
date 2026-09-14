import { describe, it, expect } from "vitest";
import { AavePositionReader } from "../../packages/core/src/aave/reader.js";
import { padAddress, padUint256, SELECTORS } from "../../packages/core/src/abi.js";

// Labeled FIXTURE RPC transport
function createFixtureRpc(handler: (to: string, data: string) => string): typeof fetch {
  return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const parsed = JSON.parse(String(init?.body));
    const to = parsed.params?.[0]?.to?.toLowerCase();
    const data = parsed.params?.[0]?.data?.toLowerCase();
    const resultHex = handler(to, data);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: resultHex }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("AavePositionReader (FIXTURE tests)", () => {
  const user = "0x1111111111111111111111111111111111111111";

  it("reads and parses valid position snapshot via public-rpc fallback", async () => {
    const fetchFn = createFixtureRpc((to, data) => {
      // getUserAccountData
      if (data.startsWith(SELECTORS.getUserAccountData.toLowerCase())) {
        return "0x" +
          padUint256(100000000000n) + // 1000 USD (8 decimals)
          padUint256(50000000000n) +  // 500 USD debt (8 decimals)
          padUint256(20000000000n) +  // available
          padUint256(8000n) +         // 80% liquidation threshold
          padUint256(7500n) +         // 75% ltv
          padUint256(1600000000000000000n); // HF 1.6 WAD
      }
      // getReserveTokensAddresses
      if (data.startsWith(SELECTORS.getReserveTokensAddresses.toLowerCase())) {
        return "0x" +
          padAddress("0xaaaa000000000000000000000000000000000000") +
          padAddress("0xbbbb000000000000000000000000000000000000") +
          padAddress("0xcccc000000000000000000000000000000000000"); // vDebtToken
      }
      // balanceOf on vDebtToken
      if (to === "0xcccc000000000000000000000000000000000000" && data.startsWith(SELECTORS.balanceOf.toLowerCase())) {
        return "0x" + padUint256(500000000n); // 500 USDC (6 decimals)
      }
      // decimals
      if (data.startsWith(SELECTORS.decimals.toLowerCase())) {
        return "0x" + padUint256(6n);
      }
      // getPriceOracle
      if (data.startsWith(SELECTORS.getPriceOracle.toLowerCase())) {
        return "0x" + padAddress("0xdddd000000000000000000000000000000000000");
      }
      // getAssetPrice
      if (data.startsWith(SELECTORS.getAssetPrice.toLowerCase())) {
        return "0x" + padUint256(100000000n); // 1.00 USD (8 decimals)
      }
      return "0x";
    });

    const reader = new AavePositionReader({ fetchFn });
    const snapshot = await reader.readPosition(11155111, user);

    expect(snapshot.chainId).toBe(11155111);
    expect(snapshot.totalCollateralUsd).toBe(1000);
    expect(snapshot.totalDebtUsd).toBe(500);
    expect(snapshot.healthFactor).toBeCloseTo(1.6);
    expect(snapshot.currentLiquidationThresholdBps).toBe(8000);
    expect(snapshot.debtTokenBalanceHuman).toBe(500);
    expect(snapshot.assetPriceUsd).toBe(1.0);
    expect(snapshot.sources.userAccountData).toBe("public-rpc");
    expect(snapshot.sources.debtBalance).toBe("public-rpc");
  });

  it("handles malformed data by marking fields UNAVAILABLE without crashing", async () => {
    const fetchFn = createFixtureRpc(() => "0x1234"); // Truncated invalid return

    const reader = new AavePositionReader({ fetchFn });
    const snapshot = await reader.readPosition(11155111, user);

    expect(snapshot.sources.userAccountData).toBe("UNAVAILABLE");
    expect(snapshot.sources.debtBalance).toBe("UNAVAILABLE");
    expect(snapshot.totalCollateralUsd).toBe(0);
    expect(snapshot.totalDebtUsd).toBe(0);
    expect(snapshot.healthFactor).toBe(0); // 0 when unavailable
  });

  it("rejects unsupported chain with typed error", async () => {
    const reader = new AavePositionReader();
    await expect(reader.readPosition(99999, user)).rejects.toThrow(/Unsupported chain ID/);
  });
});
