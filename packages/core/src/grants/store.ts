/**
 * Bulwark Atomic Store & Desk Capacity Ledger.
 * Files stored in BULWARK_STORE_DIR:
 * - grants.json (atomic tmp+rename)
 * - executions.json (atomic tmp+rename)
 * - capacity.json (ledger: reserved vs available backed by real on-chain balance)
 * - audit.jsonl (append-only audit trail)
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { RescueGrantV2 } from "./grant.js";

export interface ExecutionRecord {
  executionId: string;
  grantId: string;
  authorityHash: string;
  action: string;
  amountUsd: number;
  amountWei: string;
  status: "simulated" | "submitted" | "mined" | "verified" | "failed";
  simulatedAt?: string;
  submittedAt?: string;
  minedAt?: string;
  verifiedAt?: string;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  preHealthFactor: number;
  postHealthFactor?: number;
  receiptVerified?: boolean;
  independentReceiptVerified?: boolean;
}

export interface CapacityLedger {
  deskWalletAddress: string;
  deskBalanceUsd: number; // Read on-chain (NEVER invented)
  reservedUsd: number;
  availableUsd: number; // deskBalanceUsd - reservedUsd
  reservations: Record<string, number>; // grantId -> amountUsd
  lastUpdated: string;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  type: "GRANT_PROPOSED" | "GRANT_APPROVED" | "GRANT_ARMED" | "SIMULATION" | "EXECUTION_SUBMITTED" | "EXECUTION_VERIFIED" | "GRANT_INVALIDATED" | "POLICY_REJECTED" | "CAPACITY_RESERVED" | "CAPACITY_RELEASED";
  grantId?: string;
  executionId?: string;
  details: Record<string, unknown>;
  provenance: "CHAIN FACT" | "KEEPERHUB FACT" | "APPLICATION STATE" | "AGENT OUTPUT" | "BOOKKEEPING";
}

export class BulwarkStore {
  public readonly baseDir: string;
  private isInitialized = false;

  constructor(baseDir = ".bulwark") {
    this.baseDir = baseDir;
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    await fs.mkdir(this.baseDir, { recursive: true });

    // Ensure default files exist if not present
    const grantsPath = join(this.baseDir, "grants.json");
    try {
      await fs.access(grantsPath);
    } catch {
      await this.atomicWrite(grantsPath, JSON.stringify([], null, 2));
    }

    const execsPath = join(this.baseDir, "executions.json");
    try {
      await fs.access(execsPath);
    } catch {
      await this.atomicWrite(execsPath, JSON.stringify([], null, 2));
    }

    const capPath = join(this.baseDir, "capacity.json");
    try {
      await fs.access(capPath);
    } catch {
      const defaultCap: CapacityLedger = {
        deskWalletAddress: "0x0000000000000000000000000000000000000000",
        deskBalanceUsd: 0,
        reservedUsd: 0,
        availableUsd: 0,
        reservations: {},
        lastUpdated: new Date().toISOString(),
      };
      await this.atomicWrite(capPath, JSON.stringify(defaultCap, null, 2));
    }

    const auditPath = join(this.baseDir, "audit.jsonl");
    try {
      await fs.access(auditPath);
    } catch {
      await fs.writeFile(auditPath, "", "utf8");
    }

    this.isInitialized = true;
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmpPath, content, "utf8");
    await fs.rename(tmpPath, filePath);
  }

  // ── Grants CRUD ──────────────────────────────────────────────────────────

  public async getGrants(): Promise<RescueGrantV2[]> {
    await this.init();
    const data = await fs.readFile(join(this.baseDir, "grants.json"), "utf8");
    return JSON.parse(data) as RescueGrantV2[];
  }

  public async getGrant(id: string): Promise<RescueGrantV2 | undefined> {
    const grants = await this.getGrants();
    return grants.find((g) => g.grantId === id);
  }

  public async saveGrant(grant: RescueGrantV2): Promise<void> {
    await this.init();
    const grants = await this.getGrants();
    const idx = grants.findIndex((g) => g.grantId === grant.grantId);
    if (idx >= 0) {
      grants[idx] = grant;
    } else {
      grants.push(grant);
    }
    await this.atomicWrite(join(this.baseDir, "grants.json"), JSON.stringify(grants, null, 2));
  }

  // ── Executions ───────────────────────────────────────────────────────────

  public async getExecutions(): Promise<ExecutionRecord[]> {
    await this.init();
    const data = await fs.readFile(join(this.baseDir, "executions.json"), "utf8");
    return JSON.parse(data) as ExecutionRecord[];
  }

  public async getExecution(executionId: string): Promise<ExecutionRecord | undefined> {
    const execs = await this.getExecutions();
    return execs.find((e) => e.executionId === executionId);
  }

  public async saveExecution(record: ExecutionRecord): Promise<void> {
    await this.init();
    const execs = await this.getExecutions();
    const idx = execs.findIndex((e) => e.executionId === record.executionId);
    if (idx >= 0) {
      execs[idx] = record;
    } else {
      execs.push(record);
    }
    await this.atomicWrite(join(this.baseDir, "executions.json"), JSON.stringify(execs, null, 2));
  }

  // ── Capacity Ledger ──────────────────────────────────────────────────────

  public async getCapacity(): Promise<CapacityLedger> {
    await this.init();
    const data = await fs.readFile(join(this.baseDir, "capacity.json"), "utf8");
    return JSON.parse(data) as CapacityLedger;
  }

  /**
   * Updates the on-chain verified desk wallet balance.
   * Note: Available capacity cannot exceed this real balance minus existing reservations.
   */
  public async syncDeskBalance(deskWalletAddress: string, realBalanceUsd: number): Promise<CapacityLedger> {
    await this.init();
    const ledger = await this.getCapacity();
    ledger.deskWalletAddress = deskWalletAddress;
    ledger.deskBalanceUsd = realBalanceUsd;
    ledger.reservedUsd = Object.values(ledger.reservations).reduce((a, b) => a + b, 0);
    ledger.availableUsd = Math.max(0, ledger.deskBalanceUsd - ledger.reservedUsd);
    ledger.lastUpdated = new Date().toISOString();
    await this.atomicWrite(join(this.baseDir, "capacity.json"), JSON.stringify(ledger, null, 2));
    return ledger;
  }

  public async reserveCapacity(
    grantId: string,
    amountUsd: number
  ): Promise<{ ok: boolean; reason?: string; ledger: CapacityLedger }> {
    await this.init();
    const ledger = await this.getCapacity();

    if (ledger.reservations[grantId]) {
      return { ok: false, reason: `Capacity already reserved for grant ${grantId}`, ledger };
    }

    const newReserved = ledger.reservedUsd + amountUsd;
    if (newReserved > ledger.deskBalanceUsd) {
      return {
        ok: false,
        reason: `Insufficient desk capacity: requested $${amountUsd.toFixed(2)}, total reserved would be $${newReserved.toFixed(2)} exceeding on-chain balance $${ledger.deskBalanceUsd.toFixed(2)}`,
        ledger,
      };
    }

    ledger.reservations[grantId] = amountUsd;
    ledger.reservedUsd = newReserved;
    ledger.availableUsd = Math.max(0, ledger.deskBalanceUsd - ledger.reservedUsd);
    ledger.lastUpdated = new Date().toISOString();
    await this.atomicWrite(join(this.baseDir, "capacity.json"), JSON.stringify(ledger, null, 2));

    await this.appendAudit({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      type: "CAPACITY_RESERVED",
      grantId,
      details: { amountUsd, reservedUsd: ledger.reservedUsd, availableUsd: ledger.availableUsd },
      provenance: "BOOKKEEPING",
    });

    return { ok: true, ledger };
  }

  public async releaseCapacity(grantId: string): Promise<CapacityLedger> {
    await this.init();
    const ledger = await this.getCapacity();
    const amount = ledger.reservations[grantId];
    if (amount) {
      delete ledger.reservations[grantId];
      ledger.reservedUsd = Object.values(ledger.reservations).reduce((a, b) => a + b, 0);
      ledger.availableUsd = Math.max(0, ledger.deskBalanceUsd - ledger.reservedUsd);
      ledger.lastUpdated = new Date().toISOString();
      await this.atomicWrite(join(this.baseDir, "capacity.json"), JSON.stringify(ledger, null, 2));

      await this.appendAudit({
        id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        type: "CAPACITY_RELEASED",
        grantId,
        details: { amountReleased: amount, reservedUsd: ledger.reservedUsd, availableUsd: ledger.availableUsd },
        provenance: "BOOKKEEPING",
      });
    }
    return ledger;
  }

  // ── Append-Only Audit Trail ──────────────────────────────────────────────

  public async appendAudit(record: AuditRecord): Promise<void> {
    await this.init();
    const line = JSON.stringify(record) + "\n";
    await fs.appendFile(join(this.baseDir, "audit.jsonl"), line, "utf8");
  }

  public async getAuditLogs(limit = 100): Promise<AuditRecord[]> {
    await this.init();
    const content = await fs.readFile(join(this.baseDir, "audit.jsonl"), "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const records = lines.map((l) => JSON.parse(l) as AuditRecord);
    return records.slice(-limit);
  }
}
