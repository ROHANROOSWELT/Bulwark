import { describe, it, expect, beforeEach } from "vitest";
import { BulwarkStore, verifyAuditChain } from "../../packages/core/src/grants/store.js";
import { RescueGrantV2, computeGrantHash } from "../../packages/core/src/grants/grant.js";
import { promises as fs } from "node:fs";

describe("BulwarkStore (Persistence & Audit Trail)", () => {
  const testDir = ".bulwark_test_store";
  let store: BulwarkStore;

  beforeEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
    BulwarkStore.resetMemoryCache(testDir);
    store = new BulwarkStore(testDir);
    await store.init();
  });

  it("persists and retrieves grants atomically", async () => {
    const rawGrant = {
      version: 2 as const,
      policyId: "pol_1",
      policyHash: "0xabc",
      createdAt: "2026-09-14T00:00:00Z",
      createdBy: "agent",
      parties: { owner: "0x1", rescuer: "desk", executor: "0x2" },
      position: { chainId: 11155111, positionOwner: "0x1", debtAsset: "0xusdc" },
      authority: {
        allowedActions: ["repay" as const],
        capitalCapUsd: 25,
        perActionCapUsd: 15,
        dailyCapUsd: 25,
        adaptiveBands: [],
        hfFloor: 1.05,
      },
      conditions: {
        hfTriggerBelow: 1.2,
        recoveryHf: 1.5,
        maxDebtChangePct: 0.2,
        priceBandPct: 0.1,
        expiresAt: "2026-09-18T15:30:00Z",
      },
      premium: { curveId: "bulwark-curve-v1" as const, baseUsd: 0.5, rateBps: 200, settlement: "BOOKKEEPING" as const },
      state: {
        status: "proposed" as const,
        creationSnapshot: { hf: 1.18, debtUsd: 500, priceUsd: 1, debtTokenBalance: "500000000", timestamp: "2026-09-14T00:00:00Z" },
        capacityReservedUsd: 0,
        dailySpentUsd: 0,
        totalSpentUsd: 0,
        executionCount: 0,
      },
    };

    const { grantHash, grantId } = computeGrantHash(rawGrant);
    const grant: RescueGrantV2 = { ...rawGrant, grantHash, grantId };

    await store.saveGrant(grant);

    const loaded = await store.getGrant(grantId);
    expect(loaded?.grantId).toBe(grantId);
    expect(loaded?.state.status).toBe("proposed");
  });

  it("appends and queries audit trail records", async () => {
    await store.appendAudit({
      id: "aud_01",
      timestamp: "2026-09-14T10:00:00Z",
      type: "GRANT_PROPOSED",
      grantId: "bg_123",
      details: { owner: "0x1" },
      provenance: "AGENT OUTPUT",
    });

    await store.appendAudit({
      id: "aud_02",
      timestamp: "2026-09-14T10:01:00Z",
      type: "GRANT_APPROVED",
      grantId: "bg_123",
      details: { approver: "owner" },
      provenance: "APPLICATION STATE",
    });

    const logs = await store.getAuditLogs(10);
    expect(logs).toHaveLength(2);
    expect(logs[0]?.id).toBe("aud_01");
    expect(logs[1]?.type).toBe("GRANT_APPROVED");
  });

  it("chains audit records with SHA-256 hashes and detects tampering", async () => {
    const r1 = await store.appendAudit({
      id: "aud_01",
      timestamp: "2026-09-14T10:00:00Z",
      type: "GRANT_PROPOSED",
      grantId: "bg_123",
      details: { owner: "0x1" },
      provenance: "AGENT OUTPUT",
    });

    const r2 = await store.appendAudit({
      id: "aud_02",
      timestamp: "2026-09-14T10:01:00Z",
      type: "GRANT_APPROVED",
      grantId: "bg_123",
      details: { approver: "owner" },
      provenance: "APPLICATION STATE",
    });

    expect(r1.recordHash).toBeDefined();
    expect(r2.prevHash).toBe(r1.recordHash);

    const logs = await store.getAuditLogs(10);
    const validCheck = verifyAuditChain(logs);
    expect(validCheck.isValid).toBe(true);

    // Tamper with record
    const tampered = JSON.parse(JSON.stringify(logs)) as typeof logs;
    tampered[0]!.details = { owner: "0xattacker" };
    const tamperedCheck = verifyAuditChain(tampered);
    expect(tamperedCheck.isValid).toBe(false);
  });
});
