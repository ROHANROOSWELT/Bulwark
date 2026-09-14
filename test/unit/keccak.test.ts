import { describe, it, expect } from "vitest";
import { keccak256, functionSelector } from "../../packages/core/src/keccak.js";

describe("keccak256", () => {
  it("matches known empty string vector", () => {
    expect(keccak256("")).toBe("c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  });

  it("matches known 'abc' vector", () => {
    expect(keccak256("abc")).toBe("4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  });

  it("calculates standard EVM function selectors", () => {
    expect(functionSelector("balanceOf(address)")).toBe("0x70a08231");
    expect(functionSelector("transfer(address,uint256)")).toBe("0xa9059cbb");
    expect(functionSelector("approve(address,uint256)")).toBe("0x095ea7b3");
    expect(functionSelector("getUserAccountData(address)")).toBe("0xbf92857c");
  });
});
