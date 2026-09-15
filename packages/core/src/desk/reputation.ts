/**
 * Desk Execution Reputation.
 * Derived STRICTLY and ONLY from verified execution records and audit logs.
 * No tokens, no points, no arbitrary gamification.
 * Source of truth: docs/ORIGINALITY_UPGRADE.md §12 and docs/BUILD.md §4 P8.
 */

import { ExecutionRecord, AuditRecord } from "../grants/store.js";
import { RescueGrantV2 } from "../grants/grant.js";

export interface ExecutionReputation {
  totalGrantsProposed: number;
  totalGrantsApproved: number;
  totalGrantsArmed: number;
  totalExecutionsAttempted: number;
  totalExecutionsVerified: number;
  totalSimulationFailures: number;
  totalPolicyViolations: number;
  totalCapitalDeployedUsd: number;
  averageLatencyMs: number; // propose -> verified
  hfImprovements: {
    min: number;
    max: number;
    average: number;
  };
  provenance: "BOOKKEEPING";
}

export function computeDeskReputation(
  grants: RescueGrantV2[],
  executions: ExecutionRecord[],
  auditLogs: AuditRecord[]
): ExecutionReputation {
  const ARMED_LIFECYCLE_STATUSES = new Set([
    "armed",
    "dry_run",
    "submitted",
    "mined",
    "verified",
    "settled",
  ]);

  let totalGrantsProposed = 0;
  let totalGrantsApproved = 0;
  let totalGrantsArmed = 0;

  for (const g of grants) {
    totalGrantsProposed++;
    if (g.state.status === "approved") {
      totalGrantsApproved++;
    } else if (ARMED_LIFECYCLE_STATUSES.has(g.state.status)) {
      totalGrantsApproved++;
      totalGrantsArmed++;
    }
  }

  let totalExecutionsVerified = 0;
  let totalCapitalDeployedUsd = 0;
  const latencies: number[] = [];
  const improvements: number[] = [];

  for (const exec of executions) {
    if (exec.status === "verified" && exec.receiptVerified) {
      totalExecutionsVerified++;
      totalCapitalDeployedUsd += exec.amountUsd;

      if (exec.postHealthFactor !== undefined && exec.postHealthFactor > exec.preHealthFactor) {
        improvements.push(exec.postHealthFactor - exec.preHealthFactor);
      }

      if (exec.submittedAt && exec.verifiedAt) {
        const diff = Date.parse(exec.verifiedAt) - Date.parse(exec.submittedAt);
        if (diff > 0) latencies.push(diff);
      }
    }
  }

  let totalSimulationFailures = 0;
  let totalPolicyViolations = 0;

  for (const log of auditLogs) {
    if (log.type === "SIMULATION" && log.details["wouldRevert"] === true) {
      totalSimulationFailures++;
    }
    if (log.type === "POLICY_REJECTED") {
      totalPolicyViolations++;
    }
  }

  const avgLatency =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  const minImp = improvements.length > 0 ? Math.min(...improvements) : 0;
  const maxImp = improvements.length > 0 ? Math.max(...improvements) : 0;
  const avgImp =
    improvements.length > 0 ? improvements.reduce((a, b) => a + b, 0) / improvements.length : 0;

  return {
    totalGrantsProposed,
    totalGrantsApproved,
    totalGrantsArmed,
    totalExecutionsAttempted: executions.length,
    totalExecutionsVerified,
    totalSimulationFailures,
    totalPolicyViolations,
    totalCapitalDeployedUsd: Math.round(totalCapitalDeployedUsd * 100) / 100,
    averageLatencyMs: Math.round(avgLatency),
    hfImprovements: {
      min: Math.round(minImp * 1000) / 1000,
      max: Math.round(maxImp * 1000) / 1000,
      average: Math.round(avgImp * 1000) / 1000,
    },
    provenance: "BOOKKEEPING",
  };
}
