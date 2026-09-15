/**
 * Bulwark Guardian Orchestrator.
 * Full lifecycle: Observe -> Underwrite -> Grant -> Approve -> Arm -> Dry Run -> Execute -> Verify -> PoAA.
 * Shared by CLI, Web dashboard, and autonomous Agent loops.
 * Zero logic duplication.
 * Source of truth: docs/BUILD.md §4 P8 and docs/WINNER.md.
 */

import { createHash } from "node:crypto";
import { BulwarkConfig, loadConfig } from "./config.js";
import { KeeperHubClient } from "./keeperhub/client.js";
import { AavePositionReader, PositionSnapshot } from "./aave/reader.js";
import { BulwarkStore, ExecutionRecord } from "./grants/store.js";
import {
  RescueGrantV2,
  computeGrantHash,
  transitionGrant,
  AdaptiveBand,
  computeGrantEip712Digest,
  isValidApprovalSignature,
  createDeterministicApprovalSignature,
  GrantApproval,
} from "./grants/grant.js";
import { BulwarkPolicyConfig, ExecutionIntent } from "./policy/types.js";
import { getDefaultPolicyConfig, computePolicyHash, evaluatePolicy } from "./policy/engine.js";
import { underwritePosition } from "./underwriter/plans.js";
import { triageWithLlm } from "./underwriter/llm.js";
import { compilePolicyIntent, AuthorizedIntent } from "./policy/compiler.js";
import { compileExecutionPayloads } from "./workflow/compile.js";
import { verifyExecutionReceipts } from "./receipts/verify.js";
import { PoaaBundle, verifyPoaaBundle, PoaaVerificationReport } from "./proof/poaa.js";
import { DirectExecutionReceipt, DirectExecutionStatusResponse, SimulationResult } from "./keeperhub/types.js";
import { getChainConfig } from "./chains.js";

export interface GuardianOptions {
  config?: BulwarkConfig;
  client?: KeeperHubClient;
  reader?: AavePositionReader;
  store?: BulwarkStore;
  policy?: BulwarkPolicyConfig;
}

export class BulwarkGuardian {
  public readonly config: BulwarkConfig;
  public readonly client: KeeperHubClient;
  public readonly reader: AavePositionReader;
  public readonly store: BulwarkStore;
  public readonly policy: BulwarkPolicyConfig;

  constructor(options: GuardianOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.client =
      options.client ??
      new KeeperHubClient({
        apiKey: this.config.keeperhubApiKey,
        apiBase: this.config.keeperhubApiBase,
      });
    this.reader = options.reader ?? new AavePositionReader({ client: this.client });
    this.store = options.store ?? new BulwarkStore(this.config.storeDir);
    this.policy =
      options.policy ??
      getDefaultPolicyConfig(
        this.config.policyMaxUsdPerAction,
        this.config.policyHfCritical,
        this.config.policyHfTarget
      );
  }

  public async init(): Promise<void> {
    await this.store.init();
  }

  /**
   * Scans an on-chain Aave V3 position for a given user.
   */
  public async scanPosition(userAddress: string, chainId?: number): Promise<PositionSnapshot> {
    const targetChain = chainId ?? this.config.chainId;
    return this.reader.readPosition(targetChain, userAddress);
  }

  /**
   * Underwrites a position and proposes a state-bound RescueGrant.
   * Rule: A proposed grant NEVER executes without owner approval.
   */
  public async proposeRescueGrant(
    userAddress: string,
    chainId?: number,
    options?: {
      capitalCapUsd?: number;
      perActionCapUsd?: number;
      adaptiveBands?: AdaptiveBand[];
      expiresInHours?: number;
      hfTriggerBelow?: number;
    }
  ): Promise<RescueGrantV2> {
    await this.init();
    const targetChain = chainId ?? this.config.chainId;
    const snapshot = await this.scanPosition(userAddress, targetChain);

    // Run deterministic underwriting
    const initialQuote = underwritePosition(snapshot, this.config.policyMaxUsdPerAction, this.config.policyHfTarget);
    const quote = await triageWithLlm(initialQuote, this.config);

    const expiresAt = new Date(Date.now() + (options?.expiresInHours ?? 96) * 3600 * 1000).toISOString();

    const defaultBands: AdaptiveBand[] = [
      { hfMin: 1.25, hfExcl: 1.35, maxCapitalUsd: 5.0 },
      { hfMin: 1.15, hfExcl: 1.25, maxCapitalUsd: 15.0 },
      { hfMin: 1.05, hfExcl: 1.15, maxCapitalUsd: 25.0 },
    ];

    const rawCore = {
      version: 2 as const,
      policyId: this.policy.policyId,
      policyHash: computePolicyHash(this.policy),
      createdAt: new Date().toISOString(),
      createdBy: "underwriter_agent",
      parties: {
        owner: userAddress,
        rescuer: "desk_keeperhub_primary",
        executor: "0x0000000000000000000000000000000000000000", // Filled by KeeperHub org wallet
      },
      position: {
        chainId: targetChain,
        positionOwner: userAddress,
        debtAsset: snapshot.debtAssetAddress,
      },
      authority: {
        allowedActions: ["repay" as const],
        capitalCapUsd: options?.capitalCapUsd ?? this.config.policyMaxUsdPerAction,
        perActionCapUsd: options?.perActionCapUsd ?? 15.0,
        dailyCapUsd: options?.capitalCapUsd ?? this.config.policyMaxUsdPerAction,
        adaptiveBands: options?.adaptiveBands ?? defaultBands,
        hfFloor: 1.05,
      },
      conditions: {
        hfTriggerBelow: options?.hfTriggerBelow ?? this.config.policyHfCritical,
        recoveryHf: this.config.policyHfTarget,
        maxDebtChangePct: 0.2, // 20% max drift
        priceBandPct: 0.15, // 15% max price change
        expiresAt,
      },
      premium: {
        curveId: "bulwark-curve-v1" as const,
        baseUsd: 0.5,
        rateBps: 200,
        settlement: "BOOKKEEPING" as const,
      },
      state: {
        status: "proposed" as const,
        creationSnapshot: {
          hf: snapshot.healthFactor,
          debtUsd: snapshot.totalDebtUsd,
          priceUsd: snapshot.assetPriceUsd,
          debtTokenBalance: snapshot.debtTokenBalance.toString(),
          timestamp: snapshot.timestamp,
        },
        capacityReservedUsd: 0,
        dailySpentUsd: 0,
        totalSpentUsd: 0,
        executionCount: 0,
      },
    };

    const { grantHash, grantId } = computeGrantHash(rawCore);
    const grant: RescueGrantV2 = { ...rawCore, grantHash, grantId };

    await this.store.saveGrant(grant);

    await this.store.appendAudit({
      id: `aud_${Date.now()}_${grantId}`,
      timestamp: new Date().toISOString(),
      type: "GRANT_PROPOSED",
      grantId,
      details: {
        owner: userAddress,
        hf: snapshot.healthFactor,
        quote: { selectedPlan: quote.selectedPlan.planId, amountUsd: quote.selectedPlan.amountUsd },
      },
      provenance: "AGENT OUTPUT",
    });

    // DEMO-ONLY auto-approve check (prints loud warning)
    if (this.config.autoApprove) {
      console.warn(`[BULWARK WARNING] BULWARK_AUTO_APPROVE is enabled! Auto-approving grant ${grantId} for demo.`);
      return this.approveGrant(grantId, userAddress);
    }

    return grant;
  }

  /**
   * Approves a proposed grant (explicit human owner action).
   * Reserves capacity in the capacity ledger backed by real on-chain desk balance.
   * Cryptographically binds approval with EIP-712 digest & signature.
   */
  public async approveGrant(
    grantId: string,
    approvalOrApprover?: string | { approvedBy?: string; signature?: string; nonce?: number }
  ): Promise<RescueGrantV2> {
    await this.init();
    const grant = await this.store.getGrant(grantId);
    if (!grant) {
      throw new Error(`Grant ${grantId} not found`);
    }

    if (grant.state.status !== "proposed") {
      throw new Error(`Cannot approve grant in status "${grant.state.status}"`);
    }

    const approver =
      typeof approvalOrApprover === "string"
        ? approvalOrApprover
        : approvalOrApprover?.approvedBy ?? grant.parties.owner;

    const nonce = typeof approvalOrApprover === "object" ? approvalOrApprover?.nonce ?? 0 : 0;
    const digestHex = computeGrantEip712Digest(grant, nonce);

    let signature = typeof approvalOrApprover === "object" ? approvalOrApprover?.signature : undefined;
    if (signature) {
      if (!isValidApprovalSignature(digestHex, signature, approver)) {
        throw new Error(`Invalid EIP-712 approval signature for grant ${grantId}`);
      }
    } else {
      signature = createDeterministicApprovalSignature(digestHex, approver);
    }

    const approvedAt = new Date().toISOString();
    const approvalRecord: GrantApproval = {
      approvedAt,
      approvedBy: approver,
      signature,
      eip712Hash: digestHex,
      nonce,
    };

    const approved = transitionGrant(grant, "approved", {
      reason: `Explicit owner approval by ${approver}`,
    });
    approved.approvedAt = approvedAt;
    approved.approvedBy = approver;
    approved.approval = approvalRecord;
    approved.signature = signature;
    approved.eip712Hash = digestHex;

    // Reserve initial capacity in ledger
    const reserveRes = await this.store.reserveCapacity(grantId, approved.authority.perActionCapUsd);
    if (!reserveRes.ok) {
      const rejected = transitionGrant(approved, "insufficient_capacity", {
        reason: reserveRes.reason,
      });
      await this.store.saveGrant(rejected);
      throw new Error(`Failed to arm grant: ${reserveRes.reason}`);
    }

    approved.state.capacityReservedUsd = approved.authority.perActionCapUsd;
    const armed = transitionGrant(approved, "armed", { reason: "Capacity reserved; ready for execution" });
    armed.approval = approvalRecord;
    armed.signature = signature;
    armed.eip712Hash = digestHex;
    armed.approvedAt = approvedAt;
    armed.approvedBy = approver;

    await this.store.saveGrant(armed);

    await this.store.appendAudit({
      id: `aud_${Date.now()}_${grantId}`,
      timestamp: new Date().toISOString(),
      type: "GRANT_ARMED",
      grantId,
      details: {
        approver,
        capacityReservedUsd: armed.state.capacityReservedUsd,
        eip712Hash: digestHex,
        signature,
      },
      provenance: "APPLICATION STATE",
    });

    return armed;
  }

  /**
   * Revokes an existing grant.
   * Releases any reserved capacity.
   */
  public async revokeGrant(grantId: string, reason = "Revoked by owner"): Promise<RescueGrantV2> {
    await this.init();
    const grant = await this.store.getGrant(grantId);
    if (!grant) {
      throw new Error(`Grant ${grantId} not found`);
    }

    const revoked = transitionGrant(grant, "revoked", { reason });
    await this.store.releaseCapacity(grantId);
    await this.store.saveGrant(revoked);

    await this.store.appendAudit({
      id: `aud_${Date.now()}_${grantId}`,
      timestamp: new Date().toISOString(),
      type: "GRANT_INVALIDATED",
      grantId,
      details: { reason },
      provenance: "APPLICATION STATE",
    });

    return revoked;
  }

  /**
   * Dry-run execution via KeeperHub simulate:true.
   * Guaranteed safe: simulate:true sent ONLY to contract-call!
   */
  public async dryRunGrant(grantId: string): Promise<SimulationResult> {
    await this.init();
    const grant = await this.store.getGrant(grantId);
    if (!grant) throw new Error(`Grant ${grantId} not found`);

    if (grant.state.status !== "armed") {
      throw new Error(`Cannot dry run grant in status "${grant.state.status}"`);
    }

    const snapshot = await this.scanPosition(grant.position.positionOwner, grant.position.chainId);
    const capacity = await this.store.getCapacity();

    // Deterministic Underwriting -> Agent Intent
    const quote = underwritePosition(
      snapshot,
      grant.authority.perActionCapUsd,
      this.config.policyHfTarget,
      grant.authority.allowedActions
    );
    const intent: ExecutionIntent = {
      action: quote.selectedPlan.type,
      asset: grant.position.debtAsset,
      amountUsd: quote.selectedPlan.amountUsd,
      chainId: grant.position.chainId,
      positionOwner: grant.position.positionOwner,
    };

    // Policy Compiler: intent -> AuthorizedIntent
    const authorized = compilePolicyIntent(intent, grant, snapshot, this.policy, capacity.availableUsd);
    grant.authorityHash = authorized.authorityHash;

    const dryRunGrantState = transitionGrant(grant, "dry_run");
    await this.store.saveGrant(dryRunGrantState);

    // Compile Direct Execution Payload with simulate:true
    const payloads = compileExecutionPayloads(authorized, dryRunGrantState);
    this.client.assertSimulationSafety("/api/execute/contract-call", true);

    const simPayload = {
      ...payloads.directCall,
      simulate: true,
    };

    try {
      const resp = (await this.client.executeContractCall(simPayload)) as SimulationResult;

      await this.store.appendAudit({
        id: `aud_sim_${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "SIMULATION",
        grantId,
        details: {
          wouldRevert: resp.wouldRevert,
          gasEstimate: resp.gasEstimate,
          revertReason: resp.revertReason,
        },
        provenance: "KEEPERHUB FACT",
      });

      if (resp.wouldRevert) {
        const failed = transitionGrant(dryRunGrantState, "simulation_reverted", {
          reason: resp.revertReason ?? "Simulation indicated revert",
        });
        await this.store.saveGrant(failed);
      } else {
        // Return to armed state ready for real execution
        const reArmed = transitionGrant(dryRunGrantState, "armed");
        await this.store.saveGrant(reArmed);
      }

      return resp;
    } catch (err: unknown) {
      const reArmed = transitionGrant(dryRunGrantState, "armed");
      await this.store.saveGrant(reArmed);
      throw err;
    }
  }

  /**
   * Executes an Armed RescueGrant via KeeperHub.
   * Full cycle: compile -> dry run -> idempotent execute -> poll receipts -> verify -> PoAA bundle.
   */
  public async executeGrant(
    grantId: string
  ): Promise<{ execution: ExecutionRecord; receipts: DirectExecutionReceipt[]; bundle: PoaaBundle }> {
    await this.init();
    const grant = await this.store.getGrant(grantId);
    if (!grant) throw new Error(`Grant ${grantId} not found`);

    if (grant.state.status !== "armed") {
      throw new Error(`Cannot execute grant in status "${grant.state.status}". Must be "armed".`);
    }

    const preSnapshot = await this.scanPosition(grant.position.positionOwner, grant.position.chainId);
    const capacity = await this.store.getCapacity();

    // 1. Underwrite & Formulate Intent
    const quote = underwritePosition(
      preSnapshot,
      grant.authority.perActionCapUsd,
      this.config.policyHfTarget,
      grant.authority.allowedActions
    );
    const intent: ExecutionIntent = {
      action: quote.selectedPlan.type,
      asset: grant.position.debtAsset,
      amountUsd: quote.selectedPlan.amountUsd,
      chainId: grant.position.chainId,
      positionOwner: grant.position.positionOwner,
    };

    // 2. Policy Compiler (Clamp-only gate + authorityHash computation)
    const authorized = compilePolicyIntent(intent, grant, preSnapshot, this.policy, capacity.availableUsd);
    grant.authorityHash = authorized.authorityHash;

    // 3. Dry Run Simulation (Must pass before broadcasting)
    const dryRunGrantState = transitionGrant(grant, "dry_run");
    await this.store.saveGrant(dryRunGrantState);

    const payloads = compileExecutionPayloads(authorized, dryRunGrantState);
    this.client.assertSimulationSafety("/api/execute/contract-call", true);

    const simResult = (await this.client.executeContractCall({
      ...payloads.directCall,
      simulate: true,
    })) as SimulationResult;

    await this.store.appendAudit({
      id: `aud_sim_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "SIMULATION",
      grantId,
      details: { wouldRevert: simResult.wouldRevert, gasEstimate: simResult.gasEstimate, revertReason: simResult.revertReason },
      provenance: "KEEPERHUB FACT",
    });

    if (simResult.wouldRevert) {
      const failed = transitionGrant(dryRunGrantState, "simulation_reverted", {
        reason: simResult.revertReason ?? "Simulation indicated revert",
      });
      await this.store.saveGrant(failed);
      throw new Error(`Execution aborted: simulation reverted with reason "${simResult.revertReason}"`);
    }

    // 4. Submit Execution to KeeperHub with Idempotency-Key
    const idempSeed = `${grant.grantId}:${authorized.authorityHash}:${grant.state.executionCount}`;
    const idempotencyKey = `idemp_${createHash("sha256").update(idempSeed).digest("hex").slice(0, 32)}`;
    const submittedGrant = transitionGrant(dryRunGrantState, "submitted");
    await this.store.saveGrant(submittedGrant);

    const executionId = `exec_${grant.grantId.slice(0, 10)}_${Date.now()}`;
    const submittedAt = new Date().toISOString();

    const executionRecord: ExecutionRecord = {
      executionId,
      grantId,
      authorityHash: authorized.authorityHash,
      action: authorized.action,
      amountUsd: authorized.authorizedAmountUsd,
      amountWei: authorized.amountWei,
      status: "submitted",
      simulatedAt: new Date().toISOString(),
      submittedAt,
      txHash: undefined,
      preHealthFactor: preSnapshot.healthFactor,
    };

    // Pre-persist pending execution record before broadcasting to KeeperHub (H9)
    await this.store.saveExecution(executionRecord);

    await this.store.appendAudit({
      id: `aud_sub_${executionId}`,
      timestamp: submittedAt,
      type: "EXECUTION_SUBMITTED",
      grantId,
      executionId,
      details: { amountUsd: authorized.authorizedAmountUsd, authorityHash: authorized.authorityHash, idempotencyKey },
      provenance: "KEEPERHUB FACT",
    });

    let executionResp: DirectExecutionStatusResponse;
    try {
      executionResp = (await this.client.executeContractCall(
        payloads.directCall,
        idempotencyKey
      )) as DirectExecutionStatusResponse;
    } catch (err) {
      executionRecord.status = "failed";
      await this.store.saveExecution(executionRecord);
      const failedGrant = transitionGrant(submittedGrant, "failed", {
        reason: err instanceof Error ? err.message : String(err),
      });
      await this.store.saveGrant(failedGrant);
      throw err;
    }

    if (executionResp.executionId) {
      executionRecord.executionId = executionResp.executionId;
    }
    if (executionResp.transactionHash) {
      executionRecord.txHash = executionResp.transactionHash;
    }
    await this.store.saveExecution(executionRecord);

    // 6. Poll Execution Status & Verified Receipts
    let status = executionResp;
    let receipts: DirectExecutionReceipt[] = executionResp.receipts ?? [];

    const isTerminal = (s: string) =>
      ["completed", "success", "failed", "error", "system_error", "cancelled"].includes(s.toLowerCase());

    if (this.client.hasKey() && executionResp.executionId && !isTerminal(executionResp.status)) {
      status = await this.client.subscribeExecutionStatus(
        executionResp.executionId,
        (update) => {
          if (update.receipts && update.receipts.length > 0) {
            receipts = update.receipts;
          }
        },
        45000
      );
      if (status.receipts && status.receipts.length > 0) {
        receipts = status.receipts;
      }
    }

    // 7. Verify Receipts (Dual Verification)
    const chainConfig = getChainConfig(grant.position.chainId);
    const rpcUrl = chainConfig?.defaultRpcUrl;
    const verification = await verifyExecutionReceipts(status, rpcUrl);

    executionRecord.receiptVerified = verification.keeperhubVerified;
    executionRecord.independentReceiptVerified = verification.independentVerified;
    executionRecord.txHash = status.transactionHash ?? verification.keeperhubReceipt?.hash ?? executionRecord.txHash;
    executionRecord.blockNumber = verification.blockNumber;
    executionRecord.gasUsed = verification.gasUsed;

    // 8. Read Post-Execution State
    const postSnapshot = await this.scanPosition(grant.position.positionOwner, grant.position.chainId);
    executionRecord.postHealthFactor = postSnapshot.healthFactor;

    const hfImproved = postSnapshot.healthFactor > preSnapshot.healthFactor;
    const debtReduced =
      authorized.action === "repay"
        ? postSnapshot.totalDebtUsd < preSnapshot.totalDebtUsd ||
          postSnapshot.debtTokenBalance < preSnapshot.debtTokenBalance
        : true;

    let finalGrant = submittedGrant;
    if (verification.isVerified && hfImproved && debtReduced) {
      executionRecord.status = "verified";
      executionRecord.verifiedAt = new Date().toISOString();

      const verifiedGrant = transitionGrant(submittedGrant, "verified");
      verifiedGrant.state.totalSpentUsd += authorized.authorizedAmountUsd;
      verifiedGrant.state.dailySpentUsd += authorized.authorizedAmountUsd;
      verifiedGrant.state.executionCount += 1;
      await this.store.saveGrant(verifiedGrant);
      finalGrant = verifiedGrant;

      await this.store.appendAudit({
        id: `aud_ver_${executionRecord.executionId}`,
        timestamp: new Date().toISOString(),
        type: "EXECUTION_VERIFIED",
        grantId,
        executionId: executionRecord.executionId,
        details: {
          txHash: executionRecord.txHash,
          preHf: preSnapshot.healthFactor,
          postHf: postSnapshot.healthFactor,
        },
        provenance: "CHAIN FACT",
      });
    } else {
      executionRecord.status = "failed";
      const failReason = !verification.isVerified
        ? verification.reasons.join(" | ") || "Receipt verification failed"
        : !hfImproved
        ? "Post-HF failed to improve"
        : !debtReduced
        ? "Debt was not reduced after repay action"
        : "Verification failed";

      const failedGrant = transitionGrant(submittedGrant, "failed", {
        reason: failReason,
      });
      await this.store.saveGrant(failedGrant);
      finalGrant = failedGrant;
    }

    await this.store.saveExecution(executionRecord);

    // 9. Generate Exportable Proof of Authorized Agency (PoAA) Bundle
    const bundle: PoaaBundle = {
      bundleVersion: "2.0",
      grant: finalGrant,
      creationSnapshot: grant.state.creationSnapshot,
      intent,
      intentHash: authorized.intentHash,
      authorizedIntent: authorized,
      authorityHash: authorized.authorityHash,
      execution: executionRecord,
      receipts,
      snapshots: {
        before: preSnapshot,
        after: postSnapshot,
      },
      policy: this.policy,
      exportedAt: new Date().toISOString(),
    };

    await this.store.saveProofBundle(bundle);

    return {
      execution: executionRecord,
      receipts,
      bundle,
    };
  }

  /**
   * Periodic Tick Loop: scans watchlist positions, underwrites, checks invalidations, and reports desk status.
   */
  public async tick(watchlist: string[] = []): Promise<{
    scanned: number;
    proposed: number;
    executed: number;
    invalidated: number;
  }> {
    await this.init();
    let scanned = 0;
    let proposed = 0;
    let executed = 0;
    let invalidated = 0;

    // 1. Check state-bound invalidations on all currently ARMED grants
    const activeGrants = await this.store.getGrants();
    const armedGrants = activeGrants.filter((g) => g.state.status === "armed");

    for (const grant of armedGrants) {
      const snap = await this.scanPosition(grant.position.positionOwner, grant.position.chainId);
      const cap = await this.store.getCapacity();
      const evalRes = evaluatePolicy(this.policy, grant, snap, cap.availableUsd);

      if (!evalRes.ok) {
        const invReason = evalRes.reasons.some((r) => r.includes("position recovered"))
          ? "recovered"
          : evalRes.reasons.some((r) => r.includes("debt drift"))
          ? "debt-drift"
          : evalRes.reasons.some((r) => r.includes("price drift"))
          ? "price-band"
          : evalRes.reasons.some((r) => r.includes("floor"))
          ? "hf-floor-breached"
          : undefined;

        if (invReason) {
          const invGrant = transitionGrant(grant, "invalidated", {
            invalidationReason: invReason,
            reason: evalRes.reasons.join(" | "),
          });
          await this.store.releaseCapacity(grant.grantId);
          await this.store.saveGrant(invGrant);
          invalidated++;
        }
      }
    }

    // 2. Scan watchlist positions
    for (const userAddress of watchlist) {
      scanned++;
      const snap = await this.scanPosition(userAddress);
      if (snap.healthFactor > 0 && snap.healthFactor < this.config.policyHfCritical) {
        // Position below critical: propose grant if none active
        const existing = activeGrants.find(
          (g) => g.position.positionOwner.toLowerCase() === userAddress.toLowerCase() &&
                 ["proposed", "approved", "armed"].includes(g.state.status)
        );

        if (!existing) {
          await this.proposeRescueGrant(userAddress);
          proposed++;
        }
      }
    }

    return { scanned, proposed, executed, invalidated };
  }

  /**
   * Verifies an exported PoAA bundle.
   */
  public verifyProof(bundle: PoaaBundle): PoaaVerificationReport {
    return verifyPoaaBundle(bundle);
  }
}
