# BULWARK Pre-Submission Test Report

**Audit date:** 2026-09-15 (Asia/Kolkata)  
**Repository:** `/home/rohan/Desktop/Keeperhub`  
**Commit tested:** `0daacaa8bba08cfb66253e0f2152fbc2830fcf6d` (`main`)  
**Scope:** Read-only application, integration, browser, security, submission, and on-chain verification. No application code or configuration was changed. No transaction was broadcast.

## Executive verdict

**NOT READY FOR SUBMISSION.**

The core idea is demonstrably viable: the repository builds, strict type-checking passes, all 1,300 fixture/unit assertions pass, KeeperHub authentication and MCP discovery work, a fresh `simulate:true` Aave repayment succeeds, and the previously submitted 5 USDC Base Sepolia rescue is a genuine KeeperHub-sponsored Aave V3 repayment.

However, the deployed application currently has critical authorization and proof-integrity defects, broken live data reads, two broken primary UI pages, a non-working proof-export path, inaccurate submission claims, an anonymously inaccessible GitHub repository, and no final demo-video URL. These issues should be addressed before judging.

## Test summary

| Area | Result | Evidence |
|---|---:|---|
| Clean-clone dependency install | PASS with workaround | Frozen lockfile installed with pnpm 11.3.0 through `npm exec`. The host's older Corepack launcher crashes under Node 24. |
| Workspace build | PASS | All four packages compiled. |
| Strict TypeScript check | PASS | Core, CLI, agent, and web returned zero type errors. |
| Full automated suite | PASS | 35/35 files and 1,300/1,300 assertions passed in 11.32 seconds. |
| Tests with real KeeperHub credential | **FAIL** | 4 passed and 2 failed across the live KeeperHub, MCP, and Guardian suites. |
| Fresh safe live cycle | PASS through dry-run | Real Base Sepolia borrower: propose -> approve -> KeeperHub simulation; `wouldRevert:false`, gas estimate 163,410. No broadcast. |
| Authenticated KeeperHub MCP | PARTIAL | Initialization succeeded and 44 tools were discovered; workflow validation returned an MCP input-validation error. |
| Hosted route availability | PASS | `/`, `/overview`, `/positions`, `/grants`, `/executions`, `/audit`, `/verify`, `/settings`, and `/docs` returned HTTP 200. |
| Hosted browser behavior | **FAIL** | `/overview` throws a reference error; `/executions` has a JavaScript syntax error. |
| On-chain proof transaction | PASS | Independent Base Sepolia transaction, receipt, logs, and call trace confirm the Aave repayment. |
| Dependency audit | WARN | Two moderate development dependency advisories in Vitest / `@vitest/mocker`. |
| Shell scripts | PASS syntax | All scripts pass `bash -n`; ShellCheck reports two unused variables and one glob warning in `prepare-release.sh`. |
| Repository cleanliness before report | PASS | Original worktree had zero tracked changes and zero untracked files before this report was added. |

## Critical findings

### C1. Public unauthenticated endpoints can reach value-moving execution with the production KeeperHub key

The deployed `/api/health` reports `hasKey:true`. The server exposes `POST /api/tick`, grant proposal, approval, dry-run, execution, and revocation without any authentication or authorization middleware. It also sends `Access-Control-Allow-Origin: *`. An unauthenticated request to a nonexistent execution ID reached the execution handler and returned `Grant does_not_exist not found`, proving that the public request was accepted through routing rather than rejected at an auth boundary.

The hosted seeded state contains armed grants. Consequently, an arbitrary internet user may be able to invoke an eligible armed grant and spend funds through the server-side KeeperHub key. This was not exploited during testing.

Evidence:

- `packages/web/src/server.ts:72-88` — wildcard CORS.
- `packages/web/src/server.ts:267-270` — unauthenticated tick.
- `packages/web/src/server.ts:337-368` — unauthenticated proposal.
- `packages/web/src/server.ts:438-466` — unauthenticated approve/dry/execute/revoke dispatch.
- `packages/core/src/guardian.ts:186-202` — approval defaults `approvedBy` to the owner address without proving caller identity.

**Required before submission:** Disable or protect all mutating hosted endpoints immediately. Do not leave an active KeeperHub credential behind an unauthenticated execution API. Require authenticated operator access and cryptographic owner authorization for approval.

### C2. “Owner EIP-712 approval” is not implemented

The UI and documentation repeatedly claim an EIP-712 owner signature. No signature field, typed-data verification, nonce verification, signer recovery, or wallet-signing approval flow exists. `approveGrant()` simply uses the grant owner's address as `approvedBy` when no caller is supplied. The public API supplies no approver at all, so the server self-asserts that the owner approved.

The PoAA approval check verifies only that an address string equals the owner string and that a timestamp exists. It does not verify a signature.

Evidence:

- `packages/core/src/grants/grant.ts:61-65` — approval contains only timestamp/address fields.
- `packages/core/src/guardian.ts:197-202` — server-assigned approval.
- `packages/core/src/proof/poaa.ts:70-84` — string/timestamp-only approval check.
- `public/overview.html:85`, `public/grants.html:101`, and `public/grants.html:213` — EIP-712/signature claims.

### C3. PoAA accepts fabricated transaction evidence as `PROVEN 11/11`

The verifier does not independently query KeeperHub or an RPC. It trusts receipt flags, block numbers, transaction hashes, and before/after snapshots contained in the uploaded JSON.

Reproduction performed against the hosted verifier:

1. Download the hosted latest proof.
2. Replace the execution and receipt transaction hashes with a nonexistent `0xbbbb...bbbb` hash.
3. Replace the block number and gas used with `1`.
4. Submit the altered bundle to `/api/proof/verify`.
5. Result: `PROVEN`, 11/11 passed, including “Transaction Receipt Verified.”

The verifier also never recomputes `authorityHash`. Check 6 only compares two attacker-controlled strings. Check 10 is an OR across attacker-controlled Boolean flags. Check 11 trusts attacker-controlled snapshots and accepts unchanged debt because it uses `<=` rather than proving a debt delta tied to the executed amount.

Evidence:

- `packages/core/src/proof/poaa.ts:139-143` — no authority-hash recomputation.
- `packages/core/src/proof/poaa.ts:195-216` — trusted receipt flags.
- `packages/core/src/proof/poaa.ts:228-231` — uploaded snapshot-only state check.
- `packages/core/src/receipts/verify.ts:128` — “dual” verification still succeeds when independent RPC is unavailable.

**Required before submission:** Either implement genuine online verification or rename/reframe PoAA as an offline consistency report. Bind and recompute every hash, verify the real KeeperHub execution ID and transaction receipt, verify chain ID/to/calldata/internal call, and derive state changes from chain data.

### C4. Three Aave ABI selectors are incorrect, breaking the live truth pipeline

The following hard-coded selectors do not match Keccak-256 of their documented signatures:

| Function | In code | Correct selector |
|---|---|---|
| `getReserveTokensAddresses(address)` | `0x3e18525b` | `0xd2493b6c` |
| `getPriceOracle()` | `0x0952d7dd` | `0xfca513a8` |
| `getAssetPrice(address)` | `0xb3ab73ab` | `0xb3596f07` |

The wrong calls revert against the current official Aave Base Sepolia contracts. The reader then silently reports reserve tokens, debt-token balance, and price as unavailable, while substituting an exact `$1.00` fallback price.

Observed current position values:

- Application reader: variable USDC debt `0`, price `$1.00`, both sources `UNAVAILABLE`.
- Correct live calls: variable USDC debt approximately `25,045.833129`, USDC price approximately `$0.99986613`.
- Account-level Aave debt and HF do still read because `getUserAccountData(address)` is correct.

Evidence:

- `packages/core/src/abi.ts:35-42` — incorrect selectors.
- `packages/core/src/aave/reader.ts:221-275` — unavailable debt balance and invented $1 fallback.

### C5. Deployed desk capacity is fabricated rather than on-chain verified

The store initializes or replaces a zero desk balance with `$50,000`, including on Vercel. The hosted API currently publishes this value as underwriting capacity. No chain balance read occurs in this path.

This directly contradicts claims such as “fake balances: 0,” “never invented,” and “real on-chain balance assertion.” It also makes policy capacity checks depend on an unverified number.

Evidence:

- `packages/core/src/grants/store.ts:109-130` — hard-coded/default $50,000.
- `packages/core/src/grants/store.ts:212-217` — Vercel fallback.
- `docs/BUILD_REPORT.md:59-64` — contradictory zero-fake-balance claim.

## High-severity findings

### H1. Two major hosted pages are broken

- `/executions`: `public/executions.js:52-104` is missing the `.map((e) => {` expression before its callback body. Chrome reports `Uncaught SyntaxError: Unexpected token ')'`. The execution table and controls never initialize.
- `/overview`: `public/app.js:167-206` references `latest` without defining it. Chrome repeatedly reports `ReferenceError: latest is not defined`, preventing the execution section from rendering.
- Global “Trigger Tick”: `public/shared.js:482-487` uses `data` without reading `await res.json()`. The POST happens and then the UI reports failure.

These defects are absent from the current automated browser tests because those tests check HTTP/static content and mocked API handlers, not execution of the shipped browser JavaScript.

### H2. The CLI proof export and advertised live-proof script cannot complete

Running:

```text
bulwark proof export bg_685e5285e4881718 --out /tmp/bulwark-cli-export.json
```

fails with `Do not know how to serialize a BigInt`.

Even after BigInt serialization is addressed, the construction is invalid: it assigns `authorityHash` as `intentHash`, omits receipts, and sets `before` and `after` to the same current snapshot. It therefore cannot produce an 11/11 proof from a real execution.

Evidence:

- `packages/cli/src/index.ts:501-535` — invalid proof construction.
- `packages/cli/src/index.ts:538` — non-BigInt-safe serialization.
- `scripts/live-proof.sh:62-64` — invokes the broken export/verify sequence.

### H3. Live tests mask outages and do not actually skip

The normal 1,300-test run passes because `.env` is not loaded by Vitest and “live” catch blocks turn any network error into a passing assertion. This contradicts the repository rule that unavailable live tests must explicitly skip.

With the real key loaded, 2 of 6 live tests fail:

- Contract-call simulation succeeds and returns `{result:{...}}`, but the test incorrectly requires `status` or `success` at the top level.
- Guardian live E2E uses the zero address on Sepolia, which has HF 999; policy correctly rejects the dry run because no rescue trigger exists.

The public MCP test similarly catches every endpoint failure and passes instead of skipping or failing.

Evidence:

- `vitest.config.ts:17-20` — claim that local `.env` is read, but no dotenv loader exists.
- `test/integration/keeperhub.live.test.ts:22-31` — network errors pass.
- `test/integration/keeperhub.live.test.ts:46-60` — incompatible response assertion.
- `test/integration/mcp.live.test.ts:10-42` — all MCP errors pass.
- `test/e2e/guardian.live.e2e.test.ts:14-30` — unusable zero-address live scenario.

### H4. MCP workflow validation is incompatible with the discovered live schema

Authenticated MCP initialization works and currently discovers 44 tools. The live `validate_workflow` tool requires `{workflowId: string, deepCheck?: boolean}`. BULWARK sends `{workflow: <object>}` instead.

KeeperHub returns an MCP tool result with `isError:true`, but `callTool()` does not convert tool-level errors into thrown errors and the CLI returns exit code 0 while labeling the response a KeeperHub fact.

Evidence:

- `packages/agent/src/index.ts:194-213` — tool result returned without checking `isError`.
- `packages/agent/src/index.ts:308-328` — wrong validation input and success exit.
- `packages/core/src/workflow/compile.ts:83-215` — schemas are hard-coded rather than built from discovered action schemas.

### H5. Submission requirements are incomplete

- Anonymous access to `https://github.com/ROHANROOSWELT/Bulwark` returns HTTP 404, even though the README marks it public and complete. The local authenticated remote is synchronized to the tested commit, but judges cannot rely on the submitter's local credentials.
- The demo URL remains `https://youtu.be/BULWARK_DEMO_VIDEO_ID_PLACEHOLDER`.
- X and Discord fields still contain alternative/placeholder wording.
- No tracked `LICENSE` file exists, despite MIT metadata and badge claims.

Evidence: `README.md:41-45`, `README.md:86-90`, and `README.md:597-611`.

## Additional correctness and reliability concerns

1. **KeeperHub view path is nonfunctional.** `AavePositionReader.callView()` discards the encoded calldata, calls `functionName:"raw_call"` with empty arguments, and only accepts a string result. Real KeeperHub read responses are structured objects. Current scans therefore use public RPC even with a valid key. See `packages/core/src/aave/reader.ts:78-100`.
2. **Verification can mark a run verified without independent RPC.** `isVerified = khVerified && (indepVerified || indepStatus === "unavailable")`. This contradicts “dual verification.” See `packages/core/src/receipts/verify.ts:128`.
3. **Execution success is not tied strongly to repayment.** Guardian marks a run verified when the receipt passes and HF happens to increase. It does not require the expected token/debt delta. See `packages/core/src/guardian.ts:457-477`.
4. **Daily budget never resets.** `dailySpentUsd` only accumulates; no day/date ledger or reset logic exists.
5. **Vercel state is ephemeral.** `/tmp/.bulwark` is seeded from fixtures on cold starts. Mutations are not durable across serverless instances or deployments, and concurrent read-modify-write calls have no locking. See `packages/core/src/grants/store.ts:67-92`.
6. **`add-collateral` payload arguments are wrong.** The compiler selects the Aave `supply` ABI but reuses repay argument order `[asset, amount, 2, owner]`; `supply` requires `[asset, amount, onBehalfOf, referralCode]`. See `packages/core/src/workflow/compile.ts:46-65`.
7. **Documentation/code mismatches:**
   - README claims `authorityHash = keccak256(...)`, but code uses SHA-256 over a different structure.
   - README lists a wrong Sepolia Pool address at line 54 (`0x6Ae43d041...` instead of `0x6Ae43d327...`).
   - README documents `ETHEREUM_SEPOLIA_RPC`, while code expects `BULWARK_RPC_URL_SEPOLIA`.
   - UI alternates between HF targets 1.50 and 2.00.
   - README contains `file:///home/rohan/...` links and references six source files that do not exist.
   - `docs/BUILD_REPORT.md` reports old totals (25 files/128 tests/4 skipped), while README reports 35/1,300/0.
8. **Repository review noise:** two unrelated landing-page template projects plus ZIP archives are tracked in the hackathon repository.
9. **Dependency warnings:** pnpm audit reports two moderate dev-only advisories, both from Vitest/@vitest/mocker versions below 4.1.11 (`GHSA-82fw-gwwq-j7x9`).

## Verified positives

1. The source tree at the tested commit builds and passes strict TypeScript checking.
2. The deterministic math, Keccak implementation, policy clamping, state machine, ABI serialization primitives, orderbook logic, failure handling, and most CLI/API behavior have broad fixture/property coverage.
3. KeeperHub organization-key authentication, key metadata, spend-cap lookup, chain listing, and authenticated/public MCP initialization work.
4. A fresh real KeeperHub simulation against the current Base Sepolia position succeeds safely:
   - `status: simulated`
   - `wouldRevert: false`
   - `simulatedReturnValue: 5000000`
   - gas estimate: `163410`
5. The historical rescue transaction is real:
   - Transaction: `0x43dbc0270f7a05608e0db944aa214e625278e1cfb898cdd6764e54deb184fa16`
   - Chain: Base Sepolia (`84532`)
   - Block: `46823633`
   - Receipt: success; gas used `180896`
   - Independent call trace: relayer -> smart wallet -> KeeperHub wallet -> Aave Pool `repay(address,uint256,uint256,address)`
   - Repayment: exactly `5,000,000` USDC base units (5 USDC) on behalf of `0xE406...8123`
   - KeeperHub status: `completed`, `sponsored:true`, verified receipt, retry count 0.
6. The hosted positions scan, grants listing/inspection, settings diagnostics, and bundled proof UI render without browser exceptions.
7. Local secrets are ignored by Git; only `.env.example` is tracked.
8. Release-artifact checksums validate successfully.

## Minimum pre-submission gate

Do not submit until all of the following are true:

- [ ] Remove/rotate the hosted KeeperHub key or protect every mutating API endpoint.
- [ ] Implement actual owner authorization, or remove all EIP-712/signature claims.
- [ ] Make PoAA fail for fabricated hashes and independently verify real chain/KeeperHub evidence.
- [ ] Correct the three ABI selectors and confirm all live reader provenance fields.
- [ ] Remove the fabricated $50,000 capacity fallback or label it explicitly as demo data and keep it out of execution policy.
- [ ] Fix `/overview`, `/executions`, and the global tick handler.
- [ ] Make `proof export` produce a valid, BigInt-safe, self-verifying bundle.
- [ ] Fix live tests so genuine live failures cannot appear as passes; rerun with the real key.
- [ ] Update MCP validation to the currently discovered schema and fail on `isError:true`.
- [ ] Make the GitHub repository publicly reachable or explicitly grant DoraHacks judges access.
- [ ] Upload the demo video and replace every placeholder/contact ambiguity.
- [ ] Correct README claims, dead links, contract address, environment variable, test totals, and unfinished disclosures.
- [ ] Add a license file if MIT licensing is intended.
- [ ] Rerun clean-clone build/typecheck/tests, authenticated live tests, browser flows, and safe on-chain simulation.

## Testing boundaries

No new on-chain execution was submitted because that would spend funds and change external state. Testing stopped at KeeperHub `simulate:true` for the fresh cycle. The existing historical transaction was verified independently through read-only RPC and KeeperHub status calls. No application code, environment file, key, hosted state, grant state, or wallet state was changed during the audit.

## Continuation findings (appended during ongoing audit)

### C6. A capped repayment is marked “feasible” even when it cannot reach the promised target HF

The underwriter computes the full `costToSafetyUsd`, then clamps the repayment to the configured cap. Its feasibility test checks only that this already-clamped amount is positive and no greater than the cap. It never checks whether the resulting projected HF reaches `targetHf`. Therefore, any positive partial repayment is labeled feasible even when it falls thousands of dollars short of the calculated rescue requirement.

The “cheapest feasible” sorter can consequently select a small partial repayment and present it as the optimal safety plan. The verified historical execution illustrates the impact: a 5 USDC repayment moved HF only from approximately `1.3109` to `1.3114`, nowhere near the documented `2.00` recovery target.

Evidence:

- `packages/core/src/underwriter/plans.ts:196-214` — repayment is clamped before the feasibility check, making the cap comparison tautological.
- `packages/core/src/underwriter/plans.ts:263-265` — selection trusts the incorrect `isFeasible` flag.
- `README.md:57-63` — claims the rescue ladder restores positions to HF >= 2.00.

**Required before submission:** Define feasibility as achieving the requested target (within a documented tolerance), distinguish partial mitigation from a complete rescue, and ensure all UI/docs describe the actual projected HF rather than the nominal target.

### H6. The “tamper-evident cryptographic audit trail” is a plain editable JSONL file

Audit records are appended as independent JSON lines. They contain no previous-record hash, record hash, Merkle root, signature, immutable remote anchor, or chain receipt binding. Any process with file access can edit, delete, reorder, or replace records without detection, and the reader will accept the modified file.

This does not satisfy the UI/README claims of a tamper-evident or cryptographically signed audit trail.

Evidence:

- `packages/core/src/grants/store.ts:296-319` — plain `appendFile` and unverified JSON parsing.
- `public/audit.html:79` — claims a “Tamper-evident” chronological sequence.
- `README.md:324` — claims audit bundles contain cryptographic signatures.

**Required before submission:** Either add verifiable chaining/signatures/anchoring and verify them on read/export, or accurately label the artifact as an append-only-by-convention local activity log.

### H7. Reputation metrics count revoked and failed-lifecycle grants as approved and armed

The reputation calculator treats only the exact `proposed` and `approved` states specially. Every other state—including `revoked`, `insufficient_capacity`, `expired`, `invalidated`, and failure states—is counted as proposed, approved, and armed. It also counts an execution as verified when `receiptVerified` is true even if the execution record itself is not in the `verified` state.

This is visible in the shipped fixture data: the six statuses are `revoked`, `insufficient_capacity`, two `armed`, `dry_run`, and `verified`, yet the calculator reports all six as approved and all six as armed. The dashboard therefore presents materially inflated reputation figures as “strict” execution-derived bookkeeping.

Evidence:

- `packages/core/src/desk/reputation.ts:38-47` — the catch-all branch increments approved and armed for every status other than exactly `proposed` or `approved`.
- `packages/core/src/desk/reputation.ts:55-59` — receipt verification alone is sufficient to count deployed capital and a verified execution.
- `fixtures/grants.json` — includes revoked and insufficient-capacity grants that the current calculator counts as armed.
- Direct execution of the built calculator against the fixtures returned `totalGrantsApproved: 6` and `totalGrantsArmed: 6`.

**Required before submission:** Derive each metric from explicit state-transition evidence or precise allowlists, count failed/revoked states separately, and require the full application verification condition before crediting a verified rescue or deployed capital.

### H8. Execution monitoring can hang past its timeout and mishandles `cancelled`

The direct-execution status subscriber arms an abort timer only for the SSE connection setup, then clears it immediately after response headers arrive. If the server keeps the event stream open without sending a terminal event, `reader.read()` can wait forever and polling fallback is never reached. The documented `timeoutMs` is therefore not an overall timeout.

The terminal-status allowlist also omits `cancelled`, even though `cancelled` is part of the project's own KeeperHub status type and research notes. A cancelled response is polled again, and the implementation sleeps for the full polling interval even when that exceeds the remaining timeout.

Controlled tests against the built client confirmed both behaviors:

- With a never-ending SSE response and `timeoutMs: 20`, the subscription was still pending after 200 ms.
- With an immediate `cancelled` polling response and `timeoutMs: 50`, the call made three requests and returned only after approximately 1,005 ms because of the unnecessary one-second sleep.

Evidence:

- `packages/core/src/keeperhub/client.ts:293-337` — abort timer is cleared before reading the SSE stream.
- `packages/core/src/keeperhub/client.ts:288-289` and `packages/core/src/guardian.ts:439-440` — incomplete terminal-status allowlists.
- `packages/core/src/keeperhub/types.ts:23-33` — explicitly includes `cancelled`.
- `packages/core/src/keeperhub/client.ts:343-355` — sleep is not capped to the remaining timeout.

**Required before submission:** Enforce one end-to-end deadline across connection, stream reading, and polling; cancel the reader at that deadline; recognize every documented terminal state; and cap polling delays to the remaining time.

### H9. Idempotency and retry guarantees in the submission are not implemented as claimed

The live execution path creates its idempotency key from `grantId + Date.now()`. It is neither a SHA-256 digest of the execution payload nor persisted before the network request. The grant is saved as `submitted` before the request, but the execution record is saved only after KeeperHub responds. If the request succeeds remotely and the client loses the response, local state is left submitted with no KeeperHub execution ID and no persisted key with which to retrieve or safely replay the original response.

The REST client itself performs no retry or rate-limit backoff. It parses `Retry-After` into an error and immediately throws. Several mutating client methods also omit idempotency support entirely (`updateWorkflow`, `deleteWorkflow`, and `cancelExecution`), while optional keys on other methods are not generated automatically.

This contradicts the submission claims that keys are automatic SHA-256 payload digests, exist on every mutation, guarantee zero duplicates during retries, and accompany automatic rate-limit backoff.

Evidence:

- `packages/core/src/guardian.ts:396-423` — timestamp-based key, submitted-state write before request, execution record/key not persisted before the uncertain network boundary.
- `packages/core/src/keeperhub/client.ts:54-133` — one fetch attempt; rate-limit metadata is only attached to the thrown error.
- `packages/core/src/keeperhub/client.ts:413-438` and `:523-533` — mutating methods with no idempotency-key parameter/header.
- `README.md:71`, `:321`, and `:584-585`, plus `docs/RELEASE_NOTES_TEMPLATE.md:9` — stronger guarantees than the implementation provides.

**Required before submission:** Persist a deterministic payload-bound key and pending execution record atomically before broadcasting, reuse the same key for recovery/retry, reconcile uncertain submissions with KeeperHub, add bounded backoff where claimed, and narrow the documentation to the mutations that genuinely support idempotency.
