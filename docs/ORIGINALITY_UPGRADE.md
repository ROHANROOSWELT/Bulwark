# BULWARK — Originality Upgrade (deliverable, 2026-09-13)

> Produced by applying the ORIGINALITY UPGRADE PROMPT to the existing design. Identity preserved:
> **BULWARK — an agent backstop desk for live Aave V3 positions where an underwriter agent proposes bounded
> RescueGrants and KeeperHub deterministically executes approved rescue actions.** Nothing below replaces the
> core; it deepens it. Terminology note: "Adaptive Rescue Authority" and "Proof of Authorized Agency" are
> BULWARK coinages — no such named mechanism appears in our competitive research
> (docs/archive/RESEARCH_COMPETITIVE.md). We claim "no shipped product found implementing X as of 2026-09-13",
> never "first ever".

## 1. Current BULWARK (what is already strong)

Content-hashed RescueGrant with owner approval gate · deterministic policy engine as second gate ·
KeeperHub-only execution (simulate → idempotent execute → receipts) · independent RPC dual verification ·
Proof Bundle export · append-only audit · CLI/web/agent over one core SDK · honest provenance labels.

## 2. Current originality weaknesses

- A flat cap + expiry reads as "config file for a bot" — authority is **static**, so the system resembles
  DeFi Saver automation with an LLM attached.
- "Proof Bundle" proves a transaction happened; it does not prove the agent stayed **inside its delegation**.
- Nothing in the object itself invalidates when the world that justified it changes.
- No notion of rescuer capacity or reliability — "willing to rescue" is indistinguishable from "able to rescue".

## 3. Proposed originality upgrades (all pass the four tests in §17 of the upgrade prompt)

| Upgrade | Novelty | BULWARK-specific | KeeperHub-enabled | Economic/authority change |
|---|---|---|---|---|
| **Adaptive Rescue Authority** — capital ceiling resolves from live HF band | ✓ | ✓ bands defined per grant | ✓ execution still KeeperHub-only | ✓ authority varies with verified state |
| **Policy Compiler** — intent → AuthorizedIntent, clamp-only | ✓ | ✓ grant semantics drive it | ✓ output is a KeeperHub payload | ✓ agent cannot raise limits, structurally |
| **State-bound invalidation** — grant dies when assumptions break | ✓ | ✓ | ✓ invalidation checked against chain reads | ✓ authority is temporary by construction |
| **Counterfactual ladder** — projected HF per candidate amount | ✓ | ✓ | ✓ reads + execution both KeeperHub | ✓ makes AGENT OPTIMIZES / POLICY CONSTRAINS / KEEPERHUB EXECUTES visible |
| **Capacity-backed rescuing** — reserved capacity ≤ real wallet balance | ✓ | ✓ | ✓ balance via chain read | ✓ distinguishes willingness from ability |
| **Execution Reputation** — derived only from verified history | ✓ | ✓ | ✓ evidence = receipts + audit | ✓ measures "exercised authority within bounds" |
| **Proof of Authorized Agency (PoAA)** — 11-check verification chain | ✓ | ✓ | ✓ KeeperHub receipts are checks 9–10 | ✓ proves delegation was honored, not just that a tx mined |
| Competing rescuer offers → policy filter | ✓ | ✓ | ✓ | SHOULD BUILD (see §12) |

## 4. Final upgraded primitive (one sentence)

**BULWARK issues state-bound, adaptively-bounded RescueGrants that a deterministic policy compiler turns into
Authorized Intents which KeeperHub executes and anyone can verify as Proof of Authorized Agency.**

## 5. Final upgraded architecture

```text
                LIVE AAVE STATE (Pool.getUserAccountData, prices, balances)
                       │  source-tagged: keeperhub | public-rpc
                       ▼
                UNDERWRITER AGENT  (OBSERVE · ANALYZE · PROPOSE · PRICE · SELECT)
                       │  counterfactual ladder: repay $0/$5/$10/$15… → projected HF
                       ▼
                AGENT INTENT  (hash recorded; labeled AGENT OUTPUT)
                       │
                       ▼
                RESCUEGRANT  ── owner approval (human) ──▶  ARMED
                  ├── authority bounds (capitalCap, perAction, daily, adaptive HF bands, hfFloor)
                  ├── state conditions (debt-change %, price band, recovery HF, expiry)
                  └── premium terms (Bulwark Curve; BOOKKEEPING unless marketplace-settled)
                       │
                       ▼
                POLICY COMPILER (deterministic, hash-stable)
                  resolve band from live HF → effectiveCap = min(policy, capitalCap, perAction,
                  daily-remaining, bandCap, reserved capacity) → clamp intent (NEVER raise)
                  → state-bound invalidation gate → AUTHORIZED INTENT + authorityHash
                       │
                       ▼
                   KEEPERHUB  (simulate → idempotent execute → receipts; MCP discovery/validation)
                       │
                       ▼
                DUAL RECEIPT VERIFICATION (KeeperHub receipts + independent RPC lookups)
                       │
                       ▼
                PROOF OF AUTHORIZED AGENCY (PoAA)  (11-check chain, independently verifiable)
```

## 6. Authority model

```text
AGENT     OBSERVE · ANALYZE · PROPOSE · PRICE · SELECT-FROM-FEASIBLE   (never: size, raise, extend, authorize)
OWNER     approves / revokes the grant (human action; nothing executes on "proposed")
POLICY    resolves adaptive bands · clamps intent · invalidates on state drift · reserves capacity
KEEPERHUB signs (Turnkey) · nonce/gas/routing/retries · simulates · executes · returns verified receipts
CHAIN     final truth: HF before/after, receipt, logs
```

The LLM can never: increase capital limits · modify owner/recipient/asset-allowlist/chain · extend expiry ·
bypass or modify policy or the grant hash · fabricate state · authorize itself. Enforced in code (compiler
clamp-only + hash binding), tested in `test/security/`.

## 7. Economic model (honest)

- **Capital provider:** the rescuer desk — the KeeperHub org wallet (balance read on-chain; capacity = balance − reserved).
- **Capital receiver:** nobody "receives" cash — the owner's debt is burned (`repay` with `onBehalfOf=owner`).
- **Premium:** owner pays the rescuer per **Bulwark Curve** `premium = base + urgency × capitalDeployed × rate`,
  `urgency = clamp(1/(HF−1), 0, 10)` — earned only on VERIFIED execution (receipt + HF improvement).
- **Premium settlement:** BOOKKEEPING (labeled) on testnet; real settlement only via the verified KeeperHub
  marketplace x402/MPP path if implemented. Never faked.
- **Never exercised:** no premium (standby fee 0 in v1, documented). **Failed/reverted:** rescuer bears gas;
  no premium; reputation records the failure. **Recovered before rescue:** grant auto-invalidated (§6 of the
  upgrade), no execution, no premium. **Multiple rescuers:** winner-takes-execution via the offer filter (SHOULD BUILD).

## 8. State-bound RescueGrant — exact fields

Every field enforces a real rule; none are decorative.

```text
identity      grantId (SHA-256 of canonical core) · version=2 · policyId+policyHash · createdAt · createdBy
parties       owner (position owner) · rescuer (desk id, premium receiver) · executor (KeeperHub org wallet, fixed)
position      chainId (allowlisted) · positionOwner address · debtAsset address (allowlisted)
authority     allowedActions ["repay"|"add-collateral"] · capitalCapUsd (hard ceiling) · perActionCapUsd
              · dailyCapUsd · adaptiveBands [{hfMin, hfExcl, maxCapitalUsd}] · hfFloor (suspend below: possible
              active liquidation → escalate to human, never auto-act)
conditions    hfTriggerBelow (act only below) · recoveryHf (invalidate if HF ≥ this) · maxDebtChangePct
              (invalidate if |debt − creationDebt|/creationDebt > pct) · priceBandPct (invalidate if price
              outside ±pct of creationPrice) · expiresAt
premium       curveId+params · settlement: "BOOKKEEPING" | "MARKETPLACE:<slug>"
state         status lifecycle · creationSnapshot {hf, debtUsd, priceUsd, debtTokenBalance} · capacityReservedUsd
lifecycle     proposed → approved → armed → dry_run → submitted → mined → verified → settled
              | invalidated(reason) | expired | revoked | failed
hashes        grantHash (core fields) · authorityHash (policy-compiled bounds, bound into every execution)
```

## 9. Policy Compiler — specification

```text
INPUT   agentIntent {action, asset, amountUsd, chainId, position, rationale-hash}
        grant (ARMED, unexpired) · live snapshot (source-tagged) · policy config · capacity ledger
STEPS   1 allowlist check (action/asset/chain/position) — violation ⇒ REJECT (never clamp)
        2 resolve adaptive band from live HF  → bandCap
        3 effectiveCap = min(policy.maxUsdPerAction, capitalCapUsd, perActionCapUsd,
                             dailyRemaining, bandCap, capacityAvailable)
        4 authorizedAmountUsd = min(intent.amountUsd, effectiveCap)     // clamp-only
        5 state-bound invalidation gate: HF ≥ recoveryHf? debt drift > pct? price out of band?
          expired? already exercised/submitted? ⇒ INVALIDATED(reason)
        6 convert USD → token wei via live price + decimals; if authorizedAmount ≥ full asset debt
          AND ≤ capitalCap ⇒ may use repay-max semantics (type(uint256).max), else exact amount
OUTPUT  AuthorizedIntent {authorizedAmountUsd, amountWei, repayMax?, grantId, authorityHash,
        validUntil (ts), checks[] } — deterministic for identical inputs (hash-stable)
```

**Agents generate intent. Policies compile intent into authority. KeeperHub executes authority.**

## 10. Proof of Authorized Agency — exact verification chain

The verifier answers one question: **"Did the agent exercise exactly the authority it was given?"**

```text
 1 ✓ grant hash valid            — recompute canonical grant hash
 2 ✓ owner approval valid        — approval record exists, timestamped before execution, identity recorded
 3 ✓ policy hash valid           — policy version + hash recomputed
 4 ✓ agent intent unchanged      — recorded intent hash matches the intent that entered the compiler
 5 ✓ within grant bounds         — executed ≤ capitalCap, perActionCap, adaptive band cap
 6 ✓ within policy bounds        — executed ≤ policy max; simulate-first evidence present
 7 ✓ grant not expired           — execution ts < expiresAt; not invalidated before execution
 8 ✓ state conditions satisfied  — execution-time snapshot within band/debt/price assumptions
 9 ✓ KeeperHub execution verified— status terminal-success + receipts[].verified (KEEPERHUB FACT)
10 ✓ transaction receipt verified— independent eth_getTransactionReceipt matches (blockNumber/status)
11 ✓ Aave state change verified  — post-execution HF (chain read) > pre-execution HF; debt reduced
```

Verdict: `PROVEN` or `BROKEN(check n)`. Rendered by the public `/verify` page from an exported bundle —
no login, no trust in the desk. This is the audit answer to delegated autonomy.

## 11. Competitive originality matrix (abridged; full landscape in docs/archive/RESEARCH_COMPETITIVE.md)

| Existing system | What it does | BULWARK | Difference (new mechanism) |
|---|---|---|---|
| DeFi Saver Automation | threshold auto-repay via keeper bots, per-user config | state-bound adaptive grants, compiler-clamped agent intent | authority object vs automation config |
| Gelato / Chainlink keepers | deterministic threshold triggers | deterministic execution PLUS underwriting, pricing, invalidation, proof | keepers automate a threshold; BULWARK underwrites authority |
| LIFELINE (DoraHacks #47713) | agent picks plan per rescue, flat $0.05/call | adaptive bounded authority issued pre-emergency; PoAA verification | unit of trade is authority, not a call |
| LendGuard (#40614) | LLM decides at emergency time | agent decides while calm; execution-time authority is compiled, not interpreted | authority frozen before the emergency |
| Brahma / AA wallets | policy-gated signing (static rules) | state-adaptive, economically-priced, provably-honored delegation | policy is live-state-bound + verifiable post-hoc |
| Insurance protocols | pay after loss | prevent the loss; premium for bounded execution, not indemnity | execution primitive, not indemnity pool |

## 12. Implementation delta

**MUST BUILD** — adaptive HF bands in policy engine · policy compiler + AuthorizedIntent + authorityHash ·
state-bound invalidation matrix · counterfactual ladder in underwriter · PoAA 11-check verifier + `/verify`
page · capacity ledger backed by real desk-wallet balance · premium curve with BOOKKEEPING labeling ·
execution reputation derived from audit/executions store.

**SHOULD BUILD** — competing-rescuer offer flow with policy filter · watchtower standing workflow (KeeperHub
Schedule + read + Condition + webhook) · marketplace premium settlement via verified x402 path.

**OPTIONAL** — MPP settlement · multi-asset grants · per-rescuer multi-desk federation.

**DO NOT BUILD** — token/NFT/DAO/points/badges · staking/yield gimmicks · AI chatbot · social feed ·
generic agent marketplace · multi-protocol expansion.

## 13. Updated judge pitch

> "Agents propose. Policy compiles intent into adaptive, bounded authority. KeeperHub executes exactly that.
> Then anyone — including a judge — can run the 11-check Proof of Authorized Agency and see the agent stayed
> inside its delegation. That's not an AI liquidation bot; that's delegated financial authority you can prove."

## 14. Updated 90-second demo (mechanism, not dashboard tour)

```text
00–10s  Live Aave Sepolia position at HF 1.18 — real chain read
10–20s  Underwriter: counterfactual ladder — repay $5→HF x, $10→y, $15→z; premium quoted
20–30s  RescueGrant shown: adaptive band table ($5 @ HF≥1.30 … $25 @ HF<1.20), expiry, assumptions
30–40s  Owner approves; agent asks for $22 — POLICY COMPILER clamps to band cap $15 (on screen: clamp, never raise)
40–50s  Dry run via KeeperHub simulate (wouldRevert:false) → execute with Idempotency-Key
50–60s  KeeperHub receipts verified + independent RPC check → tx link
60–70s  Post-HF read: 1.18 → 2.03 (chain fact)
70–85s  /verify page: 11/11 checks green — Proof of Authorized Agency PROVEN
85–90s  "Agents propose. Policy compiles. KeeperHub executes. Anyone can prove it."
```

## 15. Final originality score (self-assessment, rubric-aligned)

| Dimension | Current | Upgraded |
|---|---:|---:|
| Originality | 7.5 | 9 |
| KeeperHub dependency (load-bearing-ness) | 8 | 9 — compiler output only exists as KeeperHub payloads; receipts feed PoAA |
| Agent-economy fit | 7.5 | 9 — authority, capacity, reputation are the agent-economy substrate |
| Economic novelty | 7 | 8.5 |
| Technical differentiation | 8 | 9 — hash-stable compiler + PoAA chain are deliberate to reproduce |
| Judge memorability | 7.5 | 9 — "proof of authorized agency" is sayable and demoable |
