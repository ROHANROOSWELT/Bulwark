/**
 * Verified Chain and Contract Registry for Aave V3 deployments.
 * Evidence sources: docs/RESEARCH_AAVE.md and docs/RESEARCH_KEEPERHUB.md
 */

export interface ChainConfig {
  chainId: number;
  name: string;
  isTestnet: boolean;
  pool: string;
  poolAddressesProvider: string;
  protocolDataProvider: string;
  oracle?: string;
  defaultRpcUrl: string;
  blockExplorerUrl: string;
  knownTokens: Record<string, { symbol: string; address: string; decimals: number }>;
}

export const CHAINS: Record<number, ChainConfig> = {
  // 11155111 Sepolia (Aave V3 testnet market)
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    isTestnet: true,
    pool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
    poolAddressesProvider: "0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A",
    protocolDataProvider: "0x3e9708d80f7B3e43118013075F7e95CE3AB31F31",
    oracle: "0x287908E6814aC862A1F450e1FcfB1c41A1a03e68",
    defaultRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    blockExplorerUrl: "https://sepolia.etherscan.io",
    knownTokens: {
      USDC: {
        symbol: "USDC",
        address: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
        decimals: 6,
      },
      WETH: {
        symbol: "WETH",
        address: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c",
        decimals: 18,
      },
    },
  },
  // 8453 Base (Aave V3 Production)
  8453: {
    chainId: 8453,
    name: "Base",
    isTestnet: false,
    pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    poolAddressesProvider: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
    protocolDataProvider: "0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A",
    oracle: "0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156",
    defaultRpcUrl: "https://mainnet.base.org",
    blockExplorerUrl: "https://basescan.org",
    knownTokens: {
      USDC: {
        symbol: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 6,
      },
    },
  },
  // 1 Ethereum (Aave V3 Production Reference)
  1: {
    chainId: 1,
    name: "Ethereum",
    isTestnet: false,
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    poolAddressesProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
    protocolDataProvider: "0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD",
    oracle: "0x54586bE62E3c3580375aE3723C145253060Ca0C2",
    defaultRpcUrl: "https://ethereum-rpc.publicnode.com",
    blockExplorerUrl: "https://etherscan.io",
    knownTokens: {
      USDC: {
        symbol: "USDC",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
      },
    },
  },
};

export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAINS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}. Supported chains: ${Object.keys(CHAINS).join(", ")}`);
  }
  return config;
}

export function isSupportedChain(chainId: number): boolean {
  return chainId in CHAINS;
}
