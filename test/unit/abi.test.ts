import { describe, it, expect } from "vitest";
import {
  padAddress,
  padUint256,
  decodeAddress,
  decodeUint256,
  SELECTORS,
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
  AAVE_V3_REPAY_ABI,
  AAVE_V3_WITHDRAW_ABI,
  AAVE_V3_SUPPLY_ABI,
  ERC20_APPROVE_ABI,
} from "../../packages/core/src/abi.js";

describe("abi primitives", () => {
  const sampleUser = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
  const sampleAsset = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

  it("pads address and uint256 properly", () => {
    const padded = padAddress("0x1234");
    expect(padded.length).toBe(64);
    expect(padded.endsWith("1234")).toBe(true);

    const paddedNum = padUint256(100n);
    expect(paddedNum.length).toBe(64);
    expect(decodeUint256(paddedNum)).toBe(100n);
  });

  it("decodes address correctly", () => {
    const padded = padAddress(sampleUser);
    expect(decodeAddress(padded).toLowerCase()).toBe(sampleUser.toLowerCase());
  });

  it("encodes and decodes getUserAccountData", () => {
    const callData = encodeGetUserAccountData(sampleUser);
    expect(callData.startsWith(SELECTORS.getUserAccountData)).toBe(true);
    expect(callData.length).toBe(10 + 64); // 0x + 8 chars selector + 64 chars address

    // Construct synthetic return: 6 uint256 words
    // totalCollateral = 100000000 (1 USD @ 8 dec)
    // totalDebt = 50000000 (0.5 USD @ 8 dec)
    // availableBorrows = 30000000
    // currentLiquidationThreshold = 8000 (80%)
    // ltv = 7500 (75%)
    // healthFactor = 1600000000000000000 (1.6 * 1e18)
    const returnHex = "0x" +
      padUint256(100000000n) +
      padUint256(50000000n) +
      padUint256(30000000n) +
      padUint256(8000n) +
      padUint256(7500n) +
      padUint256(1600000000000000000n);

    const decoded = decodeGetUserAccountData(returnHex);
    expect(decoded.totalCollateralBase).toBe(100000000n);
    expect(decoded.totalDebtBase).toBe(50000000n);
    expect(decoded.availableBorrowsBase).toBe(30000000n);
    expect(decoded.currentLiquidationThreshold).toBe(8000n);
    expect(decoded.ltv).toBe(7500n);
    expect(decoded.healthFactor).toBe(1600000000000000000n);
  });

  it("throws on truncated getUserAccountData response", () => {
    expect(() => decodeGetUserAccountData("0x1234")).toThrow(/Invalid return data length/);
  });

  it("encodes and decodes getReserveTokensAddresses", () => {
    const callData = encodeGetReserveTokensAddresses(sampleAsset);
    expect(callData.startsWith(SELECTORS.getReserveTokensAddresses)).toBe(true);

    const aToken = "0x1111111111111111111111111111111111111111";
    const sToken = "0x2222222222222222222222222222222222222222";
    const vToken = "0x3333333333333333333333333333333333333333";
    const hex = "0x" + padAddress(aToken) + padAddress(sToken) + padAddress(vToken);

    const decoded = decodeGetReserveTokensAddresses(hex);
    expect(decoded.aTokenAddress).toBe(aToken);
    expect(decoded.stableDebtTokenAddress).toBe(sToken);
    expect(decoded.variableDebtTokenAddress).toBe(vToken);
  });

  it("encodes and decodes balanceOf and decimals", () => {
    const balData = encodeBalanceOf(sampleUser);
    expect(balData.startsWith(SELECTORS.balanceOf)).toBe(true);
    expect(decodeBalanceOf("0x" + padUint256(5000000n))).toBe(5000000n);

    const decData = encodeDecimals();
    expect(decData).toBe(SELECTORS.decimals);
    expect(decodeDecimals("0x" + padUint256(6n))).toBe(6);
  });

  it("encodes and decodes price oracle functions", () => {
    const oracleData = encodeGetPriceOracle();
    expect(oracleData).toBe(SELECTORS.getPriceOracle);
    expect(decodeGetPriceOracle("0x" + padAddress(sampleUser))).toBe(sampleUser.toLowerCase());

    const priceData = encodeGetAssetPrice(sampleAsset);
    expect(priceData.startsWith(SELECTORS.getAssetPrice)).toBe(true);
    expect(decodeGetAssetPrice("0x" + padUint256(100000000n))).toBe(100000000n);
  });

  it("exports valid ABI JSON fragments", () => {
    expect(AAVE_V3_REPAY_ABI[0]?.name).toBe("repay");
    expect(AAVE_V3_WITHDRAW_ABI[0]?.name).toBe("withdraw");
    expect(AAVE_V3_SUPPLY_ABI[0]?.name).toBe("supply");
    expect(ERC20_APPROVE_ABI[0]?.name).toBe("approve");
  });
});
