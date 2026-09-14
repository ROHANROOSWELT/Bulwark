# KeeperHub Integration Feedback & Platform Analysis

**Author:** BULWARK Engineering Team  
**Date:** 2026-09-14  
**Scope:** KeeperHub REST APIs, Streamable-HTTP MCP Server (`/mcp` and `/mcp/public`), Direct Execution Engine, Turnkey Signing, Workflow Node Engine, and Documentation.  
**Taxonomy of Claims:** Every technical claim in this document is labeled with one of the following tags:
- `[DOCUMENTATION]`: Stated in official KeeperHub documentation or OpenAPI specs.
- `[OBSERVATION]`: Observed directly during live API interaction or tool usage.
- `[REPRODUCED]`: Empirically confirmed via automated reproducible test cases.
- `[INFERENCE]`: Deduceable engineering conclusion based on architecture and behavior.

---

## 1. Executive Summary

KeeperHub provides an institutional-grade execution infrastructure for autonomous web3 agents, combining Turnkey-backed private key custody, automated nonce and gas management, and a unified streamable MCP surface. `[DOCUMENTATION]`

During the development of **BULWARK**, we integrated deeply with:
1. Direct contract execution via `POST /api/execute/contract-call`.
2. Condition-gated execution via `POST /api/execute/check-and-execute`.
3. Streamable HTTP MCP server at `https://app.keeperhub.com/mcp` and `https://app.keeperhub.com/mcp/public`.
4. Analytical budget controls via `GET /api/analytics/spend-cap`.
5. Multi-step workflow definitions and validation via `validate_workflow`.

This document synthesizes our experience, cataloging what worked exceptionally well, identifying critical friction points and edge cases, and proposing high-impact platform enhancements.

---

## 2. Setup & Developer Experience

### 2.1 What Worked Well
- **Zero-Setup Public MCP (`/mcp/public`)**: Providing an anonymous public MCP endpoint that responds to `initialize` and `tools/list` without requiring an API key allows instant capability discovery in CI/CD pipelines. `[OBSERVATION]`
- **Bearer Key Scoping**: Organization API keys are easy to issue from the developer portal, and the permissions model (`mcp:read`, `mcp:write`, `mcp:admin`) cleanly partitions agent authority. `[DOCUMENTATION]`
- **Chain Registry**: The `GET /api/chains` endpoint lists all 24 supported networks with chain IDs and default RPCs, eliminating hardcoded network configurations. `[OBSERVATION]`

### 2.2 Friction Points
- **Go CLI Installation Only**: The official CLI `kh` is distributed via Go binaries and Homebrew tap only. Because the majority of web3 agent frameworks operate in Node.js/TypeScript environments, having an official npm package or binary wrapper for `kh` would significantly improve onboarding. `[OBSERVATION]`
- **Error Envelope Consistency**: Most endpoints return `{ error: string, detail?: string }`, but certain validation failures on workflow nodes return raw strings or HTML 502/504 gateways under heavy load. `[OBSERVATION]`

---

## 3. Dry Run & Simulation (The Critical Footgun)

### 3.1 The `simulate:true` Inconsistency `[CRITICAL ISSUE]`
- **Expected:** `[DOCUMENTATION]` states that `simulate:true` executes without broadcasting to the network, returning `wouldRevert`, `gasEstimate`, and return data.
- **Actual:** `[REPRODUCED]` `simulate:true` is supported **only** on:
  - `POST /api/execute/contract-call`
  - `POST /api/execute/transfer`
  - `POST /api/execute/check-and-execute`
  
  When an agent calls `POST /api/execute/protocol-action` or invokes workflow node execution (`/api/execute/node`), the `simulate` parameter is **silently ignored**, and the transaction is **broadcast for real on-chain**.
- **Reproduction:**
  1. Call `POST /api/execute/protocol-action` with body `{ "actionType": "aave-v3/supply", "simulate": true, ... }`.
  2. KeeperHub does not return simulation results; instead, it submits the transaction to the mempool and returns an `executionId` in status `pending`.
- **Bulwark Remediation:** BULWARK implemented a strict client-level guard (`assertSimulationSafety`), throwing a typed `KeeperHubSimulateForbiddenError` before any request is dispatched if `simulate:true` is attempted on protocol action routes. `[OBSERVATION]`

---

## 4. Execution & Receipt Verification

### 4.1 Strengths
- **Idempotency Support**: Passing `Idempotency-Key` headers on execution endpoints prevents duplicate execution during network retries. `[REPRODUCED]`
- **Polling Optimization**: The `X-Poll-Interval-Hint` header on `GET /api/execute/{id}/status` provides a reliable polling interval, preventing aggressive polling loops. `[OBSERVATION]`
- **Internal Dual Receipts**: KeeperHub receipts include both execution status and confirmation receipts with block numbers and gas used. `[DOCUMENTATION]`

### 4.2 Edge Cases & Fail-Closed Behaviors
- **Mempool Dropped Transactions**: On testnets (such as Sepolia), re-orgs or gas spikes occasionally cause transactions to remain in `unconfirmed` status indefinitely. The polling client must enforce a strict maximum retry threshold and map timeouts fail-closed. `[OBSERVATION]`
- **Receipt Verification Latency**: When querying execution status immediately following submission, `receipts` array is initially empty. Client code must not treat an empty receipts array as execution failure until the terminal status (`completed`, `failed`, or `error`) is reported. `[REPRODUCED]`

---

## 5. Confusing, Missing, or Broken Behaviors

### Issue 1: Workflow-Level Dry Run Does Not Exist `[OBSERVATION]`
- **Expected:** Agents authoring multi-node workflows (Trigger &rarr; Condition &rarr; Action) should be able to dry-run the complete DAG.
- **Actual:** Dry-run exists only for single contract calls. Multi-node DAGs cannot be dry-run in sandbox without live node triggers.
- **Recommendation:** Introduce `POST /api/workflows/{id}/simulate` to execute mock workflow traversals.

### Issue 2: Workflow Node Argument Serialization `[REPRODUCED]`
- **Expected:** JSON payloads for `functionArgs` in `web3/write-contract` nodes accept standard JSON arrays `[arg1, arg2]`.
- **Actual:** The node engine requires `functionArgs` and `abi` to be passed as **JSON-stringified strings** (e.g. `functionArgs: "[\"0x...\", \"100\"]"`). Passing raw arrays results in uninformative schema validation errors.
- **Bulwark Remediation:** Handled in `packages/core/src/workflow/compile.ts` by ensuring double-encoding of arguments.

### Issue 3: Daily Native Spend-Cap Reset Timing `[OBSERVATION]`
- **Expected:** `GET /api/analytics/spend-cap` returns clear UTC timestamp for daily reset.
- **Actual:** Field `resetAt` is sometimes omitted when daily spend is zero, requiring clients to defensively default to midnight UTC.

---

## 6. Hard-to-Test Areas

1. **Private Mempool Verification on Sepolia**: KeeperHub routes transactions through private builder endpoints on Sepolia testnet. Verifying that a transaction was never visible in the public mempool requires specialized mempool monitoring nodes. `[INFERENCE]`
2. **Turnkey Quorum Policies**: Testing multi-party approval quorums on Turnkey wallets requires multiple signing credentials, making automated CI mocking necessary for developer test suites. `[OBSERVATION]`

---

## 7. Recommendations for KeeperHub Roadmap

1. **Explicit Simulation Rejection**: Throw an HTTP 400 Bad Request if `simulate:true` is sent to any endpoint that does not support simulation, rather than silently broadcasting.
2. **First-Class TypeScript MCP SDK**: Expand `@keeperhub/mcp` with pre-typed input/output schemas for all tools discovered in `tools/list`.
3. **Workflow DAG Simulator**: Provide an in-memory execution engine for multi-step workflow graphs.
4. **Explorer Webhook Callbacks**: Support webhooks not just for workflow completion, but for individual transaction mining events.
