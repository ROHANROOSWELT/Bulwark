import { describe, it, expect, beforeEach } from "vitest";
import { BulwarkStore } from "../../packages/core/src/grants/store.js";
import { promises as fs } from "node:fs";
import { join } from "node:path";

describe("Capacity Ledger & Store Atomicity", () => {
  const testDir = ".bulwark_test_capacity";
  let store: BulwarkStore;

  beforeEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
    store = new BulwarkStore(testDir);
    await store.init();
  });

  it("syncs desk wallet balance from on-chain truth", async () => {
    const ledger = await store.syncDeskBalance("0xdesk123", 100.0);
    expect(ledger.deskWalletAddress).toBe("0xdesk123");
    expect(ledger.deskBalanceUsd).toBe(100.0);
    expect(ledger.availableUsd).toBe(100.0);
    expect(ledger.reservedUsd).toBe(0);
  });

  it("reserves capacity backed by real on-chain balance", async () => {
    await store.syncDeskBalance("0xdesk123", 50.0);

    // Reserve 20
    const res1 = await store.reserveCapacity("bg_grant_1", 20.0);
    expect(res1.ok).toBe(true);
    expect(res1.ledger.reservedUsd).toBe(20.0);
    expect(res1.ledger.availableUsd).toBe(30.0);

    // Try to reserve 40 (would total 60 > 50 balance) -> REFUSED
    const res2 = await store.reserveCapacity("bg_grant_2", 40.0);
    expect(res2.ok).toBe(false);
    expect(res2.reason).toContain("Insufficient desk capacity");
    expect(res2.ledger.availableUsd).toBe(30.0); // unchanged
  });

  it("refuses duplicate reservation on same grant", async () => {
    await store.syncDeskBalance("0xdesk123", 50.0);
    await store.reserveCapacity("bg_grant_1", 10.0);

    const dup = await store.reserveCapacity("bg_grant_1", 10.0);
    expect(dup.ok).toBe(false);
    expect(dup.reason).toContain("already reserved");
  });

  it("releases capacity when grant invalidates or finishes", async () => {
    await store.syncDeskBalance("0xdesk123", 50.0);
    await store.reserveCapacity("bg_grant_1", 15.0);
    await store.reserveCapacity("bg_grant_2", 10.0);

    const released = await store.releaseCapacity("bg_grant_1");
    expect(released.reservedUsd).toBe(10.0);
    expect(released.availableUsd).toBe(40.0);
    expect(released.reservations["bg_grant_1"]).toBeUndefined();
    expect(released.reservations["bg_grant_2"]).toBe(10.0);
  });
});
