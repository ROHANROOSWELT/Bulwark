# KeeperHub Bounty Track Proposal: Simulation Safety Warning & Documentation Fix

**Target Repository:** `KeeperHub/keeperhub`  
**Target Branch:** `staging`  
**Type:** Documentation & DX Fix (`docs: clarify simulate behavior on protocol actions`)  
**Status:** Prepared for submission (No code change required to KeeperHub runtime; zero-risk, high-impact DX improvement)

---

## 1. Issue Description

### Title
`docs(api): document simulate:true exclusion on execute_protocol_action and /api/execute/node`

### Problem Summary
In KeeperHub's REST execution endpoints, developers and AI agents frequently pass `{ "simulate": true }` expecting a gas estimation and dry-run execution without broadcasting on-chain transactions.

While `simulate:true` is supported on:
- `POST /api/execute/contract-call`
- `POST /api/execute/transfer`
- `POST /api/execute/check-and-execute`

It is **not supported and silently ignored** on:
- `POST /api/execute/protocol-action`
- `POST /api/execute/node`

When an autonomous agent or developer passes `{ "simulate": true }` to `execute_protocol_action` (e.g. `aave-v3/supply`), the request is treated as a live write broadcast. The transaction is submitted to the mempool and executed on-chain for real.

### Impact
This discrepancy represents a severe financial footgun for agent developers testing automated DeFi strategies, who may inadvertently deploy real capital when attempting dry-runs.

---

## 2. Proposed Documentation Change (Diff)

```diff
--- a/docs/api-reference/execute.md
+++ b/docs/api-reference/execute.md
@@ -45,6 +45,11 @@
 | `functionArgs` | string | Yes | JSON string array of arguments |
 | `simulate` | boolean | No | When true, executes dry-run simulation without broadcasting |
 
+> [!WARNING]
+> **Simulation Support Notice**  
+> `simulate: true` is currently supported ONLY on `/api/execute/contract-call`, `/api/execute/transfer`, and `/api/execute/check-and-execute`.  
+> Calling `/api/execute/protocol-action` or `/api/execute/node` with `simulate: true` will **silently ignore** the parameter and broadcast the transaction live to the network.
+
 ### Protocol Actions
 
 ```http
 POST /api/execute/protocol-action
@@ -52,3 +57,7 @@ Content-Type: application/json
 
 {
   "actionType": "aave-v3/supply",
+  // NOTE: simulate is NOT supported on protocol actions.
+  // To simulate Aave calls safely, use /api/execute/contract-call directly.
```

---

## 3. Conventional Commit Message

```text
docs(api): clarify simulate support across execution endpoints

Document that simulate:true is supported exclusively on contract-call,
transfer, and check-and-execute endpoints, and is not evaluated on
protocol-action or node routes. Adds explicit developer warning callout.
```
