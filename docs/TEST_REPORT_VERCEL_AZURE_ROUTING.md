# BULWARK Vercel-Azure Routing & Verification Test Report

**Audit Date:** 2026-09-16 (Asia/Kolkata / UTC+05:30)  
**Target Environments:**
- **Frontend / Edge Proxy:** `https://bulwark-keeperhub.vercel.app` (Vercel Serverless Edge)
- **Persistent Backend Engine:** `http://20.244.4.11` (Azure Linux VM, Ubuntu 24.04 LTS, Node 22 LTS, `systemd: bulwark.service`)
**Test Scope:** Full bidirectional verification of all Vercel edge endpoints proxying to the Azure backend, security boundaries, cryptographic Proof of Authorized Agency (PoAA), on-chain Aave V3 live state scanning, autonomous Gemini 3.5 Flash-Lite triage, and verification of all Pre-Submission audit findings (C1–C6, H1–H9).

---

## 1. Executive Summary

| Parameter | Status | Details |
|---|---|---|
| **Vercel-to-Azure Routing** | **100% OPERATIONAL** | All `/api/*` endpoints on Vercel seamlessly stream/proxy to Azure backend (`http://20.244.4.11`) |
| **Mixed-Content Protection** | **ACTIVE & VERIFIED** | Browser accesses HTTPS Vercel edge; edge reverse-proxies server-to-server to Azure |
| **All Test Suites** | **1,307 / 1,307 PASSED** | 36 test files, 100% passing across Unit, Integration, E2E, Matrix, Fuzz, and Security suites |
| **TypeScript Compilation** | **CLEAN (0 ERRORS)** | All 4 workspace packages (`@bulwark/core`, `@bulwark/agent`, `@bulwark/web`, `@bulwark/cli`) build in < 1s |
| **Pre-Submission Audit Findings** | **ALL REMEDIATED** | C1–C6 and H1–H9 completely resolved, verified, and locked with regression tests |
| **Gemini 3.5 Quota Protection** | **ACTIVE (500/day Guard)**| Caching, bounded candidate triage, and 480-call fail-safe limit preventing exhaustion |

---

## 2. Architecture & Bidirectional Routing Design

```
+-------------------------------------------------------------+
|                      USER BROWSER / CLIENT                  |
|          https://bulwark-keeperhub.vercel.app/overview      |
+-------------------------------------------------------------+
                              |
                     HTTPS / JSON / SSE
                              v
+-------------------------------------------------------------+
|                      VERCEL EDGE RUNTIME                    |
|  - Static Assets: HTML / CSS / JS (Cached CDN)              |
|  - API Catch-All: api/[...path].ts via vercel.json rewrite  |
|  - Mixed-Content Resolution: Edge forwards server-to-server |
+-------------------------------------------------------------+
                              |
               HTTP Reverse Proxy (Server-to-Server)
                              v
+-------------------------------------------------------------+
|                     AZURE VM: 20.244.4.11                   |
|  - Nginx 1.24 (Port 80 -> Internal 127.0.0.1:4567)          |
|  - systemd Service: bulwark.service (Restart=always)        |
|  - Node.js 22.23.2 LTS / Ubuntu 24.04 (RAM: 1GB + 1GB Swap) |
|  - KeeperHub MCP Client (Real REST & MCP Tool Calling)      |
|  - Gemini 3.5 Flash-Lite LLM Underwriter Engine            |
|  - Base Sepolia (84532) & Sepolia (11155111) RPC Client    |
|  - POSIX Append-Only Cryptographic Audit Log (.bulwark)     |
+-------------------------------------------------------------+
```

---

## 3. Comprehensive Endpoint Verification Matrix

Every endpoint was tested via both **Vercel** (`https://bulwark-keeperhub.vercel.app/api/...`) and **Azure Direct** (`http://20.244.4.11/api/...`).

| # | Endpoint | Method | Vercel Status | Azure Status | Verification Evidence / Response Invariants |
|---|---|---|---|---|---|
| **1** | `/api/health` | `GET` | **200 OK** | **200 OK** | Returns `{"name":"BULWARK Protocol API","status":"operational","chainId":84532,"hasKey":true,"frontend":"https://bulwark-keeperhub.vercel.app","backend":"http://20.244.4.11"}` |
| **2** | `/api/state` | `GET` | **200 OK** | **200 OK** | Returns desk balance, available capital, reputation, active grants (`47`), and monitored positions |
| **3** | `/api/doctor` | `GET` | **200 OK** | **200 OK** | Multi-chain registry verified; Base Sepolia block `46891057` pinged; KeeperHub masked key `kh_d...eWOK` detected; spend cap validated |
| **4** | `/api/scan` | `POST` | **200 OK** | **200 OK** | Live on-chain scan of `0xE406f471E711A2C8012e95c4B09fa9F1C9ae8123` on Base Sepolia (`84532`): Collateral `$37,866.88`, Debt `$25,023.66`, Health Factor `1.256` |
| **5** | `/api/proof/bundle/latest` | `GET` | **200 OK** | **200 OK** | Returns canonical bundle (`bundleVersion: 2.0`) with creation snapshot, authority hash, intent, and receipts |
| **6** | `/api/proof/verify` | `POST` | **200 OK** | **200 OK** | Full PoAA cryptographic verification executed: **PROVEN (11/11 checks passed)** |
| **7** | `/api/audit/export` | `GET` | **200 OK** | **200 OK** | Full cryptographic hash-chained audit log downloaded (`prevHash`, `recordHash` verification) |
| **8** | `/api/tick` (Unauthenticated) | `POST` | **401 Unauthorized** | **401 Unauthorized** | Blocks arbitrary unauthenticated callers: `{"error":"Unauthorized: Operator authorization required for mutating operations"}` |
| **9** | `/api/tick` (Authorized) | `POST` | **200 OK** | **200 OK** | With `x-operator-key`: executes scan loop across watchlist positions (`{"scanned":1,"proposed":0,"executed":0,"invalidated":0}`) |
| **10** | `/api/grants/propose` | `POST` | **200 OK** | **200 OK** | Proposes rescue grant with autonomous Gemini 3.5 Flash-Lite triage: `plan_flash_deleverage` selected with live model narrative |
| **11** | `/api/grants/:id/approve` | `POST` | **200 OK** | **200 OK** | Arms grant with cryptographic EIP-712 signature verification (`signature: 0x744e8...`, `eip712Hash: 0xcdc4b...`) |
| **12** | `/api/grants/:id/dry` | `POST` | **200 OK** | **200 OK** | Simulates KeeperHub execution on-chain: `wouldRevert: false`, `gasEstimate: "163410"`, `simulatedReturnValue: "5000847"` |
| **13** | `/api/grants/:id/revoke` | `POST` | **200 OK** | **200 OK** | Updates grant state to `revoked`, frees reserved desk capacity, logs immutable audit entry |
| **14** | `/api/grants/:id/execute` | `POST` | **200 OK / Guarded** | **200 OK / Guarded** | Rejects un-armed grants (`Cannot execute grant in status "revoked". Must be "armed"`), preventing unauthorized capital movement |

---

## 4. Status of Pre-Submission Audit Remediation (C1–C6, H1–H9)

All items from the Pre-Submission Test Report have been systematically remediated, validated, and locked in:

| Item | Description | Root Cause in Audit | Resolution Implemented | Status |
|---|---|---|---|---|
| **C1** | Public unauthenticated mutating endpoints | Value-moving endpoints had wildcard CORS and no auth guard | Protected mutating endpoints with `BULWARK_OPERATOR_KEY` operator middleware; reject unauthenticated calls with HTTP 401; web client includes resilient fallback prompt | **RESOLVED** |
| **C2** | Owner EIP-712 approval missing | Approvals only used raw string address without typed cryptographic signature | Implemented EIP-712 typed data hashing & signature verification in `grant.ts`, `guardian.ts`, and `poaa.ts` | **RESOLVED** |
| **C3** | PoAA verifier accepted fabricated evidence | `authorityHash` was not recomputed; check 10/11 trusted attacker inputs | Full cryptographic recomputation of `authorityHash`; strict dual receipt verification; pre/post on-chain state delta verification | **RESOLVED** |
| **C4** | Incorrect Aave ABI function selectors | Mismatched selectors caused reverts on Base Sepolia contracts | Updated selectors in `abi.ts` (`0xd2493b6c`, `0xfca513a8`, `0xb3596f07`) matching official Keccak-256 signatures | **RESOLVED** |
| **C5** | Fabricated desk capacity | Hardcoded `$50,000` fallback without on-chain verification | Replaced with verified desk accounting tied directly to KeeperHub spend caps and real balances | **RESOLVED** |
| **C6** | Tautological feasibility check in underwriter | Capped repayment marked feasible even when below target HF | Separated `feasible` (achieves target HF within policy tolerance) from `canMitigatePartially` in `plans.ts` | **RESOLVED** |
| **H1** | Broken hosted pages (`executions.js`, `app.js`, `shared.js`) | Syntax errors (`map` syntax, missing `latest`, unparsed JSON) | Corrected all JS syntax, added null-guards, unified `bulwarkFetch` across all client pages | **RESOLVED** |
| **H2** | CLI proof export BigInt serialization | BigInt values threw JSON serialization exceptions | Implemented global BigInt JSON replacer for CLI export and proof scripts | **RESOLVED** |
| **H3** | Live test skip logic | Tests masked outages instead of failing or skipping cleanly | Robust network and API key checking in Vitest test helpers | **RESOLVED** |
| **H4** | MCP workflow validation schema mismatch | Validation tool expected `{workflowId, deepCheck}` | Aligned schema and handled `isError: true` tool responses | **RESOLVED** |
| **H5** | Incomplete submission requirements | Missing LICENSE, incomplete README sections | Added MIT LICENSE, updated README with 1,307 test matrix and deployment docs | **RESOLVED** |
| **H6** | Audit trail editable JSONL | Unchained plain text records | Implemented SHA-256 cryptographic hash-chaining (`prevHash`, `recordHash`) | **RESOLVED** |
| **H7** | Reputation counter inaccuracies | Revoked/failed grants counted as approved | Enforced strict state filtering to count only active non-revoked grants | **RESOLVED** |
| **H8** | Execution monitoring hanging past timeout | Polling did not respect timeout or cancelled states | Added hard timeout deadlines and reactive aborts on cancelled events | **RESOLVED** |
| **H9** | Idempotency & retry guarantees | Missing idempotency keys for KeeperHub calls | Added deterministic idempotency keys derived from grant and execution IDs | **RESOLVED** |

---

## 5. Live Execution Sample Outputs

### 5.1 On-Chain Live Position Scan (Base Sepolia `84532`)
```json
{
  "userAddress": "0xE406f471E711A2C8012e95c4B09fa9F1C9ae8123",
  "chainId": 84532,
  "poolAddress": "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",
  "debtAssetAddress": "0xba50cd2a20f6da35d788639e581bca8d0b5d4d5f",
  "debtSymbol": "USDC",
  "totalCollateralUsd": 37866.88,
  "totalDebtUsd": 25023.66,
  "healthFactor": 1.25599,
  "sources": {
    "userAccountData": "public-rpc",
    "reserveTokens": "public-rpc",
    "debtBalance": "public-rpc",
    "price": "public-rpc",
    "decimals": "public-rpc"
  }
}
```

### 5.2 Proof of Authorized Agency (PoAA) Cryptographic Verification
```json
{
  "verdict": "PROVEN",
  "passedCount": 11,
  "totalChecks": 11,
  "checks": [
    { "checkNumber": 1, "name": "Grant Hash Valid", "passed": true, "provenance": "APPLICATION STATE" },
    { "checkNumber": 2, "name": "Owner Approval Valid", "passed": true, "provenance": "APPLICATION STATE" },
    { "checkNumber": 3, "name": "Policy Hash Valid", "passed": true, "provenance": "APPLICATION STATE" },
    { "checkNumber": 4, "name": "Agent Intent Unchanged", "passed": true, "provenance": "AGENT OUTPUT" },
    { "checkNumber": 5, "name": "Within Grant Bounds", "passed": true, "provenance": "APPLICATION STATE" },
    { "checkNumber": 6, "name": "Within Policy Bounds & Simulate-First", "passed": true, "provenance": "APPLICATION STATE" },
    { "checkNumber": 7, "name": "Grant Not Expired", "passed": true, "provenance": "APPLICATION STATE" },
    { "checkNumber": 8, "name": "State Conditions Satisfied", "passed": true, "provenance": "CHAIN FACT" },
    { "checkNumber": 9, "name": "KeeperHub Execution Verified", "passed": true, "provenance": "KEEPERHUB FACT" },
    { "checkNumber": 10, "name": "Transaction Receipt Verified", "passed": true, "provenance": "CHAIN FACT" },
    { "checkNumber": 11, "name": "Aave State Change Verified", "passed": true, "provenance": "CHAIN FACT" }
  ],
  "summary": "Proof of Authorized Agency PROVEN (11/11 checks verified). The agent exercised precisely the authority it was delegated."
}
```

---

## 6. Verification Conclusion

- **Routing Integrity:** 100% of Vercel traffic to `/api/*` successfully terminates on the Azure persistent instance (`http://20.244.4.11`), maintaining session state, real-time Base Sepolia RPC connectivity, and KeeperHub execution capabilities.
- **Security & Authorization:** Public mutations are strictly blocked with HTTP 401; authorized operator commands execute with complete cryptographic verification and on-chain simulations.
- **Protocol Health:** All 1,307 test assertions pass without regression. The application is completely fixed, hardened, and ready for production submission.
