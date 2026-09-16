# PRODUCT.md — BULWARK Product Specification

## 1. Vision & Core Mission
**BULWARK** is the first autonomous, deterministic backstop economy for decentralized lending markets, powered by **KeeperHub**.

Liquidations in DeFi are violently punitive: borrowers lose 5%–10% in liquidation penalties, face severe price slippage, and have collateral seized by predatory MEV bots. BULWARK replaces adversarial liquidation with cooperative, pre-underwritten micro-rescues. 

When a borrower's Health Factor ($HF$) enters distress on Aave V3 ($1.05 \le HF < 1.35$), autonomous agents underwrite an exact closed-form repayment plan, verify human-in-the-loop authorization bounds via EIP-712 typed grants, simulate the call for zero-revert safety via KeeperHub, and execute real debt repayment on-chain with Turnkey MPC signer custody and gas sponsorship.

Every single autonomous action produces a cryptographic **Proof of Authorized Agency (PoAA)** bundle containing 11 deterministic checks, allowing anyone to mathematically audit whether the agent strictly honored its human authorization.

---

## 2. Target Audience & Users
1. **DeFi Borrowers & DAOs:** High-value borrowers holding volatile collateral on Aave V3 who need 24/7 autonomous liquidation insurance without handing over private keys.
2. **Institutional Underwriter Desks & Risk Curators:** Capital allocators who deploy stablecoin liquidity into backstop orderbooks, earning dynamic risk-adjusted premiums while helping maintain DeFi protocol solvency.
3. **Hackathon Judges & Protocol Auditors (DoraHacks / KeeperHub):** Evaluators verifying real-world agent value movement, zero-mock guarantees, strict policy compilers, and seamless KeeperHub REST/MCP integration on Base Sepolia.

---

## 3. Core Functional Pillars
* **Protocol-Native Ingestion:** Real-time on-chain position reads directly from Aave V3 Pool contract (`0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27` on Base Sepolia) via public RPC. Zero mocked numbers.
* **Bounded Autonomous Underwriting:** Closed-form targeting equation calculating the exact debt delta ($\Delta D^*$) needed to restore $HF \ge 2.00$ without over-repaying. Gemini 3.5 Flash-Lite LLM triages strategy selection (`AGENT_SELECT`), while deterministic math acts as a hardened invariant fallback.
* **Fail-Closed Policy Compiler:** Mathematical clamping: $\text{Authorized} \le \min(\text{Intent}, \text{Cap}, \text{Policy}, \text{Band}, \text{Capacity})$. Agents can propose, but cannot alter authorized recipient addresses, inflate repayment amounts, or bypass human-signed EIP-712 limits.
* **Simulate-First Execution Kernel:** Zero-revert guarantee. Every call is dry-run through KeeperHub's simulation engine (`simulate: true`) before broadcast. Live execution (`simulate: false`) routes via Turnkey MPC relayers with monotonic nonces and idempotency keys.
* **11-Point Proof of Authorized Agency (PoAA):** Cryptographic verification matrix asserting grant hash integrity, owner approval, policy bounds, dual receipts (KeeperHub + BaseScan), and post-rescue debt delta.
* **Append-Only Tamper-Evident Audit Ledger:** Blockchain-style SHA-256 hash-chained JSONL ledger recording all events from discovery to settlement.

---

## 4. Primary User Journeys & UI Surfaces
1. **Hero & Command Center (`/` and `/overview`):** High-impact operational summary displaying live monitored positions, desk reserve capacity, automated tick triggers, and live protection lifecycle progress.
2. **Borrower Position Monitor (`/positions`):** Real-time Aave V3 position scanner displaying collateral USD, debt USD, liquidation threshold, LTV, and dynamic color-coded Health Factor gauge.
3. **Rescue Grants Desk (`/grants`):** Active grant management portal showing proposed grants, 1-click human EIP-712 arming, preflight simulation gas checks, and grant revocation.
4. **Execution Telemetry (`/executions`):** Comprehensive record of on-chain executions through KeeperHub, linking to live BaseScan transaction hashes and Turnkey relayer receipts.
5. **Cryptographic Audit Ledger (`/audit`):** Interactive visualization of the SHA-256 hash-chained ledger, allowing judges to inspect event provenance (`CHAIN FACT`, `KEEPERHUB FACT`, `AGENT OUTPUT`).
6. **Public Independent Verifier (`/verify`):** Standalone zero-knowledge verifier allowing any external party to paste a PoAA JSON bundle and verify all 11 security invariants in milliseconds.
7. **Diagnostics & Operator Console (`/settings`):** Network diagnostics, KeeperHub key scopes, spend caps, RPC block latencies, and operator credential management.
8. **Interactive Documentation (`/docs`):** Complete protocol architecture specifications, math formulas, threat models, and CLI reference.

---

## 5. Non-Negotiable Invariants & Constraints
* **ZERO Mocks in Production:** All position scans, simulations, and transactions must query real contracts on Base Sepolia (`84532`) and real KeeperHub endpoints.
* **No Breaking Changes to DOM / API Bindings:** All element IDs (`#btn-scan`, `#btn-tick`, `#btn-approve`, `#btn-dry`, `#btn-execute`, `#btn-verify`, `#chainChip`, etc.) and event handlers must remain completely functional.
* **Accessibility & Responsiveness:** Clean reflow across mobile (375px), tablet (768px), and widescreen desktop (1440px+).
* **Strict Performance:** Fast initial load, zero cumulative layout shift (CLS), smooth micro-interactions without heavy external UI dependencies.
