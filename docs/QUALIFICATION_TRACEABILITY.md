# DoraHacks Qualification & Rubric Traceability Matrix

**Track:** Best Integration into a Live Project  
**Submission:** BULWARK — The Autonomous Agent Backstop Economy for Live Aave Positions  
**Target Platform:** KeeperHub (The Agent Economy Hackathon)

This matrix maps each judging criterion and hackathon requirement to its exact algorithmic mechanism in BULWARK, its codebase evidence path, reproducible automated test, and the corresponding demo video step.

---

## Traceability Matrix

| Hackathon Rubric Item | BULWARK Mechanism | Codebase Evidence Path | Test Evidence Path | 90s Demo Step |
|---|---|---|---|---|
| **1. Integration Depth into Live Project** | Deep integration with live Aave V3 ($17.4B TVL) across Sepolia testnet and Base, using verified contracts and pure ABI truth pipelines. | `packages/core/src/chains.ts`<br>`packages/core/src/aave/reader.ts` | `test/unit/reader.test.ts`<br>`test/unit/abi.test.ts` | **0:10 - 0:20s**: Live Aave Sepolia position telemetry scanned with provenance tags. |
| **2. KeeperHub API & MCP Utilization** | Full coverage of KeeperHub REST APIs (`contract-call`, `check-and-execute`, `spend-cap`, `keys`) + streamable-HTTP MCP server (`/mcp` and `/mcp/public`). | `packages/core/src/keeperhub/client.ts`<br>`packages/agent/src/index.ts` | `test/unit/client/client.test.ts`<br>`test/integration/mcp.live.test.ts`<br>`test/integration/keeperhub.live.test.ts` | **0:50 - 0:60s**: Execution with `Idempotency-Key` and Turnkey-signed broadcast. |
| **3. Autonomous Agency & Safety Bounds** | Bounded Underwriter counterfactual ladder + deterministic clamp-only Policy Compiler (`authorityHash` binding). Raising limits is structurally impossible. | `packages/core/src/underwriter/plans.ts`<br>`packages/core/src/policy/compiler.ts` | `test/unit/plans.test.ts`<br>`test/unit/compiler.test.ts`<br>`test/security/security.test.ts` | **0:40 - 0:50s**: Owner approves grant; agent requests $22; compiler clamps to band cap $15 on screen. |
| **4. Originality & Novel Mechanisms** | **Adaptive Rescue Authority**: capacity ceiling dynamically resolves from live HF bands.<br>**Proof of Authorized Agency (PoAA)**: public trustless 11-check verification chain. | `packages/core/src/policy/engine.ts`<br>`packages/core/src/proof/poaa.ts`<br>`packages/web/public/verify.html` | `test/unit/poaa.test.ts`<br>`test/e2e/web.e2e.test.ts` | **0:78 - 0:85s**: Public `/verify` portal runs 11/11 checks, outputting `VERDICT: PROVEN`. |
| **5. Honest Truth Pipelines & Provenance** | Dual verification of every fact: KeeperHub execution receipts cross-checked with independent public RPC lookups. Every UI metric carries provenance chips. | `packages/core/src/receipts/verify.ts`<br>`packages/web/public/style.css` | `test/unit/receipts.test.ts`<br>`test/failure/failure.test.ts` | **0:60 - 0:70s**: Dual receipt verification displayed on live dashboard timeline. |
| **6. Economic Backing & Reputation** | Reserved rescue capacity is backed by real on-chain desk wallet balances. Desk reputation is derived strictly from verified execution history. | `packages/core/src/grants/store.ts`<br>`packages/core/src/desk/reputation.ts` | `test/unit/capacity.test.ts`<br>`test/unit/reputation.test.ts` | **0:20 - 0:30s**: Real desk balance ($500.00) backs active grant reservations. |
| **7. Production Engineering & Developer Tooling** | Zero-dependency core SDK (`@bulwark/core`), modular CLI (`@bulwark/cli`), streamable MCP agent (`@bulwark/agent`), and zero-scroll ops dashboard (`@bulwark/web`). | `packages/*`<br>`scripts/smoke.sh`<br>`scripts/live-proof.sh` | Full suite (19 test files, 100+ tests passing). | **0:00 - 0:90s**: Seamless mechanisms across CLI, agent loop, and web console. |

---

## Key Invariants Verified Across All Stages

1. **Grants in `proposed` state NEVER execute**: Requires explicit human owner signature (`grants approve`).
2. **Compiler-Raise Invariant**: Agent intent cannot exceed policy or adaptive band limits; compiler clamps, never raises.
3. **Dual Verification Invariant**: Receipt validity requires both KeeperHub status and independent RPC transaction receipt confirmation.
4. **Secrets Protection Invariant**: API keys and Bearer tokens are scrubbed from logs and never transmitted across web API boundaries.
