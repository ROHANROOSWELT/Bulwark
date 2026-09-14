# KeeperHub Ecosystem Capability Map — VERIFIED 2026-09-13

> Source of truth: live fetches of official surfaces (docs.keeperhub.com, `keeperhub.com/openapi.json`,
> `keeperhub.com/.well-known/mcp.json`, github.com/KeeperHub/keeperhub, npm registry). Every claim carries a tag:
> **VERIFIED** (read from an official source this session), **OBSERVED** (secondary), **INFERRED**, **UNVERIFIED**.
> Research agent transcripts were summarized into this file; URLs are the evidence.

## 0. Identity

KeeperHub = agent execution layer for on-chain actions. Agents compose workflows → review → dry run →
KeeperHub executes deterministically (Turnkey non-custodial signing, managed nonce/gas/routing, retries,
on-chain-re-verified receipts, audit trail). Repo: https://github.com/KeeperHub/keeperhub (Apache-2.0,
default branch `staging`, ~9,600 commits). Docs: https://docs.keeperhub.com.

## 1. REST API — VERIFIED (primary integration surface for BULWARK)

- Base `https://app.keeperhub.com`; auth `Authorization: Bearer kh_...` (org keys; `wfb_` for webhook triggers only).
  Evidence: https://docs.keeperhub.com/api/authentication, `keeperhub.com/openapi.json` (`bearerAuth`).
- Key lifecycle: app UI → Settings → Developer → API keys → Organisation keys; shown once, stored SHA256-hashed. VERIFIED.
- Wallet write ops (provision/delete/withdraw/key-export) are **session-only** — API keys get 401 there. VERIFIED. (So:
  our server never needs, and never gets, wallet-authority beyond what `kh_` grants.)
- Rate limit 60 req/min/key (`X-RateLimit-*`, 429 + `Retry-After`). VERIFIED (https://docs.keeperhub.com/api/direct-execution).
- **Idempotency**: `Idempotency-Key` header — same key+body replays stored response (`idempotentReplay: true`) for 24h;
  different body + same key → 409 `idempotency_conflict`. VERIFIED. (BULWARK uses this for duplicate-spend prevention.)
- Error envelope: `{error, detail, hint?, docs?, request_id}`. VERIFIED (openapi.json `Error` schema).

### Direct execution endpoints (all VERIFIED, exact fields)

| Endpoint | Fields | Notes |
|---|---|---|
| `POST /api/execute/transfer` | `chainId` (numeric), `recipientAddress` (EIP-55), `amount` (decimal string), `tokenAddress?`, `tokenConfig?`, `gasLimitMultiplier?`, `simulate?` | |
| `POST /api/execute/contract-call` | `contractAddress`, `chainId`, `functionName`, `functionArgs` (JSON-array string), `abi?` (JSON string; auto-fetched if omitted), `value?`, `gasLimitMultiplier?`, `simulate?` | view/pure → immediate `{result}`; write → 202 envelope |
| `POST /api/execute/check-and-execute` | read fields + `condition: {operator, value}` (`eq,neq,gt,lt,gte,lte`; ints all six; address/bytesN only eq/neq; value BigInt-compatible decimal/hex string) + `action: {contractAddress, functionName, functionArgs, abi, gasLimitMultiplier}` | "read one supported scalar → condition → conditional write"; **no native value forwarded** |
| `GET /api/execute/{executionId}/status` | returns `{executionId, status, type, network, transactionHash, transactionLink, sponsored, retryCount, receipts[], gasUsedWei, gasPriceWei, result, error, createdAt, completedAt}` | receipts: `{hash, chainId, verified, receiptStatus, blockNumber, gasUsed, verifiedAt}`; `receiptStatus ∈ success\|reverted\|safe_inner_failure\|not_found\|timeout` |

- `simulate: true` (EVM only) → `{success, status:"simulated", from, to, value, gasEstimate, simulatedReturnValue, wouldRevert:false}`;
  would-revert → 400 `{failureKind:"revert", wouldRevert:true, revertReason}`; underfunded → `code:"insufficient_balance"` with `balanceWei/requiredWei/shortfallWei`.
  **WARNING (VERIFIED): `simulate` is IGNORED by protocol actions and `/api/execute/node` — sending it there broadcasts for real.**
- Daily native-value caps (defaults 0.02 ETH/day EVM, 0.5 SOL/day) — check via `GET /api/analytics/spend-cap`;
  stablecoin transfers ≤ 100 USD per transaction; broadcasting needs `mcp:write`/`mcp:admin` scopes. VERIFIED.

### Workflow endpoints (VERIFIED)

- `GET /api/workflows` (query `projectId,tagId,limit 1–200,offset`) → bare array `{id,name,description,visibility,nodes,edges,createdAt,updatedAt}`
- `POST /api/workflows/create` — required `name, nodes, edges`; optional `description, projectId, tagId, enabled`
- `PATCH /api/workflows/{id}`, `DELETE /api/workflows/{id}` (409 if history; `?force=true`)
- `POST /api/workflows/{id}/execute` body `{"input":{...}}` optional; sending `executionId` → 400 `execution_id_not_allowed`
- `POST /api/workflows/{id}/webhook` — webhook trigger with `wfb_` key only
- History: `GET /api/workflows/{id}/executions` → `{id, workflowId, status, input, output, startedAt, completedAt, transactionHashes}`
- Live status: `GET /api/workflows/executions/{id}/status` → `nodeStatuses`, `progress{totalSteps,completedSteps,runningSteps,currentNodeId,currentNodeName,percentage}`, `errorContext`, `transactionHashes`
- `GET /api/workflows/executions/{id}/wait?timeoutMs=` (default 25000, max 60000); `GET .../logs` → per-node rows
  `{id, executionId, nodeId, nodeName, nodeType, status, input(redacted), output, error, duration, startedAt, completedAt, iterationIndex, forEachNodeId}`
- `POST /api/executions/{id}/cancel`. Statuses: `pending, running, unconfirmed` (non-terminal) / `success, error, system_error, cancelled` (terminal);
  direct route uses `completed/failed/unconfirmed`; terminality via `X-Poll-Interval-Hint` header (0 = terminal). VERIFIED.
- Marketplace call endpoints: `POST /api/mcp/workflows/{slug}/call` (free → `{executionId,status:"running"}`; write → unsigned calldata `{type:"calldata",to,data,value}`; paid → 402), `GET /api/mcp/workflows` (listings). VERIFIED.

## 2. MCP server — VERIFIED (primary agent surface)

- URL `https://app.keeperhub.com/mcp` (streamable HTTP; OAuth 2.1 scopes `mcp:read/write/admin` or `kh_` Bearer).
  **Public anonymous**: `https://app.keeperhub.com/mcp/public`. Per-workflow: `https://app.keeperhub.com/mcp/w/{slug}`.
  Server card: name `keeperhub` v1.2.0, protocol 2025-06-18 (https://keeperhub.com/.well-known/mcp.json).
- Tool highlights (full list verified on docs): `list_action_schemas`, `tools_documentation`, `get_plugin`,
  `search_protocol_actions`, `search_workflows`, `call_workflow`, `get_workflow_listing`, `list_workflows`,
  `get_workflow`, `create_workflow` (`idempotency_key`; created disabled unless `enabled=true`), `update_workflow`,
  `delete_workflow`, **`validate_workflow`**, `validate_cron`, `execute_workflow`, **`get_execution`** (status + step logs +
  `transactionHashes`), `list_executions`, `get_direct_execution_status`, `execute_transfer`, **`execute_contract_call`**
  (accepts `simulate:true`), **`execute_check_and_execute`** (accepts `simulate:true`), `execute_protocol_action`
  (`actionType` like `aave-v3/supply`; **`simulate` ignored — broadcasts for real**), `search_templates`, `deploy_template`,
  `ai_generate_workflow`, `list_workflow` (publish), `unlist_workflow`, `update_workflow_listing`, `get_spending_limits`,
  `list_integrations`, `test_notification`.
- Workflow node schema (VERIFIED): node `{id, type:"action"|"trigger", data:{label, description?, type, status?, config:{actionType, network, ...}}}`;
  edges `{id, source, target}` with `sourceHandle:"true"/"false"` (Condition) and `"loop"/"done"` (For Each);
  `network` takes **string** chain ids `"1","11155111","8453",...`; `abi` must be a JSON **string**; `functionArgs` = JSON-stringified
  positional array; `gasLimitMultiplier` a string; `web3Connection: "default"|"eoa"|"safe:<id>"`; templating `{{@nodeId:Label.field}}`.
- Triggers (VERIFIED): Manual, Schedule, Webhook, Event, Block, Transfer.
- **Workflow-level dry-run does NOT exist yet** (roadmap, https://docs.keeperhub.com/agent/mcp-test-workflow). Dry run = direct-execution `simulate:true`.

## 3. CLI — VERIFIED

Go CLI `kh` (no npm). Install: `brew install keeperhub/tap/kh` or `go install github.com/keeperhub/cli/cmd/kh@latest`
(repo https://github.com/keeperhub/cli, latest release v0.15.0 2026-08-18). Auth: `kh auth login` device-code → keyring; CI via `KH_API_KEY`.
Commands: `kh action(get,list) auth billing chain config doctor read update version execute(contract-call,status,transfer)
org plugin project run(cancel,logs,status) tag template wallet(add,balance,fund,info,link,tokens) workflow(create,delete,disable,enable,get,go-live,list,run,update)`.

## 4. Official npm — VERIFIED

- `@keeperhub/sdk` 0.1.1 (2026-06-02) — "stateless, typed HTTP client"; sole dep zod; README says surface still stabilizing; no documented methods.
- `@keeperhub/wallet` 0.1.15 — Agentic Wallet (auto-pay x402/MPP 402s via server-side Turnkey proxy).
- `@keeperhub/mcp` 0.1.1 — shared MCP client foundation for agent-framework adapters.
- Everything else on npm named "keeperhub*" is third-party (verified via registry): do not use.

## 5. Wallet model — VERIFIED

Turnkey enclaves; org wallet auto-provisioned on email verification; EVM + Solana addresses; gas sponsored route
(optional) or wallet-pays; Safe-as-Sender optional. `kh_` keys cannot provision/delete wallets, withdraw, or export keys.
Agentic Wallet (`@keeperhub/wallet`) is custodial with hard caps: auto ≤ $5 / ask / block ≥ $100; contract allowlist
(Base USDC `0x8335...02913`, Tempo USDC.e `0x20c0...8b50`); 100 USDC per transfer/approval; 200 USDC/UTC-day; EIP-712
denied off chains 8453/4217/42431; `payTo` must match target workflow's org wallet. Evidence: https://docs.keeperhub.com/wallet-management/turnkey, /agent/agentic-wallet.

## 6. Protocols & networks — VERIFIED

- **Aave V3 plugin**: actions Supply, Withdraw, Borrow, Repay Debt, Set Asset as Collateral (writes) + Get User Account
  Data, Get User Reserve Data (reads). `healthFactor` output documented at 18 decimals; rates in ray.
  Chains: **Ethereum (1), Base (8453), Arbitrum (42161), Optimism (10) — Sepolia NOT supported for Aave V3.**
  Evidence: https://docs.keeperhub.com/plugins/aave-v3. Aave V4 plugin also exists.
- **Chains (live `GET /api/chains`, public, 24 chains)**: Ethereum 1, Sepolia 11155111, Base 8453, Base Sepolia 84532,
  Arbitrum 42161/421614, Optimism 10/11155420, Polygon 137/80002, BNB 56/97, Avalanche 43114/43113, Tempo 4217/42431,
  0G 16661/16602, Robinhood 4663/46630, Plasma 9745/9746, Solana 101/103.
  Ethereum mainnet + Sepolia use **private mempool RPC** (MEV protection where relevant). VERIFIED.
- Other DeFi plugins: aave-v4, aerodrome, ajna, chainlink, chronicle, compound, cowswap, curve, ethena, frax-ether-v2,
  layerzero, lido, morpho, pendle, rocket-pool, sky, spark, superfluid, uniswap, wrapped, yearn-v3, safe, hyperliquid, robinhood, tempo.

## 7. Marketplace & payments — VERIFIED

Publish workflows (slug permanent; inputs from Manual trigger become the JSON-schema params); creator earns 70%, platform 30%.
Calls: free → `{executionId}`; write-type → unsigned calldata `{to,data,value}`; paid → **HTTP 402**. Payments: **x402** =
USDC on Base (EIP-3009 TransferWithAuthorization, facilitator pays gas); **MPP** = USDC.e on Tempo (chain 4217), payment proof.
Both always offered; typical prices $0.001–$0.10/call. Listed workflows registered on x402scan / mppscan / 8004scan registries.
Paid calls ≥ $0.05 don't count against the monthly execution limit.
**OPEN: exact 402 header names not documented** (openapi.json only declares an `x402` security scheme).

## 8. Reliability internals — VERIFIED (docs overview + release notes)

Managed gas estimation, nonce management, transaction ordering, retries with exponential backoff, monthly gas sponsorship,
per-chain token-bucket rate limiting (v3.1.1), execution modes `isolated|complex|process`. `retryCount` field exists on
direct-execution status (observed 0 on the three direct endpoints). Receipts are **re-verified on-chain**; `not_found`/`timeout` fail closed.

## 9. GitHub / contribution — VERIFIED

Next.js 16 + TS 5 + Drizzle/Postgres + Turnkey + Redis; services: Executor, Scheduler, Event Tracker, Sandbox (WASM), etc.
CONTRIBUTING.md: **issue-first** (behavior changes need an `accepted`-labeled issue); PRs → `staging`; Conventional Commits;
no `good first issue` label; docs/typo fixes exempt from the issue rule. No bounty program documented. Latest release v3.5.0 (2026-09-12).

## 10. Open uncertainties (do not guess)

1. Exact x402/MPP 402 header names — UNVERIFIED (must be probed at runtime).
2. Per-tool MCP input schemas — deliberately unpublished; fetch via `tools_documentation`/`list_action_schemas` at runtime.
3. `@keeperhub/sdk` method surface — undocumented (inspect `dist/index.d.ts` if used).
4. Workflow-level dry-run — not shipped yet; re-check before submission.
5. Sepolia support for Aave V3 *protocol actions* — NOT listed; Sepolia verified for generic `web3/write-contract`,
   `execute_transfer`, `execute_contract_call` only.
6. Whether `check-and-execute` can read tuple-returning views (e.g. `getUserAccountData`) — UNVERIFIED; assume scalar-only
   (`balanceOf`-style) reads.
