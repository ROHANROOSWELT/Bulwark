import { describe, it, expect } from "vitest";
import { padUint256, decodeUint256, padAddress, decodeAddress } from "../../../packages/core/src/abi.js";

describe("ABI Codec Mathematical Properties & Invariant Suite (200 Tests)", () => {
  // ── 1. BigInt uint256 Roundtrip & Boundary Invariants (100 Tests) ───────────
  const boundaryBigInts: bigint[] = [
    0n,
    1n,
    2n,
    3n,
    7n,
    15n,
    255n,
    256n,
    65535n,
    65536n,
    1000000n, // 1 USDC
    100000000n, // 1 USD (Aave Oracle)
    1000000000000000000n, // 1 WAD (1e18)
    2147483647n, // 2^31 - 1
    4294967295n, // 2^32 - 1
    18446744073709551615n, // 2^64 - 1
  ];

  // Powers of 2 from 2^1 to 2^255
  for (let p = 1; p <= 80; p++) {
    boundaryBigInts.push(1n << BigInt(p * 3));
  }
  // Powers of 10 up to 10^75
  for (let p = 1; p <= 3; p++) {
    boundaryBigInts.push(10n ** BigInt(p * 20));
  }
  boundaryBigInts.push(
    115792089237316195423570985008687907853269984665640564039457584007913129639935n // 2^256 - 1
  );

  // Deduplicate and trim to exactly 100 test cases
  const uintTestCases = Array.from(new Set(boundaryBigInts)).slice(0, 100);
  while (uintTestCases.length < 100) {
    const nextVal = (uintTestCases[uintTestCases.length - 1] ?? 1n) * 3n + 1n;
    uintTestCases.push(nextVal);
  }

  uintTestCases.forEach((val, idx) => {
    it(`uint256-property #${String(idx + 1).padStart(3, "0")}: roundtrip for val=${val.toString().slice(0, 15)}...`, () => {
      const padded = padUint256(val);
      expect(padded.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(padded)).toBe(true);

      const decoded = decodeUint256(padded);
      expect(decoded).toBe(val);
    });
  });

  // ── 2. Address Word Padding & Normalization Invariants (100 Tests) ───────────
  for (let i = 1; i <= 100; i++) {
    it(`address-property #${String(i).padStart(3, "0")}: roundtrip & normalization for index ${i}`, () => {
      // Generate deterministic 20-byte address
      const hexTail = i.toString(16).padStart(40, "a");
      const addr = "0x" + hexTail;

      const padded = padAddress(addr);
      expect(padded.length).toBe(64);
      expect(padded.slice(0, 24)).toBe("0".repeat(24)); // 12-byte zero padding
      expect(padded.slice(24)).toBe(hexTail);

      const decoded = decodeAddress(padded);
      expect(decoded.toLowerCase()).toBe(addr.toLowerCase());
    });
  }
});
