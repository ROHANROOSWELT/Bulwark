/**
 * Pure TypeScript implementation of Keccak-256 (Ethereum variant with 0x01 padding).
 * Zero external dependencies.
 */

const SHA3_PI: number[] = [];
const SHA3_ROTL: number[] = [];
const _0n = 0n;
const _1n = 1n;
const _2n = 2n;
const _7n = 7n;
const _256n = 256n;
const _0x71n = 0x71n;
const IOTA: bigint[] = [];

// Precompute round constants and permutation tables
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
  [x, y] = [y, (2 * x + 3 * y) % 5];
  SHA3_PI.push(5 * y + x);
  SHA3_ROTL.push((((round + 1) * (round + 2)) / 2) % 64);
  let t = _0n;
  for (let j = 0; j < 7; j++) {
    R = ((R << _1n) ^ ((R >> _7n) * _0x71n)) % _256n;
    if (R & _2n) t ^= _1n << ((_1n << BigInt(j)) - _1n);
  }
  IOTA.push(t);
}

const MASK_64 = 0xffffffffffffffffn;

function rotl(x: bigint, n: number): bigint {
  const s = BigInt(n % 64);
  if (s === 0n) return x & MASK_64;
  return ((x << s) | (x >> (64n - s))) & MASK_64;
}

function keccakF(s: bigint[]): void {
  const B = new Array<bigint>(5).fill(0n);
  for (let round = 0; round < 24; round++) {
    // Theta
    for (let x = 0; x < 5; x++) {
      B[x] = s[x]! ^ s[x + 5]! ^ s[x + 10]! ^ s[x + 15]! ^ s[x + 20]!;
    }
    for (let x = 0; x < 5; x++) {
      const d = B[(x + 4) % 5]! ^ rotl(B[(x + 1) % 5]!, 1);
      for (let y = 0; y < 25; y += 5) {
        s[x + y] = s[x + y]! ^ d;
      }
    }

    // Rho and Pi
    let cur = s[1]!;
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t]!;
      const Th = rotl(cur, shift);
      const pi = SHA3_PI[t]!;
      cur = s[pi]!;
      s[pi] = Th;
    }

    // Chi
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) B[x] = s[y + x]!;
      for (let x = 0; x < 5; x++) {
        s[y + x] = B[x]! ^ ((~B[(x + 1) % 5]! & MASK_64) & B[(x + 2) % 5]!);
      }
    }

    // Iota
    s[0] = s[0]! ^ IOTA[round]!;
  }
}

/**
 * Computes Keccak-256 hash (hex string without 0x prefix).
 */
export function keccak256(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const blockLen = 136; // 1088 bits rate
  const state = new Uint8Array(200);

  let pos = 0;
  for (let i = 0; i < bytes.length; i++) {
    state[pos] = state[pos]! ^ bytes[i]!;
    pos++;
    if (pos === blockLen) {
      const s = new Array<bigint>(25);
      for (let j = 0; j < 25; j++) {
        let w = 0n;
        for (let b = 0; b < 8; b++) {
          w |= BigInt(state[j * 8 + b]!) << BigInt(b * 8);
        }
        s[j] = w;
      }
      keccakF(s);
      for (let j = 0; j < 25; j++) {
        for (let b = 0; b < 8; b++) {
          state[j * 8 + b] = Number((s[j]! >> BigInt(b * 8)) & 0xffn);
        }
      }
      pos = 0;
    }
  }

  // Ethereum Keccak-256 padding: 0x01 ... 0x80
  state[pos] = state[pos]! ^ 0x01;
  state[blockLen - 1] = state[blockLen - 1]! ^ 0x80;

  const s = new Array<bigint>(25);
  for (let j = 0; j < 25; j++) {
    let w = 0n;
    for (let b = 0; b < 8; b++) {
      w |= BigInt(state[j * 8 + b]!) << BigInt(b * 8);
    }
    s[j] = w;
  }
  keccakF(s);
  for (let j = 0; j < 25; j++) {
    for (let b = 0; b < 8; b++) {
      state[j * 8 + b] = Number((s[j]! >> BigInt(b * 8)) & 0xffn);
    }
  }

  return Array.from(state.subarray(0, 32))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Computes 4-byte EVM function selector as '0x...'
 */
export function functionSelector(signature: string): string {
  return "0x" + keccak256(signature).slice(0, 8);
}
