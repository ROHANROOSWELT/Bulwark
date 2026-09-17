# BULWARK — BUILD.md

> **This document is the full A→Z build prompt for the #1-prize submission.** Any agent (or human) executing this
> build must follow the phases in order, satisfy every acceptance criterion, and never violate the rules in §1.
> If any detail is in doubt, consult the reference documents in §0 **before writing code** — never invent APIs,
> addresses, or response shapes.

Working directory: `D:\keeperhub` · Stack: TypeScript (strict, ESM, Node ≥22) · pnpm 11 monorepo · vitest
· Deadline: **2026-09-18 15:30** (DoraHacks "KeeperHub — The Agent Economy Hackathon", $5,000 pool).

---

## 0. Reference documents (READ FIRST — the source of truth)

| Doc | Use it for |
|---|---|
| [`docs/WINNER.md`](./WINNER.md) | The finalized problem statement, architecture, authority model, failure model, honest limits |
| [`docs/ORIGINALITY_UPGRADE.md`](./ORIGINALITY_UPGRADE.md) | **The upgraded mechanism spec**: adaptive RescueGrant fields, policy compiler, PoAA 11-check chain, economic model, implementation delta (MUST/SHOULD/DO-NOT-BUILD), demo script |
| [`docs/RESEARCH_KEEPERHUB.md`](./RESEARCH_KEEPERHUB.md) | **Every verified KeeperHub endpoint/tool/field.** The REST client must match these shapes exactly. Open uncertainties in §10 must never be silently guessed |
| [`docs/RESEARCH_AAVE.md`](./RESEARCH_AAVE.md) | Verified Aave V3 addresses, `getUserAccountData`/`repay`/`withdraw` signatures, HF semantics, units |
| Ideation & Architecture Archive | Why this idea won — 15 candidates considered & rejected, rubric scores, competitive research |

Conflict rule: verified research docs > this file > anything else. Tag every unverifiable fact
`VERIFIED / OBSERVED / INFERRED / UNVERIFIED` and never mix them.

---

## 1. Mission, success criteria, non-negotiable rules

**Mission.** Build BULWARK — the agent backstop desk for live Aave positions: an underwriter agent prices
live Aave V3 positions and issues **RescueGrants** (state-bound authority objects with **adaptive HF-band
caps**, assumptions, and expiry); a deterministic **policy compiler** turns agent intent into Authorized Intents
(clamp-only — the agent can never raise a limit); **KeeperHub** executes exactly those intents (simulate →
idempotent execute → receipts); and the 11-check **Proof of Authorized Agency** lets anyone verify the agent
exercised precisely the authority it was given. Full upgrade spec: [`docs/ORIGINALITY_UPGRADE.md`](./ORIGINALITY_UPGRADE.md).

**Judging rubric → design consequences:**

| Criterion | Weight | How BULWARK scores it |
|---|---:|---|
| Integration depth | 25% | REST client over verified endpoints + MCP discovery/validation + workflow CRUD + direct execution + receipts + marketplace-ready compile |
| Real execution + value movement | 25% | Real `Pool.repay(asset, amount, 2, onBehalfOf=owner)` via KeeperHub on Sepolia (Aave live testnet market) / Base — desk capital burns owner debt |
| Reliability + observability | 20% | Policy gate, simulate-first, idempotency keys, state machine, dual receipt verification, audit JSONL, dashboard provenance labels |
| Usefulness + originality | 20% | RescueGrant primitive, portfolio desk, proof bundles, premium curve — see §7 originality boosters |
| DX + code quality | 10% | Strict TS, one core SDK shared by CLI+web+agent, complete test matrix, honest docs |

**Non-negotiable rules** (violating any = automatic rejection by our own gate):

1. **ZERO mocked execution/economic values.** No fabricated tx hashes, balances, statuses, receipts, premiums-as-fact.
   Unavailable ⇒ display `UNAVAILABLE` / `PENDING` / `NOT EXECUTED`.
2. Every KeeperHub call matches a shape verified in `docs/RESEARCH_KEEPERHUB.md`. If a shape is not verified there,
   it is `UNVERIFIED` and must degrade gracefully (never crash, never fake success).
3. `simulate:true` must never be sent to `execute_protocol_action` or `/api/execute/node` (VERIFIED: it is ignored →
   real broadcast). Simulate only via `/api/execute/contract-call`, `/api/execute/transfer`, `/api/execute/check-and-execute`.
4. Agent authority is bounded: LLM output is labeled `AGENT OUTPUT`, is never trusted for sizing/limits, and is
   validated against the deterministic plan set. The policy engine is the second gate BEFORE KeeperHub sees anything.
5. A grant in status `proposed` NEVER executes. Owner approval is an explicit human action (CLI or web).
6. Provenance labels on every displayed value: `CHAIN FACT / KEEPERHUB FACT / APPLICATION STATE / AGENT OUTPUT /
   BOOKKEEPING / UNAVAILABLE`.
7. Tests requiring a live key **skip with an explicit reason when the key is absent** — they never silently pass.
8. No hidden manual steps; every workflow is reproducible from a clean clone (`README.md` must prove it).

---

## 2. Repository layout (target state)

```
keeperhub/
├── docs/                      # research + winner + THIS file + feedback + traceability
├── packages/
│   ├── core/                  # @bulwark/core — the SDK (single source of business logic)
│   │   └── src/
│   │       ├── keccak.ts      # dependency-free keccak-256 (self-tested against known vectors)
│   │       ├── abi.ts         # selectors + ABI encode/decode for the verified read/write set
│   │       ├── config.ts      # env config (KEEPERHUB_API_KEY, policy bounds, chains, LLM, store)
│   │       ├── chains.ts      # verified chain/contract registry (evidence comments)
│   │       ├── keeperhub/{client,types,errors}.ts   # REST client — VERIFIED shapes only
│   │       ├── aave/reader.ts # position/truth reader (KeeperHub read path + public-RPC fallback)
│   │       ├── grants/{grant,store}.ts              # RescueGrant (adaptive bands, assumptions, hashes) + store + capacity ledger
│   │       ├── policy/engine.ts                     # deterministic second gate: allowlists, adaptive bands, invalidation matrix
│   │       ├── policy/compiler.ts                   # intent → AuthorizedIntent (clamp-only) + authorityHash
│   │       ├── underwriter/plans.ts                 # counterfactual ladder + cost-to-safety + premium curve (pure)
│   │       ├── underwriter/llm.ts                   # optional LLM triage (validated, labeled)
│   │       ├── workflow/compile.ts                  # AuthorizedIntent → direct payload + standing workflow JSON
│   │       ├── receipts/verify.ts                   # status mapping + dual verification
│   │       ├── proof/poaa.ts                        # Proof of Authorized Agency — 11-check verifier + exportable bundle
│   │       ├── desk/reputation.ts                   # execution reputation derived ONLY from audit/executions history
│   │       ├── audit/log.ts                         # append-only JSONL audit trail
│   │       ├── guardian.ts    # orchestrator: scan → underwrite → grant → approve → dry → execute → verify
│   │       └── index.ts
│   ├── agent/                 # @bulwark/agent — MCP-driven layer (discover/validate/call/guard)
│   ├── cli/                   # @bulwark/cli — `bulwark` command over @bulwark/core (zero logic duplication)
│   └── web/                   # @bulwark/web — dashboard + public /verify page (no page scroll)
├── test/{unit,integration,e2e,failure,security,fixtures,reports}/
├── scripts/{smoke.sh,live-proof.sh,prepare-release.sh,release.sh}
├── package.json / pnpm-workspace.yaml / tsconfig.base.json / vitest.config.ts
└── README.md                  # must contain the Testing Matrix (§6.4) + quickstart + provenance legend
```

CLI and web MUST import `@bulwark/core` for all business logic (CLI/web parity rule). No logic re-implemented.

---

## 3. Chain & contract registry (verified — evidence in docs/RESEARCH_AAVE.md)

| Chain | Pool | PoolAddressesProvider | AaveProtocolDataProvider |
|---|---|---|---|
| 11155111 Sepolia | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` | `0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A` | `0x3e9708d80f7B3e43118013075F7e95CE3AB31F31` |
| 8453 Base | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D` | `0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A` |
| 1 Ethereum | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` | `0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e` | `0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD` |

Units: HF is WAD 1e18; thresholds bps 1e4; base-currency amounts 8 decimals (confirm at runtime via
`BASE_CURRENCY_UNIT()`); repay `interestRateMode` always 2; `repay` amount `type(uint256).max` = full debt of that asset.
`getUserAccountData` lives on the **Pool**, not the DataProvider.

---

## 4. Build phases (execute in order; each has acceptance criteria)

### P0 — Toolchain (done: skeleton exists)
`pnpm install` resolves workspaces; `pnpm build` compiles all packages (topological); `pnpm type-check` clean;
vitest resolves `@bulwark/*` via aliases to `src/` (tests run without a build).
**AC:** `pnpm build && pnpm type-check && pnpm test:unit` all exit 0.

### P1 — Core primitives: keccak + ABI + config + chains
- `keccak.ts`: pure-TS Keccak-256 (original padding 0x01, rate 136). Self-test vectors in unit tests:
  `keccak256("") = c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470`,
  `keccak256("abc") = 4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45`,
  selectors `balanceOf(address)=0x70a08231`, `transfer(address,uint256)=0xa9059cbb`, `approve(address,uint256)=0x095ea7b3`.
- `abi.ts`: encode/decode for the verified set — `getUserAccountData(address)` (6×uint256 out),
  `getReserveTokensAddresses(address)` (3×address out), `balanceOf(address)`, `decimals()`,
  `getPriceOracle()`, `getAssetPrice(address)`; ABI JSON fragments for `repay/withdraw/supply` (passed to KeeperHub).
- `config.ts` + `.env.example` (already drafted): `KEEPERHUB_API_KEY`, `KEEPERHUB_API_BASE`,
  `BULWARK_CHAIN_ID`, `BULWARK_POLICY_MAX_USD_PER_ACTION`, `BULWARK_POLICY_HF_CRITICAL=1.2`,
  `BULWARK_POLICY_HF_TARGET=2.0`, `BULWARK_LLM_*` (optional), `BULWARK_STORE_DIR`, `BULWARK_WEB_PORT`,
  `BULWARK_AUTO_APPROVE` (demo-only, prints a loud warning), `BULWARK_RPC_URL_{SEPOLIA,BASE,ETHEREUM}` overrides.
**AC:** unit tests for keccak/abi vectors pass; config defaults documented; unknown chain → typed error.

### P2 — KeeperHub REST client (`@bulwark/core/keeperhub`)
Implement exactly the verified surfaces (see RESEARCH_KEEPERHUB.md §1): `GET /api/chains` (public),
`GET /api/keys`, `GET /api/analytics/spend-cap`, `POST /api/execute/contract-call`,
`POST /api/execute/check-and-execute`, `POST /api/execute/transfer`, `GET /api/execute/{id}/status`,
workflow CRUD (`GET/POST/PATCH/DELETE /api/workflows…`, `POST /api/workflows/{id}/execute`),
execution history/status/logs/wait, `POST /api/executions/{id}/cancel`, marketplace call endpoint.
Requirements: `Authorization: Bearer kh_…` (never logged — redact in errors), `Idempotency-Key` support,
429 + `Retry-After` handling, error envelope `{error,detail,hint?,docs?,request_id}` → typed `KeeperHubApiError`,
timeout + AbortController, terminality via `X-Poll-Interval-Hint`.
**AC:** every client method has a unit test against a fixture transport asserting the exact request shape
(method, path, headers, body fields) matches RESEARCH_KEEPERHUB.md, and response parsing for the documented shapes.

### P3 — Aave reader (`aave/reader.ts`)
Position truth pipeline (all view calls; zero dependencies):
1. If key present: KeeperHub read via `POST /api/execute/contract-call` (view → instant `{result}`); parse
   defensively; label `KEEPERHUB FACT`; on parse failure → fall through, never crash.
2. Direct public-RPC `eth_call` fallback (labeled `public-rpc`): `getUserAccountData`,
   `getReserveTokensAddresses`, `balanceOf` on variableDebtToken, `decimals`, `getPriceOracle`→`getAssetPrice`.
3. Output `PositionSnapshot` with per-field `source` tags + raw bigint values + human units.
**AC:** unit tests with fixture RPC responses (labeled fixtures); unknown/malformed data → `UNAVAILABLE` fields,
never invented numbers.

### P4 — RescueGrant model + store (`grants/`)
Fields per ORIGINALITY_UPGRADE.md §8 — identity/policy hashes; parties; position; authority
(`allowedActions`, `capitalCapUsd`, `perActionCapUsd`, `dailyCapUsd`, `adaptiveBands[{hfMin,hfExcl,maxCapitalUsd}]`,
`hfFloor`); conditions (`hfTriggerBelow`, `recoveryHf`, `maxDebtChangePct`, `priceBandPct`, `expiresAt`);
premium terms; `creationSnapshot {hf, debtUsd, priceUsd, debtTokenBalance}`; `capacityReservedUsd`.
Canonical JSON (sorted keys) → SHA-256 → `bg_…` id. Lifecycle:
`proposed → approved → armed → dry_run → submitted → mined → verified → settled` plus
`invalidated(reason: recovered|debt-drift|price-band|exercised), policy_rejected, simulation_reverted,
expired, revoked, failed`. Transition function rejects illegal jumps. Atomic JSON store (`store/grants.json`,
tmp+rename) + `store/executions.json` + `store/capacity.json` (reserved vs available; available MUST be ≤ real
desk-wallet balance read on-chain — never asserted without a read) + append-only `store/audit.jsonl`.
**AC:** unit tests: id stability, lifecycle legality, invalidation state entry, store atomicity, audit append.

### P5 — Policy engine (`policy/engine.ts`, pure functions)
Validates grants AND execution plans BEFORE any KeeperHub call: chain/asset/action allowlists,
`amountUsd ≤ capitalCapUsd ≤ perActionCapUsd ≤ BULWARK_POLICY_MAX_USD_PER_ACTION` sanity, **adaptive band
resolution** (live HF → band cap; bands sourced from policy/grant config, never hardcoded magic), HF band sanity
(1 < trigger ≤ hfCritical < target; `hfFloor` suspends auto-rescue → human escalation), expiry, **state-bound
invalidation matrix** (recovered: HF ≥ recoveryHf · debt drift > maxDebtChangePct vs creationSnapshot ·
price outside ±priceBandPct · already exercised/submitted), duplicate-execution refusal, capacity availability
≤ real wallet balance, address format checks. Output `{ok, reasons[]}` — every rejection explains itself.
**AC:** exhaustive unit tests (the §6 matrix lists them); hostile inputs rejected; every invalidation reason reachable.

### P6 — Underwriter (`underwriter/plans.ts`, pure + `llm.ts`, optional)
Deterministic math (all inputs = chain facts from P3):
- **Counterfactual ladder**: candidate repay amounts (0 / 25% / 50% / 100% of the band cap and of cost-to-safety)
  → projected HF each `(C·LT)/(D−R)` + liquidation-risk delta — shown to the owner and reused by PoAA check 8.
- repay plan: `R = D − C·LT/T` (clamp [0, D]) → resulting HF; collateral top-up plan: `X = D·T/LT − C` → resulting HF.
- feasibility vs policy cap; choose cheapest feasible plan; **Bulwark premium curve** (documented formula):
  `premium = premiumBase + urgency × capital × premiumRate`, `urgency = clamp(1/(HF−1), 0, 10)` — printed with the
  quote, labeled `BOOKKEEPING` until settled through a real marketplace listing.
- `llm.ts`: OpenAI-compatible chat completion; input = snapshot + **feasible plan set only**; output parsed as
  `{choice, narrative}`; choice must be one of the provided plans else fallback deterministic; narrative labeled
  `AGENT OUTPUT`. LLM failure/timeouts → deterministic mode. LLM can never resize, re-asset, or exceed bounds.
**AC:** property tests: for any snapshot, chosen plan is feasible & cheapest-or-LLM-selected-but-in-set; ladder
monotonicity (more repay ⇒ higher projected HF until debt exhausted); hostile narratives cannot mutate bounds.

### P7 — Policy Compiler (`policy/compiler.ts`) + payload compiler (`workflow/compile.ts`)
**Policy compiler** (deterministic, hash-stable — identical inputs ⇒ identical output hash):
intent → (1) allowlist check (violation ⇒ REJECT, never clamp) → (2) resolve adaptive band from live HF →
(3) `effectiveCap = min(policy.maxUsdPerAction, capitalCapUsd, perActionCapUsd, dailyRemaining, bandCap,
capacityAvailable)` → (4) `authorizedAmountUsd = min(intent.amountUsd, effectiveCap)` — **clamp-only, raising
is structurally impossible** → (5) invalidation gate → (6) USD→wei via live price + decimals; repay-max
semantics (`type(uint256).max`) only when authorizedAmount ≥ full asset debt AND ≤ capitalCap.
Output `AuthorizedIntent {authorizedAmountUsd, amountWei, repayMax?, grantId, authorityHash, validUntil, checks[]}`.
The agent intent hash is recorded before compilation; `authorityHash` binds grant + policy + compiled bounds
into every execution request and every PoAA check.

**Payload compiler** — from the AuthorizedIntent:
1. **Direct execution payload** (primary path): exact body for `POST /api/execute/contract-call`
   (`contractAddress=Pool`, `functionName="repay"`, `functionArgs` JSON-string `[asset, amountWei, 2, owner]`,
   `abi` JSON-string fragment, optional `gasLimitMultiplier`) — all verified fields.
2. **Standing workflow** (persistent artifact, marketplace-ready): verified node schema — Manual trigger node +
   `web3/write-contract` action node, `network` as string chain id, edges array; `validate_workflow` via MCP before
   creation when key present. Documented staleness policy: standing order uses cap-frozen args; per-event bounded
   execution always goes through the direct path (fresh snapshot + policy compiler).
3. **Watchtower workflow** (§5.3): Schedule trigger + contract read + Condition (`sourceHandle:"true"/"false"`) +
   webhook action back to the desk — built at runtime from MCP-discovered schemas (`list_action_schemas`); marked
   PARTIAL until validated live.
**AC:** compiler property tests (never raises, deterministic hash, REJECT vs CLAMP distinction); payload/workflow
outputs snapshot-tested against verified shapes; no invented fields.

### P8 — Guardian orchestrator (`guardian.ts`) + receipts + PoAA (`proof/poaa.ts`) + reputation (`desk/reputation.ts`)
- `tick()`: scan watchlist → for positions below target: underwrite (counterfactual ladder) → propose grant →
  (owner approves) → on approval reserve capacity (≤ real wallet balance) → agent intent (hash recorded) →
  policy compiler (AuthorizedIntent) → dry-run (`simulate:true` — contract-call/transfer ONLY) → execute with
  `Idempotency-Key` → poll status (`X-Poll-Interval-Hint`) → receipts. Invalidation checks run every tick on
  ARMED grants; `hfFloor` breach → suspend + escalate.
- Receipts: map statuses (`pending/running/unconfirmed/success/error/system_error/cancelled`;
  direct route `completed/failed/unconfirmed`) fail-closed; dual verification: KeeperHub `receipts[].verified`
  (KEEPERHUB FACT) + independent `eth_getTransactionReceipt` via public RPC (if RPC down →
  `independent:unavailable`, never asserted).
- **Proof of Authorized Agency** (ORIGINALITY_UPGRADE.md §10): exportable bundle
  `{grant, creationSnapshot, intent(+hash), authorizedIntent(+authorityHash), execution, receipts, snapshots before/after}`
  and the 11-check verifier: grant hash · owner approval · policy hash · intent unchanged · within grant bounds ·
  within policy bounds (+simulate-first evidence) · not expired/invalidated · state conditions satisfied ·
  KeeperHub execution verified · independent receipt verified · Aave state change verified (post-HF > pre-HF).
  Verdict `PROVEN` / `BROKEN(check n)`. `bulwark proof export|verify` + web `/verify`.
- **Execution reputation** (`desk/reputation.ts`): derived ONLY from the audit/executions store — grants issued,
  verified executions, simulation failures, policy violations, capital deployed, latency (propose→verified),
  HF improvement distribution. No points, no tokens.
**AC:** fixture e2e covers the full state machine incl. invalidation, duplicate/refuse, hfFloor-suspend paths;
PoAA verifier returns BROKEN(n) for each tampered dimension; live e2e skips without key.

### P9 — CLI (`@bulwark/cli`, bin `bulwark`, `node:util parseArgs`, zero logic of its own)
Commands (all must work and print provenance labels): `doctor` (key presence masked, chains, spend-cap, MCP ping,
RPC ping, store status) · `positions scan [--chain --address]` · `grants propose/list/show/approve/revoke` ·
`grants dry <id>` · `grants execute <id>` · `workflow compile <id> [--out]` · `desk tick [--once]` ·
`proof export <grantId>` · `proof verify <file>` · `audit export` · `keys check`.
**AC:** every command has a test (fixture transport for network paths + real filesystem for store); `--help` for all.

### P10 — Agent (`@bulwark/agent`, bin `bulwark-agent`) — the MCP surface
Minimal streamable-HTTP MCP client (JSON-RPC over POST; Accept `application/json, text/event-stream`;
`Mcp-Session-Id` handling; SSE `data:` line parsing): endpoints `https://app.keeperhub.com/mcp` (Bearer key) and
`/mcp/public` (anonymous). Commands: `discover` (initialize → tools/list → persist `store/mcp-inventory.json` —
real capability-discovery evidence) · `validate <workflow.json>` (`validate_workflow`) · `call <tool> '<json>'`
(authenticated tools require key; anonymous set verified) · `guard [--interval]` (guardian loop via core).
**AC:** `discover` works against the public endpoint in CI (skip with explicit reason if network absent);
inventory saved is real output, never fabricated.

### P11 — Web dashboard (`@bulwark/web`)
Node http server (no framework) + static assets. Panels: Positions (live HF, provenance chips), Grants (lifecycle
states + approve/revoke buttons wired to core), Executions (state machine timeline + receipts + tx links to real
explorers), Audit (JSONL tail). **No overall page scroll**; panels scroll internally; premium dark ops-console
aesthetic; every value carries its provenance label; without a key, execution panels show `UNAVAILABLE`.
**Public `/verify` page** (PoAA — the flagship differentiator): paste/upload a Proof of Authorized Agency bundle →
server runs the 11-check chain (§4 P8) → verdict `PROVEN` / `BROKEN(check n)` with per-check detail and evidence
links. No login, no trust in the desk required.
API routes: `GET /api/state`, `POST /api/tick`, `POST /api/grants/:id/approve|revoke|dry|execute`, `POST /api/proof/verify`.
**AC:** server routes tested; UI renders zero-mock states; secrets never reach the browser.

### P12 — Docs + release engineering
- `README.md`: what/why, 90-second architecture diagram, quickstart (clone→env→run→test→proof), provenance legend,
  **Testing Matrix (§6.4)**, honesty disclosures, contact.
- `docs/INTEGRATION_FEEDBACK.md` (master prompt §54: executive summary, setup, dry run, execution, edge cases,
  confusing/missing/broken with EXPECTED/ACTUAL/REPRODUCTION, hard-to-test, recommendations — every statement
  tagged DOCUMENTATION/OBSERVATION/REPRODUCED/INFERENCE).
- `docs/QUALIFICATION_TRACEABILITY.md`: rubric row → mechanism → evidence path → demo step.
- `scripts/live-proof.sh`: one command → full real cycle with key (doctor → scan → propose → approve → dry →
  execute → poll → verify → proof export); prints the final **transaction link** (required by submission).
- **GitHub Releases for SDK + CLI** (`scripts/prepare-release.sh` + `release.sh`): `pnpm pack` artifacts for
  `@bulwark/core` (SDK) and `@bulwark/cli`, SHA-256 checksums file, semver + CHANGELOG.md generated from commits,
  release notes template (features, verified surfaces, install from release asset, integrity instructions);
  `gh release create vX.Y.Z artifacts… --notes-file …` against the user's GitHub remote (tag `sdk-vX.Y.Z` /
  `cli-vX.Y.Z`). Release MUST NOT be cut until the pre-submission gate (§8) passes.

### P13 — Demo + submission (DoraHacks compliance)
- **90-second demo video** (mechanism-first, script in README): problem (0-10s) → live Aave Sepolia position at
  HF 1.18 (10-20s) → underwriter counterfactual ladder + premium quote (20-30s) → RescueGrant shown: adaptive
  band table, expiry, assumptions (30-40s) → owner approves; agent asks $22, POLICY COMPILER clamps to band cap
  $15 on screen (40-50s) → dry run simulate → execute with Idempotency-Key (50-60s) → KeeperHub receipts verified
  + independent RPC check → tx link (60-70s) → post-HF chain read: 1.18 → 2.03 (70-78s) → /verify: PoAA 11/11
  PROVEN (78-85s) → "Agents propose. Policy compiles. KeeperHub executes. Anyone can prove it." (85-90s).
- **Submission answers** (required fields): project integrated = Aave V3 (live: $17.4B TVL, Sepolia testnet market +
  Base); what it does; KeeperHub surfaces used (REST direct execution + receipts, workflow CRUD, MCP discovery/
  validation, marketplace-ready compile, Turnkey signing, nonce/gas/retry, private mempool on Sepolia); network =
  Sepolia testnet (Base documented as mainnet path); broken/unfinished = watchtower workflow PARTIAL, premium
  settlement BOOKKEEPING unless marketplace-settled; contact = team email/Discord.
- **Tags coverage** (Blockchain, AI, Web3, AI Agents, DeFi, Agents, Autonomous, web3 ecosystem, KeeperHub, MCP):
  README + BUIDL page must address each in one line.
- **Bounty track (separate BUIDL)**: a scoped PR to `KeeperHub/keeperhub` (branch → `staging`, Conventional Commits,
  issue-first rule respected): candidate = docs/UX fix for the VERIFIED footgun "`simulate` is ignored by
  `execute_protocol_action`/`/api/execute/node` (silent real broadcast)" — a warning + docs contribution, mergeable,
  no behavior change needed; follow CONTRIBUTING.md (accepted-issue flow if behavior change).

---

## 5. Originality boosters (implement ALL — this is how we beat LIFELINE-class entries)

Full spec: [`docs/ORIGINALITY_UPGRADE.md`](./ORIGINALITY_UPGRADE.md).

1. **Adaptive Rescue Authority** — the grant's capital ceiling resolves from live HF bands ("authority that
   changes with independently verified state"), not a flat cap.
2. **Policy Compiler** — agents generate intent; the compiler deterministically clamps it into Authorized
   Intent (`authorityHash`-bound); KeeperHub executes authority. Raising a limit is structurally impossible.
3. **State-bound invalidation** — grants die when the world that justified them changes (recovered HF, debt
   drift, price out of band, expiry, already exercised).
4. **Proof of Authorized Agency + public /verify** — the 11-check chain proving "did the agent exercise exactly
   the authority it was given"; anyone can verify without trusting the desk.
5. **Counterfactual ladder** — projected HF per candidate amount from real chain state, making
   AGENT OPTIMIZES / POLICY CONSTRAINS / KEEPERHUB EXECUTES visible on screen.
6. **Capacity-backed rescuing + execution reputation** — reserved capacity ≤ real on-chain desk balance
   ("able to rescue", not just "willing"); reputation derived only from verified history.
7. **Standing watchtower compiled into KeeperHub** — monitoring lives as a real KeeperHub Schedule + read +
   Condition + webhook workflow (agent-authored workflows surface); the agent only underwrites.
8. **Dual-source truth** — every fact cross-checkable: KeeperHub receipts AND independent public-RPC lookup;
   position data source-labeled (`keeperhub` vs `public-rpc`).
9. **Multi-role desk** — underwriter (agent) / policy compiler (deterministic) / executor (KeeperHub+Turnkey) /
   auditor (independent verifier) with separate authorities.

---

## 6. TESTING (mandatory — "all the API, all parts of the application")

### 6.1 Unit (`test/unit/`) — every pure layer, no network
`keccak.test.ts` (vectors above) · `abi.test.ts` (encode/decode each verified signature; malformed data) ·
`config.test.ts` (defaults, overrides, bad values) · `policy.test.ts` (allowlists; cap ≤ policy max; HF band sanity;
expiry; duplicate refusal; hostile addresses/assets; every rejection reason) · `plans.test.ts` (repay/top-up math
against hand-computed cases; infeasible → rejected; cheapest selection; premium curve monotonicity) ·
`grant.test.ts` (canonical hashing; lifecycle legality; field validation) · `compiler.test.ts` (policy
compiler: clamp-only — an intent above the band cap is clamped, never raised; REJECT vs CLAMP distinction;
adaptive band resolution; invalidation matrix — every reason reachable; hash-stability — identical inputs ⇒
identical `authorityHash`; intent hash recorded before compilation) · `poaa.test.ts` (all 11 checks pass on a
golden bundle; each check fails individually when its dimension is tampered: mutated intent, altered amount,
expired grant, missing approval, broken receipt, HF not improved) · `capacity.test.ts` (reservation ≤ real
balance; double-reserve refused; release on invalidation) · `reputation.test.ts` (derived strictly from audit
records; empty history ⇒ empty reputation) · `compile.test.ts` (payload/workflow shapes vs verified
fields; string-typed network; JSON-string abi/args; `type(uint256).max` only when debt ≤ cap) ·
`store.test.ts` (atomicity, audit append) · `receipts.test.ts` (status mapping incl. fail-closed `not_found`/
`timeout`) · `proof.test.ts` (bundle hash re-computation; tamper ⇒ invalid).

### 6.2 Client tests (`test/unit/client/`) — EVERY `@bulwark/core` client method
One test per method: request shape (method/path/headers/body), response parsing, error envelope mapping, 429 +
Retry-After, idempotency header propagation, Authorization redaction in thrown errors. Fixture transport is clearly
labeled `FIXTURE` (never presented as live).

### 6.3 Integration / e2e (`test/integration/`, `test/e2e/`)
- `keeperhub.live.test.ts` — runs ONLY with `KEEPERHUB_API_KEY`: keys check, chains, spend-cap, Sepolia simulate
  (`simulate:true` on contract-call), optional real bounded execution on the funded wallet; otherwise SKIP with
  reason `KEEPERHUB_API_KEY not set` (never pass silently).
- `mcp.live.test.ts` — public MCP endpoint: initialize → tools/list → persist inventory; network-absent ⇒ SKIP with reason.
- `guardian.e2e.test.ts` — full state machine on fixture transports: propose → approve → dry → execute → mined →
  verified, plus policy-reject, simulation-revert, duplicate-refuse, retry-exhausted, expiry branches.
- `guardian.live.e2e.test.ts` — key-gated real cycle (mirrors `scripts/live-proof.sh`).

### 6.4 README Testing Matrix (REQUIRED)
README must contain a table mapping **every API surface → test file → status (passing/live-skipped)**, e.g.:

| Surface | Test | Type | Status |
|---|---|---|---|
| `POST /api/execute/contract-call` | `test/unit/client/contract-call.test.ts` (+ `integration/keeperhub.live.test.ts`) | fixture + live | passing / live-skipped |
| …one row per client method, CLI command, MCP tool used, web route… | | | |

Plus: exact commands (`pnpm test`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`,
`pnpm test:security`), how to enable live tests (env), and links to `test/reports/` evidence
(vitest output saved by `scripts/smoke.sh` → `test/reports/last-run.txt`; do not commit secrets).

### 6.5 Security & failure (`test/security/`, `test/failure/`)
Authorization header redaction · grant tampering (re-hash mismatch) ⇒ reject · **compiler-raise attack**:
intent above cap ⇒ clamped/rejected, never honored · execution without matching `authorityHash` ⇒ refused ·
self-authorization: agent identity cannot approve its own grant · LLM prompt-injection cannot change
plan/bounds · replay: same grant executed twice ⇒ policy refusal + idempotency conflict path · arbitrary
recipient/asset/chain injection ⇒ allowlist rejection · store corruption ⇒ typed errors (no silent resets) ·
simulate-revert propagation · `simulate`-ignored footgun guard (client refuses `simulate` on protocol-action paths).

---

## 7. Pre-submission gate (run before ANY release/submission)

- [ ] `pnpm build && pnpm type-check && pnpm test` green; live tests skipped with printed reasons only
- [ ] Zero-mock audit: grep for hardcoded tx hashes/balances = 0; every UI value has a provenance label
- [ ] PoAA: the live rescue's bundle shows **PROVEN (11/11)** on the public /verify page
- [ ] Live proof executed once with a funded key: transaction link captured in README + BUIDL page
- [ ] Demo video recorded (90s script) · Source repo public · README complete (Testing Matrix, provenance legend,
      honesty disclosures, tags coverage, contact)
- [ ] `docs/INTEGRATION_FEEDBACK.md` + `docs/QUALIFICATION_TRACEABILITY.md` complete
- [ ] GitHub Releases cut for SDK + CLI (§4 P12) with checksums
- [ ] Bounty PR opened (separate BUIDL)

## 8. Timeline (deadline 2026-09-18 15:30)

D-4: P0–P8 core+agent+cli · D-3: P9–P11 CLI/web/tests green · D-2: live proof + demo video + feedback docs ·
D-1: releases + bounty PR + submission forms · D-0: buffer. Do not compress the live-proof buffer — it needs a
funded test wallet and real confirmation time.

---

## Appendix A — P0 scaffold (exact file contents)

If the workspace root does not already contain these files (i.e., you were handed **only this `docs/` folder**),
create them exactly as below before starting P0. If they exist, verify they match; fix only real mismatches.
Workspace layout rule: this `docs/` folder sits at the workspace root (`<root>/docs/BUILD.md`), packages under
`<root>/packages/`, tests under `<root>/test/`.

### `package.json`

```json
{
  "name": "bulwark",
  "version": "0.1.0",
  "private": true,
  "description": "BULWARK — the agent backstop economy for live Aave positions, executed deterministically by KeeperHub.",
  "license": "MIT",
  "packageManager": "pnpm@11.3.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "pnpm -r --filter './packages/*' build",
    "type-check": "pnpm -r --filter './packages/*' type-check",
    "test": "vitest run --config vitest.config.ts",
    "test:unit": "vitest run --config vitest.config.ts test/unit",
    "test:integration": "vitest run --config vitest.config.ts test/integration",
    "test:e2e": "vitest run --config vitest.config.ts test/e2e",
    "test:failure": "vitest run --config vitest.config.ts test/failure",
    "test:security": "vitest run --config vitest.config.ts test/security",
    "smoke": "bash scripts/smoke.sh",
    "cli": "node packages/cli/dist/index.js",
    "agent": "node packages/agent/dist/index.js",
    "web": "node packages/web/dist/server.js"
  }
}
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "composite": false
  }
}
```

### `vitest.config.ts` (aliases let tests import workspace source without a prior build)

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@bulwark/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@bulwark/agent": fileURLToPath(new URL("./packages/agent/src/index.ts", import.meta.url)),
      "@bulwark/cli": fileURLToPath(new URL("./packages/cli/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    env: {
      // Tests that require a live KeeperHub key read it from the process env
      // or a local .env; without a key they MUST report as skipped, never pass.
      BULWARK_TEST_DIR: "test",
    },
  },
});
```

### `.env.example`

```bash
# ── KeeperHub (REQUIRED for any real execution) ──────────────────────────────
# Org API key from the KeeperHub app: Settings → Developer → API keys → Organisation keys
# NEVER commit the real value. BULWARK reads this from the environment only.
KEEPERHUB_API_KEY=kh_replace_me
KEEPERHUB_API_BASE=https://app.keeperhub.com

# ── Guardian agent LLM (OPTIONAL — without it the underwriter runs in
#    deterministic mode; any OpenAI-compatible endpoint works)
BULWARK_LLM_BASE_URL=https://api.openai.com/v1
BULWARK_LLM_API_KEY=
BULWARK_LLM_MODEL=gpt-4o-mini

# ── Chain selection: 11155111 = Sepolia (Aave V3 testnet market) | 8453 = Base ──
BULWARK_CHAIN_ID=11155111
# Optional public-RPC overrides for the independent verification path
# BULWARK_RPC_URL_SEPOLIA=https://ethereum-sepolia-rpc.publicnode.com
# BULWARK_RPC_URL_BASE=https://mainnet.base.org

# ── Policy (deterministic bounds; the LLM can NEVER exceed these) ───────────
BULWARK_POLICY_MAX_USD_PER_ACTION=25
BULWARK_POLICY_HF_CRITICAL=1.2
BULWARK_POLICY_HF_TARGET=2.0

# ── Desk ─────────────────────────────────────────────────────────────────────
BULWARK_STORE_DIR=.bulwark
BULWARK_WEB_PORT=4567
# DEMO-ONLY: auto-approve proposed grants without a human action. Prints a loud warning.
# BULWARK_AUTO_APPROVE=1
```

### `.gitignore`

```
node_modules/
dist/
*.tsbuildinfo
.env
.env.local
.bulwark/
test/reports/*.json
test/reports/*.log
!test/reports/.gitkeep
coverage/
.DS_Store
*.pem
*.key
```

### Workspace packages (`packages/*/package.json` pattern)

Each package: `"name": "@bulwark/<name>"`, `"type": "module"`, `"main": "dist/index.js"`,
`"scripts": { "build": "tsc -p tsconfig.json", "type-check": "tsc -p tsconfig.json --noEmit" }`,
extending `tsconfig.base.json` with `"outDir": "dist", "rootDir": "src"`. `@bulwark/cli` and `@bulwark/agent`
depend on `"@bulwark/core": "workspace:*"` and declare `"bin"`. `@bulwark/core` has **zero runtime dependencies**
(hand-rolled keccak/ABI/encoding; `node:` builtins only). ESM imports inside packages use explicit `.js` extensions
(NodeNext).
