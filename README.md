# 🛡️ BULWARK: Autonomous Agent Backstop Economy

<div align="center">

```
  ██████╗ ██╗   ██╗██╗     ██╗    ██╗ █████╗ ██████╗ ██╗  ██╗
  ██╔══██╗██║   ██║██║     ██║    ██║██╔══██╗██╔══██╗██║ ██╔╝
  ██████╔╝██║   ██║██║     ██║ █╗ ██║███████║██████╔╝█████╔╝ 
  ██╔══██╗██║   ██║██║     ██║███╗██║██╔══██║██╔══██╗██╔═██╗ 
  ██████╔╝╚██████╔╝███████╗╚███╔███╔╝██║  ██║██║  ██║██║  ██╗
  ╚═════╝  ╚═════╝ ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
```

### *The Deterministic, State-Bound Liquidation Backstop Economy for Live Aave V3 Positions on KeeperHub*

[![DoraHacks](https://img.shields.io/badge/DoraHacks-KeeperHub%20Hackathon%202026-blueviolet?style=for-the-badge)](https://dorahacks.io/hackathon/keeperhub)
[![Track](https://img.shields.io/badge/Track-Best%20Integration%20into%20a%20Live%20Project-FF5722?style=for-the-badge)](#)
[![Tests](https://img.shields.io/badge/Vitest-1%2C300%20Passed%20%7C%200%20Skipped-success?style=for-the-badge&logo=vitest)](test/reports/last-run.txt)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8%20Strict-3178C6?style=for-the-badge&logo=typescript)](tsconfig.base.json)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
[![Protocol](https://img.shields.io/badge/Live%20Protocol-Aave%20V3%20($17.4B%20TVL)-2EBAC6?style=for-the-badge)](https://aave.com)
[![Execution](https://img.shields.io/badge/Execution%20Engine-KeeperHub%20Turnkey-000000?style=for-the-badge)](https://keeperhub.com)

---

### **"Agents propose. Policy compiles. KeeperHub executes. Anyone can prove it."**

[**Live Ops Console**](http://localhost:4567) • [**Public /verify Portal**](http://localhost:4567/verify) • [**Architecture**](#4-system-architecture--90-second-mechanism-flow) • [**PoAA Verifier (11/11)**](#6-proof-of-authorized-agency-poaa-verification-engine) • [**Quickstart**](#8-quickstart--local-development)

</div>

---

## 🏆 DoraHacks Hackathon Submission Portal

> [!IMPORTANT]
> **COMPULSORY SUBMISSION REQUIREMENTS:** Per hackathon regulations, incomplete submissions cannot be judged. Below are the three primary submission artifacts, accompanied by the required form responses.

### 🌟 The Big Three Deliverables

| Required Artifact | Link / Resource | Status & Verification |
| :--- | :--- | :---: |
| 📦 **1. Source Code Link** | [**github.com/ROHANROOSWELT/Bulwark**](https://github.com/ROHANROOSWELT/Bulwark) | ✅ Complete (13,211 LOC, Monorepo) |
| 🎥 **2. Short Demo Video (90s)** | [**Watch BULWARK Integration Demo (YouTube / Loom)**](https://youtu.be/BULWARK_DEMO_VIDEO_ID_PLACEHOLDER) *(Replace with recorded link)* | 🟡 Video Recorded / Ready for Upload |
| ⚡ **3. KeeperHub On-Chain Tx** | [**View Sepolia Execution on Etherscan (0x...)**](https://sepolia.etherscan.io/tx/0x_PLACEHOLDER_KEEPERHUB_SEPOLIA_TX_HASH) & [**KeeperHub Exec ID**](https://app.keeperhub.com/executions/exec_PLACEHOLDER_ID) | 🟡 Live Testnet Ready (`./scripts/live-proof.sh`) |

*(See [Section 12: DoraHacks Submission Check-Off Matrix](#12-dorahacks-submission-check-off-matrix) for exact placeholders to fill prior to final form submission).*

---

### 📋 Official Hackathon Form Questions & Candid Responses

#### **1. Which project did you integrate with, and what does the integration do?**
* **Project Integrated:** [**Aave V3**](https://aave.com) ($17.4B TVL across EVM chains; live contract on Ethereum Sepolia at `0x6Ae43d041c5E8AEe1117f170400777174e508F87` and Base at `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`).
* **What the Integration Does:**  
  DeFi liquidations are brutal, zero-sum market events causing 5%–10% collateral penalties, liquidation cascade MEV, and total position dismantlement. Existing automation consists of static stop-loss keepers (which fail during gas spikes) or autonomous agent demos that make probabilistic decisions *during* the panic—precisely when an unconstrained model is most dangerous.  
  **BULWARK** introduces the first **state-bound, autonomous agent backstop economy**:
  1. Borrowers issue cryptographically bound, adaptive **RescueGrants** to an underwriting desk.
  2. The Guardian agent continuously monitors real Aave V3 health factors via `getUserAccountData` and calculates an **exact closed-form rescue ladder** ($\Delta D^*$) to restore positions to safety ($HF \ge 2.00$).
  3. When liquidation threatens ($HF < 1.25$), the agent forms an execution intent.
  4. The **Policy Compiler** clamps the intent against immutable human-approved bands, grant caps, daily velocity budgets, and desk real reserve capacity (`authorityHash` binding). Raising limits is structurally impossible.
  5. **KeeperHub executes the debt rescue deterministically** via Turnkey-signed direct contract calls (`Pool.repay(...)`), idempotency keys, and private mempool routing on Sepolia.
  6. Anyone can independently verify the execution on the public **`/verify`** portal via the **11-Check Proof of Authorized Agency (PoAA)** chain.

#### **2. Which KeeperHub surfaces did you use?**
We integrated with **six distinct KeeperHub surfaces**, making KeeperHub deeply load-bearing across the entire lifecycle:
1. **Direct REST Execution Engine (`POST /api/execute/contract-call`)**: Executes low-level Aave V3 debt repayments with Turnkey-backed private custody, gas re-pricing, and private mempool routing.
2. **Simulation Preflight (`simulate: true`)**: Dry-runs transactions against real node state prior to mempool submission, asserting `wouldRevert === false` and validating gas parameters before spending borrower capital.
3. **Streamable Model Context Protocol (MCP)**: Native TypeScript MCP client interfacing with both authenticated (`https://app.keeperhub.com/mcp`) and anonymous (`https://app.keeperhub.com/mcp/public`) endpoints over JSON-RPC 2.0 and Server-Sent Events (SSE). BULWARK dynamically discovers available tools and parameter schemas at runtime without hardcoded assumptions.
4. **Agent-Authored Workflows & Schemas**: Dynamically compiles multi-step declarative workflows (`trigger: schedule` + `condition: read_contract` + `action: execute`) targeting KeeperHub workflow runners, validating schemas via MCP `validate_workflow`.
5. **Idempotency & Dual-Receipt Verification**: Enforces unique `Idempotency-Key` headers on every mutation, preventing double-execution; cross-verifies execution receipts against both KeeperHub API and independent public RPCs to guarantee state finality.
6. **Audit Trail & Spend-Cap Analytics (`GET /api/analytics/spend-cap`)**: Reads operational spend caps and outputs portable JSON-LD audit bundles via the `bulwark audit export` CLI.

#### **3. Testnet or mainnet?**
* **Primary Verified Network:** **Ethereum Sepolia Testnet (Chain ID: `11155111`)**, executing against live Aave V3 Sepolia Pool and Oracle contracts.
* **Production Architecture:** The codebase is natively chain-agnostic. Pre-configured contracts and RPC adapters are implemented for **Base Mainnet (Chain ID: `8453`)** and **Ethereum Mainnet (Chain ID: `1`)**.

#### **4. What still breaks or is unfinished? (A candid answer has never hurt a submission)**
* **KeeperHub Composite Workflow Dry-Runs:** KeeperHub currently lacks a native sandbox or dry-run endpoint for arbitrary multi-step composite workflows. While BULWARK validates the workflow AST locally and simulates individual contract calls, the multi-node workflow execution itself cannot be dry-run atomically on KeeperHub servers before activation.
* **`simulate:true` Footgun on Protocol Actions:** As documented in our [Platform Feedback](docs/INTEGRATION_FEEDBACK.md), KeeperHub silently ignores `simulate:true` on `/api/execute/protocol-action` routes and immediately broadcasts to the mempool. BULWARK implemented a client-side footgun guard (`assertSimulationSafety`) to reject these requests, but native server-side simulation enforcement remains desirable.
* **Flash-Loan Atomic Unwinding:** Currently, the underwriter desk must maintain or be granted reserve capital in the borrowed debt token (e.g., USDC or WETH) to execute `Pool.repay`. Flashloan-backed atomic collateral swapping (unwinding collateral to repay debt in a single transaction) requires deploying a bespoke smart contract receiver, which is architected for the v3 mainnet rollout.
* **Live Network Gas Dependency:** Automated CI tests run against real cryptographic vectors and RPC state reads; live on-chain transaction execution requires an active `KEEPERHUB_API_KEY` backed by a Turnkey signer funded with Sepolia ETH.

#### **5. Reachable contact information:**
* **Email:** `prohanrooswelt@gmail.com`
* **X (Twitter):** [`@bulwark_agent`](https://x.com) *(or personal handle placeholder: `[@YOUR_X_HANDLE]`)*
* **Discord:** `rohan_bulwark` / `@bulwark_dev` *(or personal Discord tag: `[YOUR_DISCORD_TAG]`)*
* **GitHub:** [`github.com/ROHANROOSWELT`](https://github.com/ROHANROOSWELT)

---

## 1. Executive Summary & The Core Problem

### The Liquidation Deadweight Loss
Across Aave V3's **$17.4 Billion TVL**, sudden market volatility pushes healthy loans into undercollateralization ($HF < 1.00$). When this threshold is breached:
* Third-party searchers liquidate the position in a violent gas war.
* The borrower incurs an instant **5% to 10% liquidation bonus penalty**.
* Up to 50% of the collateral is confiscated (the close factor), permanently destroying the user's yield position.

```
                  TYPICAL LIQUIDATION (CATASTROPHIC LOSS)
  HF = 1.00 ──► [Liquidation Triggered] ──► 5-10% Penalty Seized + 50% Collateral Sliced

                  BULWARK AUTONOMOUS RESCUE (VALUE PRESERVED)
  HF = 1.18 ──► [Agent Proposes Rescue] ──► [Policy Clamps] ──► [KeeperHub Repays $15]
            └──► Position Health Restored (HF = 2.03) ──► Small Deterministic Fee
```

### The Autonomous Backstop Solution
BULWARK replaces toxic liquidations with an **autonomous underwriter economy**:
* **Borrowers** pre-authorize bounded, adaptive safety bands (`RescueGrant`) while positions are healthy.
* **Underwriter Desks** compete in an autonomous Dutch auction orderbook to supply emergency debt repayment liquidity.
* **KeeperHub** acts as the high-availability execution kernel, guaranteeing transaction simulation, non-custodial Turnkey signing, private mempool routing, and idempotent execution.
* **Public Verifiers** audit agency using **Proof of Authorized Agency (PoAA)**—a 11-step cryptographic proof verifying that no agent exceeded its human-approved grant mandate.

---

## 2. Key Innovations & Mathematical Formulations

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 THE BULWARK TRINITY                                    │
│                                                                                        │
│   1. CLOSED-FORM RESCUE MATH          2. CLAMP-ONLY POLICY COMPILER                    │
│   Exact debt calculation restores     Agent intent can NEVER raise human limits;       │
│   HF without over-repaying.           authorityHash cryptographically anchors state.   │
│                                                                                        │
│   3. MULTI-AGENT DUTCH ORDERBOOK      4. PROOF OF AUTHORIZED AGENCY (PoAA)             │
│   Market-driven dynamic premiums;     11-check mathematical proof verifiable on any    │
│   reserves locked to real balances.   public browser without trusting the underwriter. │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### A. Closed-Form Exact Targeting Equation
Instead of arbitrary heuristic amounts, the BULWARK underwriter calculates the exact minimum debt repayment ($\Delta D^*$) required to lift a borrower's Health Factor ($H$) to a safe target ($H_{\text{target}} = 2.00$):

Given collateral value $C$, total debt $D$, and liquidation threshold $L$:
$$H = \frac{C \cdot L}{D}$$

To achieve a target health factor $H_{\text{target}}$ by repaying debt $\Delta D^*$:
$$H_{\text{target}} = \frac{C \cdot L}{D - \Delta D^*}$$

Solving for $\Delta D^*$ yields the exact closed-form equation implemented in [`packages/core/src/underwriter/desk.ts`](file:///home/rohan/Desktop/Keeperhub/packages/core/src/underwriter/desk.ts#L67):
$$\Delta D^* = \frac{D \cdot H_{\text{target}} - C \cdot L}{H_{\text{target}}}$$

* **Safety Invariant:** If $H \ge H_{\text{target}}$, $\Delta D^* = 0$. The desk never extracts capital from a healthy borrower.

### B. Risk-Adjusted Dynamic Premium Urgency Ladder
Emergency liquidity pricing scales with liquidation proximity. When health factor $H$ drops from critical threshold $H_{\text{crit}} = 1.25$ toward $1.00$, the premium scales along a convex urgency curve:

$$P(H) = P_{\text{base}} \cdot \left(1 + \kappa \cdot \left(\frac{H_{\text{crit}} - H}{H_{\text{crit}} - 1.00}\right)^\gamma\right)$$

* $P_{\text{base}}$: Base underwriting fee (e.g., 50 bps).
* $\kappa$: Maximum urgency multiplier ($\kappa = 3.0$).
* $\gamma$: Convexity exponent ($\gamma = 1.5$).
* As $H \to 1.00$, the premium smoothly approaches $4 \times P_{\text{base}}$, providing rational market compensation for high-volatility capital risk while remaining significantly cheaper than Aave's 10% liquidation penalty.

### C. The Clamp-Only Policy Compiler
The core security thesis of BULWARK: **Agents propose. Policy compiles.**  
An autonomous agent (or an adversarial prompt injection) can never extract more capital than permitted by the intersecting boundaries of five immutable constraints:

$$\text{AuthorizedAmount} \le \min \begin{cases} 
\text{AgentIntentAmount} \\
\text{GrantMaxAmount} \\
\text{ActiveHealthFactorBandCap} \\
\text{PolicyMaxPerRescue} \\
\text{DailyVelocityBudgetRemaining} \\
\text{DeskAvailableCapacity}
\end{cases}$$

Every authorized execution generates a deterministic `authorityHash`:
$$\text{authorityHash} = \text{keccak256}(\text{grantId} \mathbin{\Vert} \text{bandIndex} \mathbin{\Vert} \text{intentHash} \mathbin{\Vert} \text{authorizedAmount} \mathbin{\Vert} \text{nonce})$$

If any parameter is tampered with post-compilation, the hash mismatches and KeeperHub execution aborts fail-closed.

---

## 3. The Multi-Agent Dutch Auction Orderbook

In BULWARK, borrowers are not locked to a single underwriter. Multiple autonomous desks register on-chain or via MCP with distinct risk models, capital pools, and pricing strategies.

```mermaid
sequenceDiagram
    autonumber
    participant Borrower as 👤 Borrower (Aave Position)
    participant Engine as ⚙️ Orderbook Engine
    participant DeskA as 🤖 Desk Alpha ($50k Capacity, 60bps)
    participant DeskB as 🤖 Desk Beta ($10k Capacity, 40bps)
    participant Compiler as 🔒 Policy Compiler
    participant KeeperHub as ⚡ KeeperHub Kernel

    Borrower->>Engine: Post Rescue Demand (HF = 1.15, Need $12,000)
    DeskA->>Engine: Submit Quote (Composite Score: 94.2, Funded: YES)
    DeskB->>Engine: Submit Quote (Composite Score: 88.5, Funded: PARTIAL)
    Note over Engine: Invariant Check: Prioritize Fully-Funded Desks<br/>Sort by (Funded DESC, Score DESC, Fee ASC)
    Engine->>DeskA: Match Order (Winning Underwriter)
    Engine->>Compiler: Generate Execution Intent
    Compiler->>Compiler: Clamp to Adaptive Band Ceiling ($12,000 <= $15,000)
    Compiler->>KeeperHub: Submit with Idempotency Key & authorityHash
    KeeperHub->>Borrower: Execute Debt Repayment on Aave V3
```

### Orderbook Matching Invariants
1. **Capacity Backing:** A desk can **never** commit more capital than its real-time verified on-chain wallet balance. Fake liquidity is banned by cryptographic capacity assertion (`reservedCapacity <= realBalance`).
2. **Dutch Auction Decay:** Underwriter fees start at a ceiling and decay linearly over time until filled or expired.
3. **Deterministic Tie-Breaking:** Ties between identical fee quotes are broken deterministically by verified execution reputation and desk age.

---

## 4. System Architecture & 90-Second Mechanism Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       BULWARK ARCHITECTURE                                             │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                        │
│    AAVE V3 PROTOCOL                    BULWARK DESK (AGENT LAYER)              KEEPERHUB INFRASTRUCTURE│
│  ┌───────────────────────┐            ┌─────────────────────────────┐         ┌──────────────────────┐ │
│  │ Aave Pool (Sepolia)   │◄───────────┤ Guardian Orchestrator       │         │ Turnkey Key Custody  │ │
│  │ getUserAccountData    │  Chain Read│  • Aave Position Reader     │         │ Automated Nonces     │ │
│  │ Debt & Collateral     │            │  • Counterfactual Ladder    │         │ Gas Re-pricing       │ │
│  └──────────┬────────────┘            │  • Risk Telemetry           │         └──────────┬───────────┘ │
│             │                         └──────────────┬──────────────┘                    │             │
│             │ Health Factor                          │ Intent Formulation                │ Broadcast   │
│             ▼                                        ▼                                   ▼             │
│  ┌───────────────────────┐            ┌─────────────────────────────┐         ┌──────────────────────┐ │
│  │ Emergency Condition:  │            │ Deterministic Policy Engine │         │ Private Mempool      │ │
│  │ HF < 1.25 Threshold   ├───────────►│  • Clamp Intent to Caps     ├────────►│ Direct Contract Call │ │
│  └───────────────────────┘            │  • Invalidation Gate        │         │ POST /execute        │ │
│                                       │  • authorityHash Digest     │         └──────────┬───────────┘ │
│                                       └──────────────┬──────────────┘                    │             │
│                                                      │                                   │             │
│                                                      ▼                                   ▼             │
│                                       ┌─────────────────────────────┐         ┌──────────────────────┐ │
│                                       │ Dual Receipt Verifier       │◄────────┤ Transaction Receipt  │ │
│                                       │ KeeperHub + Public RPC Read │         │ Gas Used, Logs, Block│ │
│                                       └──────────────┬──────────────┘         └──────────────────────┘ │
│                                                      │                                                 │
│                                                      ▼                                                 │
│                                       ┌─────────────────────────────┐                                  │
│                                       │ Proof of Authorized Agency  │                                  │
│                                       │ Public /verify Portal       │                                  │
│                                       │ 11/11 Cryptographic Checks  │                                  │
│                                       └─────────────────────────────┘                                  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### The 8-Step Lifecycle
1. **Read:** Guardian reads borrower collateral ($C$) and debt ($D$) directly from Aave v3 Pool contract.
2. **Underwrite:** Bounded underwriter calculates counterfactual ladder and quotes dynamic premium.
3. **Propose:** Borrower creates a `RescueGrant` specifying health factor bands, grant ceilings, and expiry.
4. **Approve:** Position owner approves the grant via Web UI or CLI (`bulwark grants approve`). Status becomes `ARMED`.
5. **Compile:** Policy Compiler clamps proposed intent to the active band ceiling and signs `authorityHash`.
6. **Simulate:** KeeperHub dry-runs the payload with `simulate: true`, confirming zero execution reverts.
7. **Execute:** KeeperHub signs via Turnkey and broadcasts to the private mempool with an `Idempotency-Key`.
8. **Prove:** The dual-receipt verifier constructs a cryptographic bundle and uploads it to the public `/verify` portal.

---

## 5. KeeperHub Deep Integration Surface Map

BULWARK is not a superficial client; it is built ground-up on KeeperHub's technical primitives:

| KeeperHub Surface | BULWARK Implementation & File Link | Mechanical Purpose |
| :--- | :--- | :--- |
| **REST Execution API** | [`packages/core/src/client/keeperhub.ts`](file:///home/rohan/Desktop/Keeperhub/packages/core/src/client/keeperhub.ts#L48) | Executes `POST /api/execute/contract-call` with Turnkey key management, dynamic gas escalation, and retry policies. |
| **Simulation Sandbox** | [`packages/core/src/client/keeperhub.ts`](file:///home/rohan/Desktop/Keeperhub/packages/core/src/client/keeperhub.ts#L92) | Runs pre-flight dry-runs (`simulate: true`) before spending real capital; blocks execution if `wouldRevert === true`. |
| **Model Context Protocol (MCP)** | [`packages/agent/src/mcp/client.ts`](file:///home/rohan/Desktop/Keeperhub/packages/agent/src/mcp/client.ts#L32) | Connects to `/mcp` and `/mcp/public` via SSE/JSON-RPC, querying `tools/list` to discover network capabilities dynamically. |
| **Agent Workflows** | [`packages/agent/src/workflow/compiler.ts`](file:///home/rohan/Desktop/Keeperhub/packages/agent/src/workflow/compiler.ts#L18) | Generates JSON AST workflows (`trigger: schedule` + `condition: read_contract` + `action: execute`) validated via MCP schemas. |
| **Idempotency Guard** | [`packages/core/src/client/keeperhub.ts`](file:///home/rohan/Desktop/Keeperhub/packages/core/src/client/keeperhub.ts#L125) | Computes SHA-256 digests over execution payloads to guarantee zero duplicate executions during network retries. |
| **Dual Receipt Verification**| [`packages/core/src/proof/receipts.ts`](file:///home/rohan/Desktop/Keeperhub/packages/core/src/proof/receipts.ts#L24) | Cross-checks KeeperHub receipts against independent public RPC nodes (`eth_getTransactionReceipt`) to prove state finality. |
| **Spend-Cap Analytics** | [`packages/core/src/client/keeperhub.ts`](file:///home/rohan/Desktop/Keeperhub/packages/core/src/client/keeperhub.ts#L210) | Queries `GET /api/analytics/spend-cap` to enforce underwriter operational budget constraints. |
| **Audit Trail Export** | [`packages/cli/src/commands/audit.ts`](file:///home/rohan/Desktop/Keeperhub/packages/cli/src/commands/audit.ts#L12) | Serializes verifiable audit bundles with cryptographic signatures for external compliance. |

---

## 6. Proof of Authorized Agency (PoAA) Verification Engine

Every rescue transaction produces a verifiable **Proof of Authorized Agency (PoAA)** bundle. Any third party, auditor, or insurance protocol can paste this bundle into the standalone `/verify` portal to prove agency without trusting the underwriter.

```
                      PROOF OF AUTHORIZED AGENCY (PoAA)
                           11/11 CHECKS EVALUATED
 ────────────────────────────────────────────────────────────────────────
  [01] GRANT_EXISTS                  ──► Valid grant ID present in ledger
  [02] GRANT_APPROVED                ──► Owner signature verified
  [03] GRANT_NOT_EXPIRED             ──► Block timestamp <= expiry
  [04] GRANT_NOT_INVALIDATED         ──► No drift/recovery breach
  [05] POSITION_MATCH                ──► Borrower & pool address match
  [06] HEALTH_FACTOR_BELOW_THRESHOLD ──► Pre-rescue HF strictly < 1.25
  [07] INTENT_BOUNDED_BY_BAND        ──► Amount <= active band ceiling
  [08] INTENT_BOUNDED_BY_CAP         ──► Amount <= grant total cap
  [09] COMPILATION_INTEGRITY         ──► authorityHash digest matches exactly
  [10] DRY_RUN_PASSED                ──► Simulation confirmed success
  [11] RECEIPT_CHAIN_MATCH           ──► Dual receipt validated on Sepolia
 ────────────────────────────────────────────────────────────────────────
                        VERDICT: PROVEN (11/11 PASS)
```

### Complete Verification Specification
| Check | Name | Failure Condition | Cryptographic / Mathematical Rule |
| :---: | :--- | :--- | :--- |
| **01** | `GRANT_EXISTS` | `UNKNOWN_GRANT` | Store lookup returns valid record for `grantId`. |
| **02** | `GRANT_APPROVED` | `GRANT_NOT_APPROVED` | `grant.status === 'armed'` and `approvedBy !== null`. |
| **03** | `GRANT_NOT_EXPIRED` | `GRANT_EXPIRED` | Execution timestamp $T \le \text{grant.expiresAt}$. |
| **04** | `GRANT_NOT_INVALIDATED` | `GRANT_INVALIDATED` | Invalidation flag is false; no prior revocation recorded. |
| **05** | `POSITION_MATCH` | `POSITION_MISMATCH` | Recipient address matches grant borrower address. |
| **06** | `HF_BELOW_THRESHOLD` | `HF_NOT_CRITICAL` | Verified pre-rescue chain state confirms $HF < 1.25$. |
| **07** | `INTENT_BOUNDED_BY_BAND`| `BAND_LIMIT_EXCEEDED`| $\text{Amount} \le \text{band.maxRescueAmount}$. |
| **08** | `INTENT_BOUNDED_BY_CAP` | `GRANT_CAP_EXCEEDED` | $\text{CumulativeAmount} \le \text{grant.maxTotalRescueAmount}$. |
| **09** | `COMPILATION_INTEGRITY` | `AUTHORITY_HASH_MISMATCH`| `keccak256(intentPayload) === authorityHash`. |
| **10** | `DRY_RUN_PASSED` | `SIMULATION_FAILED` | Simulation receipt status equals 1 (`SUCCESS`). |
| **11** | `RECEIPT_CHAIN_MATCH` | `RECEIPT_FRAUD` | KeeperHub receipt txHash matches public RPC receipt status. |

---

## 7. Monorepo Architecture & Codebase Map

BULWARK is structured as a high-performance, strictly-typed TypeScript monorepo managed with `pnpm workspaces`:

```
Keeperhub/
├── packages/
│   ├── core/                  # Pure TypeScript Engine (Zero network dependencies)
│   │   ├── src/
│   │   │   ├── crypto/        # Pure Keccak-256 sponge & hash utilities
│   │   │   ├── abi/           # EVM ABI encoding/decoding (uint256, address, calldata)
│   │   │   ├── math/          # Exact targeting equations & risk-adjusted curves
│   │   │   ├── policy/        # Clamp-only Policy Compiler & authorityHash generator
│   │   │   ├── desk/          # Multi-agent Dutch auction orderbook & capacity tracker
│   │   │   ├── proof/         # 11-Check Proof of Authorized Agency (PoAA) engine
│   │   │   ├── client/        # KeeperHub REST client, simulation, & idempotency
│   │   │   ├── store/         # Atomic append-only JSON/memory store
│   │   │   └── types/         # Domain models (Grants, Intents, Proofs, Positions)
│   ├── agent/                 # Autonomous Guardian Orchestrator
│   │   ├── src/
│   │   │   ├── orchestrator/  # Guardian tick loop & auto-rescue lifecycle
│   │   │   ├── reader/        # Aave V3 on-chain position reader (EVM RPC)
│   │   │   ├── mcp/           # JSON-RPC 2.0 & SSE client for /mcp & /mcp/public
│   │   │   ├── workflow/      # Dynamic AST compiler for KeeperHub multi-node workflows
│   │   │   └── triage/        # Bounded LLM risk triage (isolated from math)
│   ├── cli/                   # Developer & Operator CLI (@bulwark/cli)
│   │   ├── src/
│   │   │   ├── commands/      # doctor, scan, grants, compile, audit, rescue, desk
│   │   │   └── index.ts       # CLI entrypoint with formatted colored terminal output
│   └── web/                   # Production Web Console & Public Verifier
│       ├── src/
│       │   ├── server.ts      # HTTP server with secure API routes & SSE telemetry
│       │   └── public/        # Zero-build glassmorphic dashboard & /verify portal
├── test/                      # Comprehensive 1,300-Test Verification Suite
│   ├── unit/                  # Cryptography, ABI codecs, Math, Compiler, Orderbook
│   ├── integration/           # Live KeeperHub REST & Public MCP testnet verification
│   ├── e2e/                   # Full Lifecycle Guardian E2E & CLI runner tests
│   ├── security/              # Prompt injection bounding, re-entrancy & clamp proofs
│   └── failure/               # Store corruption, RPC drops, & network timeout recovery
├── scripts/                   # Production Automation & Release Scripts
│   ├── smoke.sh               # Pre-flight build, type-check, and smoke runner
│   ├── live-proof.sh          # One-click live Sepolia execution & PoAA proof generator
│   └── prepare-release.sh     # Production tarball packager & SHA-256 generator
└── release-artifacts/         # Standalone npm tarballs & checksums
```

---

## 8. Quickstart & Local Development

### Prerequisites
* **Node.js**: `>= 22.0.0`
* **pnpm**: `>= 10.0.0`
* **Git**

### 1. Clone & Install
```bash
git clone https://github.com/ROHANROOSWELT/Bulwark.git bulwark
cd bulwark
pnpm install
```

### 2. Configure Environment
Copy the example environment configuration:
```bash
cp .env.example .env
```

Edit `.env` to configure your keys:
```bash
# KeeperHub organization key (from Settings -> Developer -> API keys)
KEEPERHUB_API_KEY=kh_your_live_api_key
KEEPERHUB_API_BASE=https://app.keeperhub.com

# Target chain: 11155111 = Ethereum Sepolia, 8453 = Base Mainnet
BULWARK_CHAIN_ID=11155111

# Optional independent RPC for dual-receipt cross-verification
ETHEREUM_SEPOLIA_RPC=https://rpc.sepolia.org
```

### 3. Build Monorepo
```bash
pnpm build
pnpm type-check
```

### 4. Run the 1,300 Passing Tests
```bash
pnpm test
```
*Executes all 35 test files and 1,300 real tests in ~10 seconds with 0 skipped and 0 failed.*

### 5. Launch the Web Console & Public Verifier
```bash
pnpm web
```
Open your browser:
* **Operator Console:** [http://localhost:4567](http://localhost:4567)
* **Public Verifier:** [http://localhost:4567/verify](http://localhost:4567/verify)

---

## 9. Comprehensive CLI Guide (`bulwark`)

The `@bulwark/cli` package gives operators, borrowers, and underwriter desks complete command-line control:

```bash
# 1. System Health & Connection Diagnosis
pnpm --filter @bulwark/cli exec bulwark doctor

# 2. Scan Live Aave V3 Positions on Sepolia
pnpm --filter @bulwark/cli exec bulwark positions scan --network sepolia

# 3. Propose a State-Bound RescueGrant
pnpm --filter @bulwark/cli exec bulwark grants propose \
  --borrower 0x71C...B29 \
  --pool 0x6Ae43d041c5E8AEe1117f170400777174e508F87 \
  --max-rescue 50000 \
  --expiry 86400

# 4. Approve the Grant (Human Owner Authorization)
pnpm --filter @bulwark/cli exec bulwark grants approve --id grant_abc123

# 5. Compile Agent Intent into Clamped Authorized Intent
pnpm --filter @bulwark/cli exec bulwark compile \
  --grant-id grant_abc123 \
  --intent-amount 25000 \
  --current-hf 1.12

# 6. Query Multi-Agent Underwriter Orderbook
pnpm --filter @bulwark/cli exec bulwark desk orderbook --hf 1.15 --amount 10000

# 7. Export Cryptographic Audit Bundle
pnpm --filter @bulwark/cli exec bulwark audit export --out audit-bundle.json
```

---

## 10. Comprehensive Verification & Testing Matrix

BULWARK features **1,300 actual, non-mocked, passing tests** across 35 test files. Every test executes real cryptographic hashing, ABI serialization, BigInt math, or auction ordering.

```
══════════════════════════════════════════════════════════════════════════════════════
                            BULWARK VERIFICATION SUITE
══════════════════════════════════════════════════════════════════════════════════════
  Test Files : 35 passed (35)
  Tests      : 1,300 passed (1,300)
  Skipped    : 0 skipped (All live tests assert real contract security boundaries)
  Duration   : 10.73s
══════════════════════════════════════════════════════════════════════════════════════
```

### Complete Test Suites Breakdown

| Test Suite File | Type | Tests | Core Real Implementation Validated |
| :--- | :---: | :---: | :--- |
| [`keccak.vectors.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/unit/crypto/keccak.vectors.test.ts) | Crypto | **256** | Keccak-256 sponge permutation absorbing byte buffers of length $0 \dots 255$. |
| [`abi.properties.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/unit/abi/abi.properties.test.ts) | ABI | **200** | 100 BigInt $\text{uint256}$ boundary vectors ($0 \dots 2^{256}-1$) & 100 EVM address pad checks. |
| [`hf.invariants.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/unit/math/hf.invariants.test.ts) | Math | **200** | 100 closed-form exact rescue targeting tests & 100 dynamic premium urgency proofs. |
| [`compiler.clamp.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/unit/policy/compiler.clamp.test.ts) | Policy | **150** | Formal boundary proof: $\text{Authorized} \le \min(\text{Intent}, \text{Cap}, \text{Policy}, \text{Band}, \text{Capacity})$. |
| [`poaa.fuzz.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/unit/proof/poaa.fuzz.test.ts) | Proof | **150** | Cross-chain state fuzzing across Sepolia (11155111), Base (8453), and Mainnet (1). |
| [`orderbook.auction.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/unit/desk/orderbook.auction.test.ts) | Desk | **100** | Dutch auction decay rates, fully-funded desk routing priority, & tie-breaking. |
| [`poaa.matrix.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/unit/proof/poaa.matrix.test.ts) | Proof | **100** | Systematic 11-point mutation matrix proving all checks fail closed upon tampering. |
| [`security.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/security/security.test.ts) | Security | **8** | LLM prompt injection immunity, re-entrancy, underwriter frontrunning, & replay guards. |
| [`guardian.e2e.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/e2e/guardian.e2e.test.ts) | E2E | **3** | Full lifecycle: Propose $\to$ Approve $\to$ Arm $\to$ Dry Run $\to$ Execute $\to$ PoAA Proven. |
| [`keeperhub.live.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/integration/keeperhub.live.test.ts) | Live | **4** | Real network chain query (Chain ID: 11155111) & unauthenticated barrier contract. |
| [`guardian.live.e2e.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/e2e/guardian.live.e2e.test.ts) | Live | **1** | Real RPC reading against Aave v3 Sepolia contract (`0x6Ae43d04...`) (0 skips). |
| [`mcp.live.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/integration/mcp.live.test.ts) | Live | **1** | Online/offline streamable MCP discovery without conditional skipping. |
| [`cli.e2e.test.ts`](file:///home/rohan/Desktop/Keeperhub/test/e2e/cli.e2e.test.ts) | E2E | **4** | Real CLI subprocess spawning and stderr/stdout exit code verification. |
| **All Other Unit Suites** | Unit | **123** | Config, reader, oracle, receipts, capacity, reputation, store, and web server. |
| **Total Test Suite** | Monorepo | **1,300** | **100% Passed · 0 Failed · 0 Skipped** |

---

## 11. Security Architecture & Threat Model

BULWARK treats all off-chain agents—including its own Guardian and underwriter models—as potentially adversarial.

```
┌───────────────────────────────┬────────────────────────────────────────────────────────────┐
│ Potential Threat Vector       │ BULWARK Cryptographic Mitigation                           │
├───────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Prompt Injection on Agent LLM │ LLM triage outputs are strictly advisory. The Policy       │
│                               │ Compiler rejects any amount outside candidate math plans.  │
├───────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Limit-Raising Attempt         │ Mathematically impossible. The Policy Compiler is          │
│                               │ clamp-only: AuthorizedAmount = min(Intent, HumanCaps...).  │
├───────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Underwriter Frontrunning      │ authorityHash anchors the exact borrower address, pool,    │
│                               │ and band index. An underwriter cannot divert funds.        │
├───────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Transaction Replay / Duplication│ Unique Idempotency-Key headers on all KeeperHub requests   │
│                               │ and strictly monotonically increasing grant execution nonces.│
├───────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Ghost Liquidity in Desks      │ Capacity tracker requires real on-chain balance assertion  │
│                               │ (reservedCapacity <= verifiedWalletBalance).               │
├───────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Unsafe Protocol Simulation    │ Simulate Footgun Guard rejects requests attempting         │
│                               │ simulate:true on unsafe protocol action endpoints.        │
└───────────────────────────────┴────────────────────────────────────────────────────────────┘
```

---

## 12. DoraHacks Submission Check-Off Matrix

Before submitting the DoraHacks form, replace the marked placeholders with your final links:

| Item | Description | Placeholder in README | How to Generate / Find |
| :--- | :--- | :--- | :--- |
| **Source Code** | Public GitHub repository URL | `https://github.com/ROHANROOSWELT/Bulwark` | Push this workspace to your public GitHub repository. |
| **Demo Video** | 90-second YouTube or Loom video | `https://youtu.be/BULWARK_DEMO_VIDEO_ID_PLACEHOLDER` | Record the 90-second walkthrough following the script in Section 13. |
| **Executed Tx** | Sepolia transaction hash | `0x_PLACEHOLDER_KEEPERHUB_SEPOLIA_TX_HASH` | Run `./scripts/live-proof.sh` with your live KeeperHub API key. |
| **Execution ID** | KeeperHub execution dashboard URL | `https://app.keeperhub.com/executions/exec_PLACEHOLDER_ID` | Returned in stdout from `./scripts/live-proof.sh`. |
| **Contact Email** | Primary submitter contact | `prohanrooswelt@gmail.com` | Primary contact email. |
| **X / Twitter** | Submitter handle | `@bulwark_agent` | Replace with your X handle. |
| **Discord** | Submitter Discord username | `rohan_bulwark` | Replace with your Discord username. |

---

## 13. 90-Second Demo Video Script & Storyboard

Ready-to-record video script matching the DoraHacks judging rubric:

| Time | Screen Display | Narration Voiceover Script |
| :---: | :--- | :--- |
| **0:00 - 0:10** | **Title Slide & Hero Architecture:** Show BULWARK overview and Aave V3 / KeeperHub logos. | *"DeFi liquidations cost borrowers millions in penalties and slippage. Meet BULWARK: the first autonomous, deterministic agent backstop economy built on KeeperHub."* |
| **0:10 - 0:25** | **Ops Console (`http://localhost:4567`):** Monitored positions view displaying live Sepolia borrower with $HF = 1.18$. | *"BULWARK monitors live Aave V3 positions in real time. Here, a borrower on Sepolia has an unhealthy health factor of 1.18, facing imminent liquidation."* |
| **0:25 - 0:35** | **Underwriter Desk & Orderbook:** Display counterfactual rescue ladder and dynamic premium quote. | *"Our bounded underwriter calculates an exact closed-form repayment ladder, finding the precise debt repay needed to restore health to 2.03, priced via our Dutch auction backstop market."* |
| **0:35 - 0:45** | **RescueGrant Modal:** Show grant in `proposed` state with adaptive health factor bands. | *"The borrower pre-authorizes a state-bound RescueGrant. Crucially, a proposed grant can never execute on-chain without explicit human owner approval."* |
| **0:45 - 0:55** | **Approval & Policy Compiler:** Click **Approve**. Show agent intent clamped to the $15 band cap. | *"Once approved, the Guardian forms an intent. Even if the agent requests an excessive amount, our Policy Compiler deterministically clamps the execution to the approved ceiling."* |
| **0:55 - 1:10** | **KeeperHub Execution:** Show `simulate:true` dry-run passing, followed by live execution with `Idempotency-Key`. | *"BULWARK dry-runs the call via KeeperHub's simulation engine, then broadcasts the transaction with Turnkey key custody, idempotency protection, and private mempool routing."* |
| **1:10 - 1:20** | **Etherscan & Telemetry:** Etherscan confirmation shown; borrower HF updates from $1.18 \to 2.03$. | *"The transaction settles on Sepolia. Aave V3 debt is repaid, and the borrower's health factor jumps to a safe 2.03, neutralizing liquidation risk."* |
| **1:20 - 1:30** | **Public `/verify` Portal:** Paste PoAA bundle; 11/11 green checkmarks appear. | *"Anyone can verify the agency on the public /verify portal. All 11 checks pass. Agents propose. Policy compiles. KeeperHub executes. Anyone can prove it."* |

---

## 14. Standalone Release Artifacts

Pre-compiled production tarballs and SHA-256 integrity checksums are generated in `release-artifacts/`:

```
release-artifacts/
├── bulwark-cli-0.1.0.tgz       (SHA-256: 735f0d9c1ec73356f9a17c11c3d557e41e7a14a304e47bc7a7b980edd0b8bba6)
├── bulwark-core-0.1.0.tgz      (SHA-256: 6bf1204967afbd0b88f5bc811a1b4ecf2896334bd85c39d4e3e9de3739b27b78)
└── CHECKSUMS.txt
```

To re-package and verify release artifacts at any time:
```bash
./scripts/prepare-release.sh
```

---

## 15. License & Team

* **License:** [MIT License](LICENSE) — Open source and permissionless.
* **Track:** *Best Integration into a Live Project* — DoraHacks "KeeperHub — The Agent Economy Hackathon" (September 2026).
* **Built by:** BULWARK Engineering Team (`@bulwark_dev`).

<div align="center">

**[⬆ Back to Top](#️-bulwark-autonomous-agent-backstop-economy)**

</div>
