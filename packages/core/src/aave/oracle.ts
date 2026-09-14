/**
 * Aave V3 Oracle Truth Reader.
 * Directly queries Aave's on-chain AaveOracle contract.
 * Zero external dependencies.
 * Source of truth: docs/RESEARCH_AAVE.md and docs/BUILD.md.
 */

import { encodeGetAssetPrice, decodeUint256 } from "../abi.js";

export function decodeAssetPrice(hexData: string): bigint {
  return decodeUint256(hexData);
}

/**
 * Reads asset price directly from the on-chain AaveOracle contract via JSON-RPC.
 * Returns base currency units with 8 decimals (1 USD = 100,000,000).
 */
export async function readAssetPrice(
  rpcUrl: string,
  oracleAddress: string,
  assetAddress: string,
  customFetch: typeof fetch = fetch
): Promise<bigint> {
  const calldata = encodeGetAssetPrice(assetAddress);

  const res = await customFetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: oracleAddress, data: calldata }, "latest"],
    }),
  });

  if (!res.ok) {
    throw new Error(`AaveOracle RPC call failed with HTTP status ${res.status}`);
  }

  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error || !json.result || json.result === "0x") {
    throw new Error(`AaveOracle read failed: ${json.error?.message ?? "Empty result"}`);
  }

  return decodeAssetPrice(json.result);
}

/**
 * Converts on-chain base price to human USD.
 */
export function basePriceToUsd(basePrice: bigint): number {
  return Number(basePrice) / 1e8;
}

/**
 * Validates whether live price is within the grant's allowable price band.
 */
export function validatePriceBand(
  livePriceUsd: number,
  baselinePriceUsd: number,
  maxBandPct: number
): { ok: boolean; driftPct: number; reason?: string } {
  if (baselinePriceUsd <= 0) return { ok: true, driftPct: 0 };
  const drift = Math.abs(livePriceUsd - baselinePriceUsd) / baselinePriceUsd;
  const ok = drift <= maxBandPct;
  return {
    ok,
    driftPct: Math.round(drift * 1000) / 10,
    reason: ok
      ? undefined
      : `Asset price drifted ${(drift * 100).toFixed(1)}% from baseline ($${baselinePriceUsd.toFixed(2)} -> $${livePriceUsd.toFixed(2)}), exceeding ${(maxBandPct * 100).toFixed(0)}% tolerance`,
  };
}
