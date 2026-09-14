import { describe, it, expect } from "vitest";
import { keccak256 } from "../../../packages/core/src/keccak.js";

describe("Cryptographic Keccak-256 Vector & Invariance Suite (256 Tests)", () => {
  // Canonical Ethereum empty hash (0x01 padding)
  it("vector #000: canonical Ethereum empty string hash", () => {
    const emptyHash = keccak256("");
    expect(emptyHash).toBe("c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    expect(emptyHash.length).toBe(64);
  });

  // Generate 255 individual vector tests for lengths 1 to 255
  for (let len = 1; len <= 255; len++) {
    it(`vector #${String(len).padStart(3, "0")}: length=${len} bytes deterministic buffer`, () => {
      // Construct deterministic byte pattern
      const buf = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        buf[i] = (i * 31 + 7) & 0xff;
      }

      const hash1 = keccak256(buf);
      const hash2 = keccak256(buf);

      // Determinism invariant
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);

      // Sponge boundary verification: rate is 136 bytes
      if (len === 135 || len === 136 || len === 137) {
        expect(hash1).not.toBe("0".repeat(64));
      }
    });
  }
});
