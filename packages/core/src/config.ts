/**
 * Bulwark Configuration & Environment Loader.
 * Reads environment variables, sets verified defaults, and performs type validation.
 */

import { isSupportedChain, getChainConfig } from "./chains.js";

export interface BulwarkConfig {
  keeperhubApiKey?: string;
  keeperhubApiBase: string;
  chainId: number;
  policyMaxUsdPerAction: number;
  policyHfCritical: number;
  policyHfTarget: number;
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel: string;
  storeDir: string;
  webPort: number;
  autoApprove: boolean;
  rpcUrls: {
    sepolia?: string;
    base?: string;
    ethereum?: string;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BulwarkConfig {
  const chainIdStr = env.BULWARK_CHAIN_ID ?? "11155111";
  const chainId = parseInt(chainIdStr, 10);
  if (isNaN(chainId)) {
    throw new Error(`Invalid BULWARK_CHAIN_ID: "${chainIdStr}". Must be a number.`);
  }

  if (!isSupportedChain(chainId)) {
    throw new Error(`Unsupported chain ID: ${chainId}. Valid options: 11155111 (Sepolia), 8453 (Base), 1 (Ethereum).`);
  }

  const policyMaxUsdPerAction = parseFloat(env.BULWARK_POLICY_MAX_USD_PER_ACTION ?? "25");
  if (isNaN(policyMaxUsdPerAction) || policyMaxUsdPerAction <= 0) {
    throw new Error(`Invalid BULWARK_POLICY_MAX_USD_PER_ACTION: must be a positive number.`);
  }

  const policyHfCritical = parseFloat(env.BULWARK_POLICY_HF_CRITICAL ?? "1.2");
  if (isNaN(policyHfCritical) || policyHfCritical <= 1.0) {
    throw new Error(`Invalid BULWARK_POLICY_HF_CRITICAL: must be > 1.0.`);
  }

  const policyHfTarget = parseFloat(env.BULWARK_POLICY_HF_TARGET ?? "2.0");
  if (isNaN(policyHfTarget) || policyHfTarget <= policyHfCritical) {
    throw new Error(`Invalid BULWARK_POLICY_HF_TARGET: must be > critical threshold (${policyHfCritical}).`);
  }

  const webPort = parseInt(env.BULWARK_WEB_PORT ?? "4567", 10);
  if (isNaN(webPort) || webPort <= 0 || webPort > 65535) {
    throw new Error(`Invalid BULWARK_WEB_PORT: must be between 1 and 65535.`);
  }

  return {
    keeperhubApiKey: env.KEEPERHUB_API_KEY && env.KEEPERHUB_API_KEY !== "kh_replace_me" ? env.KEEPERHUB_API_KEY : undefined,
    keeperhubApiBase: env.KEEPERHUB_API_BASE ?? "https://app.keeperhub.com",
    chainId,
    policyMaxUsdPerAction,
    policyHfCritical,
    policyHfTarget,
    llmBaseUrl: env.BULWARK_LLM_BASE_URL,
    llmApiKey: env.BULWARK_LLM_API_KEY,
    llmModel: env.BULWARK_LLM_MODEL ?? "gpt-4o-mini",
    storeDir: env.BULWARK_STORE_DIR ?? (process.env.VERCEL ? "/tmp/.bulwark" : ".bulwark"),
    webPort,
    autoApprove: env.BULWARK_AUTO_APPROVE === "1" || env.BULWARK_AUTO_APPROVE === "true",
    rpcUrls: {
      sepolia: env.BULWARK_RPC_URL_SEPOLIA,
      base: env.BULWARK_RPC_URL_BASE,
      ethereum: env.BULWARK_RPC_URL_ETHEREUM,
    },
  };
}

export function getRpcUrlForChain(chainId: number, config: BulwarkConfig): string {
  if (chainId === 11155111 && config.rpcUrls.sepolia) return config.rpcUrls.sepolia;
  if (chainId === 8453 && config.rpcUrls.base) return config.rpcUrls.base;
  if (chainId === 1 && config.rpcUrls.ethereum) return config.rpcUrls.ethereum;
  return getChainConfig(chainId).defaultRpcUrl;
}
