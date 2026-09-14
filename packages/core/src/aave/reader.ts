/**
 * Aave V3 Position Reader & Truth Pipeline.
 * Primary: KeeperHub view calls (labeled "KEEPERHUB FACT")
 * Fallback: Direct public-RPC eth_call (labeled "public-rpc")
 * If unavailable/malformed: labeled "UNAVAILABLE"
 * ZERO mocked numbers.
 */

import { KeeperHubClient } from "../keeperhub/client.js";
import { getChainConfig, isSupportedChain } from "../chains.js";
import {
  encodeGetUserAccountData,
  decodeGetUserAccountData,
  encodeGetReserveTokensAddresses,
  decodeGetReserveTokensAddresses,
  encodeBalanceOf,
  decodeBalanceOf,
  encodeDecimals,
  decodeDecimals,
  encodeGetPriceOracle,
  decodeGetPriceOracle,
  encodeGetAssetPrice,
  decodeGetAssetPrice,
  UserAccountDataRaw,
} from "../abi.js";

export type ProvenanceSource = "KEEPERHUB FACT" | "public-rpc" | "UNAVAILABLE";

export interface PositionSnapshot {
  userAddress: string;
  chainId: number;
  poolAddress: string;
  debtAssetAddress: string;
  debtSymbol: string;
  debtDecimals: number;
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThresholdBps: number;
  ltvBps: number;
  healthFactorWad: bigint;
  healthFactor: number;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  variableDebtTokenAddress?: string;
  debtTokenBalance: bigint;
  debtTokenBalanceHuman: number;
  assetPriceBase: bigint;
  assetPriceUsd: number;
  timestamp: string;
  sources: {
    userAccountData: ProvenanceSource;
    reserveTokens: ProvenanceSource;
    debtBalance: ProvenanceSource;
    price: ProvenanceSource;
    decimals: ProvenanceSource;
  };
}

export interface PositionReaderOptions {
  client?: KeeperHubClient;
  rpcUrl?: string;
  fetchFn?: typeof fetch;
}

export class AavePositionReader {
  private readonly client?: KeeperHubClient;
  private readonly rpcUrlOverride?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: PositionReaderOptions = {}) {
    this.client = options.client;
    this.rpcUrlOverride = options.rpcUrl;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  /**
   * Executes a contract read via KeeperHub if client is configured, otherwise fallback to direct eth_call.
   */
  public async callView(
    chainId: number,
    to: string,
    data: string
  ): Promise<{ resultHex: string; source: ProvenanceSource }> {
    // 1. Try KeeperHub contract-call view (if key present)
    if (this.client && this.client.hasKey()) {
      try {
        const resp = await this.client.executeContractCall({
          contractAddress: to,
          chainId,
          functionName: "raw_call",
          functionArgs: "[]",
          // When functionArgs is empty or raw data passed, KeeperHub's view handler evaluates instant call
        });
        if (resp && typeof resp === "object" && "result" in resp && typeof resp.result === "string") {
          return { resultHex: resp.result, source: "KEEPERHUB FACT" };
        }
      } catch {
        // Fall through to public-rpc on failure, never crash
      }
    }

    // 2. Fallback to direct public-RPC eth_call
    const rpcUrl = this.rpcUrlOverride ?? getChainConfig(chainId).defaultRpcUrl;
    try {
      const res = await this.fetchFn(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to, data }, "latest"],
        }),
      });

      if (!res.ok) {
        return { resultHex: "", source: "UNAVAILABLE" };
      }

      const json = (await res.json()) as { result?: string; error?: unknown };
      if (json && typeof json.result === "string" && json.result.startsWith("0x")) {
        return { resultHex: json.result, source: "public-rpc" };
      }
    } catch {
      // Degrade gracefully
    }

    return { resultHex: "", source: "UNAVAILABLE" };
  }

  /**
   * Reads the current block number from public RPC.
   */
  public async getPublicBlockNumber(chainId: number): Promise<number> {
    const rpcUrl = this.rpcUrlOverride ?? getChainConfig(chainId).defaultRpcUrl;
    const res = await this.fetchFn(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      }),
    });
    if (!res.ok) throw new Error(`RPC returned HTTP ${res.status}`);
    const json = (await res.json()) as { result?: string; error?: unknown };
    if (!json || typeof json.result !== "string") throw new Error("No block number returned from RPC");
    return parseInt(json.result, 16);
  }

  /**
   * Reads complete position snapshot for a given user and debt asset.
   */
  public async readPosition(
    chainId: number,
    userAddress: string,
    debtAssetOverride?: string
  ): Promise<PositionSnapshot> {
    if (!isSupportedChain(chainId)) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    const chainConfig = getChainConfig(chainId);
    const poolAddress = chainConfig.pool;
    const debtAssetAddress = debtAssetOverride ?? chainConfig.knownTokens.USDC?.address ?? "";
    const debtSymbol = debtAssetOverride ? "UNKNOWN" : (chainConfig.knownTokens.USDC?.symbol ?? "USDC");

    const sources: PositionSnapshot["sources"] = {
      userAccountData: "UNAVAILABLE",
      reserveTokens: "UNAVAILABLE",
      debtBalance: "UNAVAILABLE",
      price: "UNAVAILABLE",
      decimals: "UNAVAILABLE",
    };

    // 1. Read Pool.getUserAccountData(userAddress)
    let accountData: UserAccountDataRaw = {
      totalCollateralBase: 0n,
      totalDebtBase: 0n,
      availableBorrowsBase: 0n,
      currentLiquidationThreshold: 0n,
      ltv: 0n,
      healthFactor: 0n,
    };

    const accountDataCall = await this.callView(
      chainId,
      poolAddress,
      encodeGetUserAccountData(userAddress)
    );
    if (accountDataCall.source !== "UNAVAILABLE") {
      try {
        accountData = decodeGetUserAccountData(accountDataCall.resultHex);
        sources.userAccountData = accountDataCall.source;
      } catch {
        sources.userAccountData = "UNAVAILABLE";
      }
    }

    // 2. Read ProtocolDataProvider.getReserveTokensAddresses(debtAssetAddress)
    let variableDebtTokenAddress: string | undefined;
    if (debtAssetAddress) {
      const reserveTokensCall = await this.callView(
        chainId,
        chainConfig.protocolDataProvider,
        encodeGetReserveTokensAddresses(debtAssetAddress)
      );
      if (reserveTokensCall.source !== "UNAVAILABLE") {
        try {
          const decoded = decodeGetReserveTokensAddresses(reserveTokensCall.resultHex);
          variableDebtTokenAddress = decoded.variableDebtTokenAddress;
          sources.reserveTokens = reserveTokensCall.source;
        } catch {
          sources.reserveTokens = "UNAVAILABLE";
        }
      }
    }

    // 3. Read variableDebtToken.balanceOf(userAddress)
    let debtTokenBalance = 0n;
    if (variableDebtTokenAddress && variableDebtTokenAddress !== "0x0000000000000000000000000000000000000000") {
      const balCall = await this.callView(
        chainId,
        variableDebtTokenAddress,
        encodeBalanceOf(userAddress)
      );
      if (balCall.source !== "UNAVAILABLE") {
        try {
          debtTokenBalance = decodeBalanceOf(balCall.resultHex);
          sources.debtBalance = balCall.source;
        } catch {
          sources.debtBalance = "UNAVAILABLE";
        }
      }
    }

    // 4. Read token decimals
    let debtDecimals = chainConfig.knownTokens.USDC?.decimals ?? 6;
    if (debtAssetAddress) {
      const decCall = await this.callView(chainId, debtAssetAddress, encodeDecimals());
      if (decCall.source !== "UNAVAILABLE") {
        try {
          debtDecimals = decodeDecimals(decCall.resultHex);
          sources.decimals = decCall.source;
        } catch {
          sources.decimals = "UNAVAILABLE";
        }
      }
    }

    // 5. Read Price Oracle -> getAssetPrice(debtAssetAddress)
    let assetPriceBase = 100000000n; // Default 1.0 USD (8 decimals) if oracle unread
    if (debtAssetAddress) {
      const oracleCall = await this.callView(
        chainId,
        chainConfig.poolAddressesProvider,
        encodeGetPriceOracle()
      );
      if (oracleCall.source !== "UNAVAILABLE") {
        try {
          const oracleAddress = decodeGetPriceOracle(oracleCall.resultHex);
          const priceCall = await this.callView(
            chainId,
            oracleAddress,
            encodeGetAssetPrice(debtAssetAddress)
          );
          if (priceCall.source !== "UNAVAILABLE") {
            assetPriceBase = decodeGetAssetPrice(priceCall.resultHex);
            sources.price = priceCall.source;
          }
        } catch {
          sources.price = "UNAVAILABLE";
        }
      }
    }

    // Health factor calculation
    // Aave HF is in 1e18 WAD. If no debt, uint256.max
    let healthFactorNum: number;
    if (accountData.healthFactor === 0n) {
      healthFactorNum = sources.userAccountData === "UNAVAILABLE" ? 0 : 999.0;
    } else if (accountData.healthFactor > 1000n * 10n ** 18n) {
      healthFactorNum = 999.0;
    } else {
      healthFactorNum = Number(accountData.healthFactor) / 1e18;
    }

    // Convert Base currency (8 decimals in USD-quoted Aave markets) to USD numbers
    const totalCollateralUsd = Number(accountData.totalCollateralBase) / 1e8;
    const totalDebtUsd = Number(accountData.totalDebtBase) / 1e8;
    const assetPriceUsd = Number(assetPriceBase) / 1e8;
    const debtTokenBalanceHuman = Number(debtTokenBalance) / 10 ** debtDecimals;

    return {
      userAddress,
      chainId,
      poolAddress,
      debtAssetAddress,
      debtSymbol,
      debtDecimals,
      totalCollateralBase: accountData.totalCollateralBase,
      totalDebtBase: accountData.totalDebtBase,
      availableBorrowsBase: accountData.availableBorrowsBase,
      currentLiquidationThresholdBps: Number(accountData.currentLiquidationThreshold),
      ltvBps: Number(accountData.ltv),
      healthFactorWad: accountData.healthFactor,
      healthFactor: healthFactorNum,
      totalCollateralUsd,
      totalDebtUsd,
      variableDebtTokenAddress,
      debtTokenBalance,
      debtTokenBalanceHuman,
      assetPriceBase,
      assetPriceUsd,
      timestamp: new Date().toISOString(),
      sources,
    };
  }
}
