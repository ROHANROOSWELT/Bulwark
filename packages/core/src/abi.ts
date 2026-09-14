/**
 * ABI encoding and decoding for the verified Aave V3 and ERC20 view/write set.
 * Zero external dependencies.
 */

import { functionSelector } from "./keccak.js";

// Padded 32-byte word helpers
export function padAddress(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/, "");
  if (clean.length > 40) throw new Error(`Invalid address length: ${address}`);
  return clean.padStart(64, "0");
}

export function padUint256(value: bigint | number | string): string {
  const bn = BigInt(value);
  if (bn < 0n) throw new Error(`uint256 cannot be negative: ${value}`);
  const hex = bn.toString(16);
  if (hex.length > 64) throw new Error(`uint256 overflow: ${value}`);
  return hex.padStart(64, "0");
}

export function decodeAddress(word32Hex: string): string {
  const clean = word32Hex.replace(/^0x/, "");
  if (clean.length < 64) throw new Error(`Invalid 32-byte word for address: ${word32Hex}`);
  return "0x" + clean.slice(24, 64).toLowerCase();
}

export function decodeUint256(word32Hex: string): bigint {
  const clean = word32Hex.replace(/^0x/, "");
  if (clean.length < 64) throw new Error(`Invalid 32-byte word for uint256: ${word32Hex}`);
  return BigInt("0x" + clean.slice(0, 64));
}

// Verified Function Signatures
export const SELECTORS = {
  getUserAccountData: "0xbf92857c", // getUserAccountData(address)
  getReserveTokensAddresses: "0x3e18525b", // getReserveTokensAddresses(address)
  balanceOf: "0x70a08231", // balanceOf(address)
  decimals: "0x313ce567", // decimals()
  getPriceOracle: "0x0952d7dd", // getPriceOracle()
  getAssetPrice: "0xb3ab73ab", // getAssetPrice(address)
  repay: "0x573ade81", // repay(address,uint256,uint256,address)
  withdraw: "0x69328dec", // withdraw(address,uint256,address)
  supply: "0x617ba037", // supply(address,uint256,address,uint16)
  approve: "0x095ea7b3", // approve(address,uint256)
  transfer: "0xa9059cbb", // transfer(address,uint256)
} as const;

// Encoders for verified read calls
export function encodeGetUserAccountData(userAddress: string): string {
  return SELECTORS.getUserAccountData + padAddress(userAddress);
}

export function encodeGetReserveTokensAddresses(assetAddress: string): string {
  return SELECTORS.getReserveTokensAddresses + padAddress(assetAddress);
}

export function encodeBalanceOf(accountAddress: string): string {
  return SELECTORS.balanceOf + padAddress(accountAddress);
}

export function encodeDecimals(): string {
  return SELECTORS.decimals;
}

export function encodeGetPriceOracle(): string {
  return SELECTORS.getPriceOracle;
}

export function encodeGetAssetPrice(assetAddress: string): string {
  return SELECTORS.getAssetPrice + padAddress(assetAddress);
}

// Decoders for verified read returns
export interface UserAccountDataRaw {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
}

export function decodeGetUserAccountData(dataHex: string): UserAccountDataRaw {
  const clean = dataHex.replace(/^0x/, "");
  if (clean.length < 64 * 6) {
    throw new Error(`Invalid return data length for getUserAccountData: expected 384 hex chars (6 words), got ${clean.length}`);
  }
  return {
    totalCollateralBase: decodeUint256(clean.slice(0, 64)),
    totalDebtBase: decodeUint256(clean.slice(64, 128)),
    availableBorrowsBase: decodeUint256(clean.slice(128, 192)),
    currentLiquidationThreshold: decodeUint256(clean.slice(192, 256)),
    ltv: decodeUint256(clean.slice(256, 320)),
    healthFactor: decodeUint256(clean.slice(320, 384)),
  };
}

export interface ReserveTokensAddresses {
  aTokenAddress: string;
  stableDebtTokenAddress: string;
  variableDebtTokenAddress: string;
}

export function decodeGetReserveTokensAddresses(dataHex: string): ReserveTokensAddresses {
  const clean = dataHex.replace(/^0x/, "");
  if (clean.length < 64 * 3) {
    throw new Error(`Invalid return data length for getReserveTokensAddresses: expected 192 hex chars (3 words), got ${clean.length}`);
  }
  return {
    aTokenAddress: decodeAddress(clean.slice(0, 64)),
    stableDebtTokenAddress: decodeAddress(clean.slice(64, 128)),
    variableDebtTokenAddress: decodeAddress(clean.slice(128, 192)),
  };
}

export function decodeBalanceOf(dataHex: string): bigint {
  const clean = dataHex.replace(/^0x/, "");
  if (clean.length < 64) {
    throw new Error(`Invalid return data length for balanceOf: expected at least 64 hex chars, got ${clean.length}`);
  }
  return decodeUint256(clean.slice(0, 64));
}

export function decodeDecimals(dataHex: string): number {
  const clean = dataHex.replace(/^0x/, "");
  if (clean.length < 64) {
    throw new Error(`Invalid return data length for decimals: expected at least 64 hex chars, got ${clean.length}`);
  }
  return Number(decodeUint256(clean.slice(0, 64)));
}

export function decodeGetPriceOracle(dataHex: string): string {
  const clean = dataHex.replace(/^0x/, "");
  if (clean.length < 64) {
    throw new Error(`Invalid return data length for getPriceOracle: expected at least 64 hex chars, got ${clean.length}`);
  }
  return decodeAddress(clean.slice(0, 64));
}

export function decodeGetAssetPrice(dataHex: string): bigint {
  const clean = dataHex.replace(/^0x/, "");
  if (clean.length < 64) {
    throw new Error(`Invalid return data length for getAssetPrice: expected at least 64 hex chars, got ${clean.length}`);
  }
  return decodeUint256(clean.slice(0, 64));
}

// Verified ABI JSON fragments for KeeperHub contract-calls
export const AAVE_V3_REPAY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "asset", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "interestRateMode", type: "uint256" },
      { internalType: "address", name: "onBehalfOf", type: "address" },
    ],
    name: "repay",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const AAVE_V3_WITHDRAW_ABI = [
  {
    inputs: [
      { internalType: "address", name: "asset", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
    ],
    name: "withdraw",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const AAVE_V3_SUPPLY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "asset", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "onBehalfOf", type: "address" },
      { internalType: "uint16", name: "referralCode", type: "uint16" },
    ],
    name: "supply",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const AAVE_V3_USER_ACCOUNT_DATA_ABI = [
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getUserAccountData",
    outputs: [
      { internalType: "uint256", name: "totalCollateralBase", type: "uint256" },
      { internalType: "uint256", name: "totalDebtBase", type: "uint256" },
      { internalType: "uint256", name: "availableBorrowsBase", type: "uint256" },
      { internalType: "uint256", name: "currentLiquidationThreshold", type: "uint256" },
      { internalType: "uint256", name: "ltv", type: "uint256" },
      { internalType: "uint256", name: "healthFactor", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const AAVE_ORACLE_GET_ASSET_PRICE_ABI = [
  {
    inputs: [{ internalType: "address", name: "asset", type: "address" }],
    name: "getAssetPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

