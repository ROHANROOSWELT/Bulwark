# WINNER — BULWARK: The Agent Backstop Desk (final problem statement — originality-upgraded)

> Deep spec for every upgrade referenced here: [`docs/ORIGINALITY_UPGRADE.md`](./ORIGINALITY_UPGRADE.md).
> Identity unchanged: underwriter agent proposes bounded RescueGrants; KeeperHub executes approved rescues
> deterministically. Upgrades: Adaptive Rescue Authority, the Policy Compiler, state-bound invalidation,
> capacity-backed rescuing, execution reputation, and Proof of Authorized Agency (PoAA).

**One-sentence primitive.** BULWARK issues state-bound, adaptively-bounded **RescueGrants** over live Aave V3
positions; a deterministic **policy compiler** turns agent intent into Authorized Intents (clamp-only — the agent
can never raise a limit); **KeeperHub** executes exactly those intents with simulate-first, idempotency, and
receipts; and anyone can run the 11-check **Proof of Authorized Agency** to verify the agent exercised precisely
the authority it was given.

**Judge pitch (one sentence).** "Agents propose. Policy compiles. KeeperHub executes. Anyone can prove it —
that's Proof of Authorized Agency."

## Why this exists

Aave positions die silently: HF < 1 → anyone liquidates → owner loses the close-factor slice + bonus. Existing
automation is threshold-static (DeFi Saver, Gelato-funded keepers); agent demos decide at emergency time
(LIFELINE, LendGuard) — exactly when a probabilistic actor is most dangerous. The missing primitive is
**pre-emergency authority that is bounded, adaptive to verified state, temporary by construction, and provably
honored**. Aave is the first application; KeeperHub is the deterministic execution substrate; RescueGrant is the
authorization primitive; PoAA is the verification layer; the agent economy is the resulting market.

## The three-sided value triangle

- **Aave (live project)**: fewer liquidations → less bad debt; works on the live Sepolia testnet market and any
  V3 deployment (Base/Arbitrum/Optimism via KeeperHub's Aave V3 plugin).
- **KeeperHub**: a new integration pattern (grant → compile → AuthorizedIntent → simulate → idempotent execute →
  receipts → PoAA) that makes KeeperHub MORE load-bearing — the compiler's output only exists as KeeperHub
  payloads, and KeeperHub receipts are checks 9–10 of PoAA.
- **Agent economy**: capacity-backed rescuers, execution reputation from verified history, and a market in
  bounded emergency execution authority — the base layer of "agents backstopping agents".

## Architecture (all surfaces verified — see RESEARCH_KEEPERHUB.md)

```
POSITION OWNER                BULWARK DESK (agent layer)                      KEEPERHUB (deterministic)
─────────────                 ──────────────────────────                      ─────────────────────────
positions (wallet addrs)  →   scan: HF via Pool.getUserAccountData        →   [reads] contract-call (view, instant)
                              underwriter: counterfactual ladder
                              (repay $5/$10/$15 → projected HF),
                              optional LLM triage (AGENT OUTPUT)
                          →   RescueGrant proposed (adaptive bands,
                              assumptions, expiry, premium curve)
owner approves (CLI/web)      → status ARMED; capacity reserved ≤ real
                                desk-wallet balance (chain-read)
agent intent (hash recorded)  POLICY COMPILER: resolve HF band →
                              effectiveCap = min(policy, caps, daily,
                              band, capacity) → CLAMP (never raise)
                              → invalidation gate (recovery/debt-drift/
                              price-band/expiry) → AuthorizedIntent
                              + authorityHash
                              dry run: simulate:true ────────────────────→   POST /api/execute/contract-call {simulate:true}
                              execute (Idempotency-Key) ─────────────────→   POST /api/execute/contract-call
                                                                         →   Turnkey signing, nonce/gas/retry,
                                                                             private mempool (Ethereum/Sepolia)
                              poll status ← ──────────────────────────     GET /api/execute/{id}/status
                              PoAA: 11-check chain (grant, approval,
                              policy, intent, bounds, expiry, state,
                              KeeperHub receipts, independent RPC
                              receipt, Aave HF delta)                 →   CHAIN FACT
                              audit JSONL + reputation + /verify page
```

Value movement: desk wallet capital → Aave `repay(asset, amount, 2, onBehalfOf=owner)` → owner's debt burned →
HF recomputed on-chain. Premium accrues on VERIFIED execution per the Bulwark Curve and is labeled BOOKKEEPING
unless settled through a real marketplace listing (x402/MPP) — never faked.

## Authority model (who owns what)

- **AGENT-OWNED**: observe, analyze, propose, price, select among feasible plans. NEVER: size limits, raise
  amounts, touch owner/recipient/assets/chain, extend expiry, modify policy or grant hash, authorize itself.
- **OWNER-OWNED**: grant approval/revocation — explicit human action; `proposed` grants never execute.
- **POLICY-OWNED (deterministic)**: adaptive band resolution, clamp-only compilation, state-bound invalidation,
  capacity reservation, duplicate-execution refusal.
- **KEEPERHUB-OWNED**: signing (Turnkey), nonce, gas, routing, retries, receipts verification.
- **CHAIN-VERIFIED**: HF before/after, tx receipt, logs — the inputs the policy compiler trusts.

## Failure & reliability model

State machine: `PROPOSED → APPROVED → ARMED → DRY_RUN → DRY_RUN_FAILED | SUBMITTED → MINED → VERIFIED → SETTLED`
plus `INVALIDATED(reason) [recovered|debt-drift|price-band|exercised], POLICY_REJECTED, SIMULATION_REVERTED,
INSUFFICIENT_CAPACITY, EXPIRED, REVOKED, FAILED`. `hfFloor` suspends auto-rescue below it (possible active
liquidation → human escalation). Duplicate prevention: compiler refuses re-execution on
`SUBMITTED/MINED/VERIFIED` grants + KeeperHub `Idempotency-Key` + capacity not double-reserved.
Receipts fail closed (`not_found`/`timeout` are failures).

## Honest limits (disclosed, not hidden)

- No KeeperHub API key in the build environment ⇒ live transaction proof is generated by running
  `scripts/live-proof.sh` with a funded org key (one command; simulate paths run automatically).
- Workflow-level dry-run does not exist on KeeperHub yet; we use direct-execution `simulate:true` (verified).
- `check-and-execute` is used only where its verified scalar-read contract fits (`balanceOf`-style gates).
- Premium settlement is BOOKKEEPING unless the marketplace x402/MPP path is executed for real.
- "Adaptive Rescue Authority" and "Proof of Authorized Agency" are our coinages — no such named mechanism was
  found in the competitive landscape as of 2026-09-13 (docs/archive/RESEARCH_COMPETITIVE.md).
