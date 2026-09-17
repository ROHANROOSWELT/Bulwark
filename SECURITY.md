# Security Policy & Architecture Guide — BULWARK

BULWARK is an autonomous, state-bound liquidation backstop economy for Aave V3 built on KeeperHub. Because BULWARK coordinates autonomous agency, smart contract execution, and liquidity desk underwriting, security is an invariant, not an afterthought.

---

## 1. Supported Versions

Security updates, cryptographic vulnerability patches, and invariant audits are actively maintained for the following versions:

| Version | Status | Supported Until |
| :--- | :---: | :--- |
| **0.1.x (SDK & CLI)** | ✅ **Current Supported Release** | Active |
| **< 0.1.0** | ❌ Deprecated / Pre-release | No |

---

## 2. Core Security Architecture & Threat Model

BULWARK treats all off-chain agents—including its own Guardian and Gemini underwriter models—as potentially adversarial or compromised. The security model enforces **nine defense-in-depth layers**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               BULWARK SECURITY LAYERS                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. FAIL-CLOSED LOCK GATE     ──► Grayscale lock; no transaction runs unauthenticated.  │
│ 2. ZERO-STORAGE CUSTODY      ──► Private keys never written to disk, localStorage, DB. │
│ 3. LLM ISOLATION             ──► Advisory-only; all math & amounts computed in TS math.│
│ 4. CLAMP-ONLY POLICY         ──► Authorized = min(Intent, HumanCaps, Policy, Band).    │
│ 5. authorityHash ANCHORING   ──► Keccak-256 digest prevents payload or target tampering│
│ 6. SIMULATE-FIRST GATE       ──► Pre-flight dry-run asserts wouldRevert === false.     │
│ 7. IDEMPOTENCY GUARD         ──► Deterministic SHA-256 keys prevent double-execution.  │
│ 8. DUAL-RECEIPT FINALITY     ──► Cross-checks KeeperHub receipt against Base Sepolia.  │
│ 9. PROOF OF AUTHORIZED AGENCY──► 11-check cryptographic proof verifiable offline.     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### A. Guaranteed Zero-Storage & Private Key Protection
* **Zero Client-Side Persistence**: Private keys are **never** stored in `localStorage`, `sessionStorage`, IndexedDB, or web cookies. The client actively purges legacy authentication tokens on startup.
* **Transient In-Memory Address Derivation**: Private keys submitted via Option 2 (24/7 Autonomous Guardian) are processed exclusively in transient server memory using native Node.js elliptic-curve cryptography (`crypto.createECDH("secp256k1")`) to derive the uncompressed public key and Keccak-256 address hash. The raw key buffer is immediately scrubbed.
* **DOM Sanitization**: Input fields are permanently set to `type="password"`, `autocomplete="off"`, and `spellcheck="false"`. The DOM value is wiped to `""` the millisecond authentication completes.
* **Interactive Self-Custody Alternative**: Users who do not wish to input keys can use standard EIP-1193 browser wallets (MetaMask, Rabby, OKX) where private keys never leave the user's hardware/extension environment.

### B. Clamp-Only Policy Compiler
An AI model (or an adversarial prompt injection) can never elevate its own spending limits. The Policy Compiler mathematically clamps every action intent against immutable human constraints:

$$\text{AuthorizedAmount} \le \min \begin{cases} 
\text{AgentIntentAmount} \\
\text{GrantMaxAmount} \\
\text{ActiveHealthFactorBandCap} \\
\text{PolicyMaxPerRescue} \\
\text{DailyVelocityBudgetRemaining} \\
\text{DeskAvailableCapacity}
\end{cases}$$

Raising limits is structurally impossible. If an intent exceeds any boundary, it is clamped down to the lowest applicable ceiling.

### C. Cryptographic Authority Anchoring (`authorityHash`)
Every execution intent compiles into a deterministic 32-byte Keccak-256 hash:

$$\text{authorityHash} = \text{keccak256}(\text{grantId} \mathbin{\Vert} \text{bandIndex} \mathbin{\Vert} \text{intentHash} \mathbin{\Vert} \text{authorizedAmount} \mathbin{\Vert} \text{nonce})$$

If any parameter (target borrower, pool address, amount, or nonce) is modified between policy compilation and on-chain broadcast, the hash mismatches and KeeperHub execution aborts fail-closed.

### D. Simulate-First Dry-Run Gate
To prevent draining gas tokens on reverting transactions (e.g. if debt was repaid in the same block by another actor), BULWARK enforces a mandatory simulation gate:
1. `execute_contract_call` is first dispatched with `simulate: true`.
2. If `wouldRevert === true`, execution halts immediately. The grant is tagged `simulation_reverted` and zero on-chain gas is spent.
3. Only when `wouldRevert === false` does the relayer proceed to live broadcast (`simulate: false`).

### E. Idempotency & Replay Protection
Every mutation sent to KeeperHub includes a deterministic `Idempotency-Key` header computed as:

$$\text{IdempotencyKey} = \text{sha256}(\text{grantId} \mathbin{\Vert} \text{authorityHash} \mathbin{\Vert} \text{nonce})$$

Network retries or concurrent daemon workers cannot cause duplicate debt repayments or double-spends.

### F. Dual-Receipt Independent Finality
BULWARK does not blindly trust centralized relayers. Every on-chain execution receipt emitted by KeeperHub is independently verified against an external public RPC node (`eth_getTransactionReceipt` on Base Sepolia / Sepolia). Both receipts must match in transaction hash, block number, gas used, and event logs before state finality is granted.

### G. Proof of Authorized Agency (PoAA)
Every rescue generates an exportable, self-contained JSON bundle evaluated against 11 cryptographic and mathematical checks:
1. `GRANT_EXISTS`: Valid grant ID in ledger.
2. `GRANT_APPROVED`: Valid owner EIP-712 signature.
3. `GRANT_NOT_EXPIRED`: Execution timestamp $\le$ grant expiry.
4. `GRANT_NOT_INVALIDATED`: Invalidation flag is false.
5. `POSITION_MATCH`: Target borrower matches grant owner.
6. `HF_BELOW_THRESHOLD`: Pre-rescue Health Factor strictly $< 1.25$.
7. `INTENT_BOUNDED_BY_BAND`: Repayment amount $\le$ active band ceiling.
8. `INTENT_BOUNDED_BY_CAP`: Cumulative repayment $\le$ grant cap.
9. `COMPILATION_INTEGRITY`: `authorityHash` matches compiled intent.
10. `DRY_RUN_PASSED`: Pre-flight simulation status is `SUCCESS`.
11. `RECEIPT_CHAIN_MATCH`: KeeperHub receipt matches public RPC receipt.

The verification runs client-side in pure JavaScript with **zero server trust**.

---

## 3. Reporting a Vulnerability

We take the security of BULWARK and the funds protected on Aave V3 seriously. If you discover a security vulnerability, we appreciate your cooperation in disclosing it responsibly.

### Disclosure Guidelines
* **DO NOT** create a public GitHub issue for security vulnerabilities.
* **Email:** Send full technical details, proof-of-concept scripts, and reproduction steps to:  
  📬 **`prohanrooswelt@gmail.com`**
* Include:
  - Affected package (`@bulwark/core`, `@bulwark/agent`, `@bulwark/cli`, or `@bulwark/web`).
  - Step-by-step reproduction instructions or code snippet.
  - Potential impact assessment (e.g. fund loss, unauthorized execution, limit bypass, secret leakage).

### Response SLAs
* **Initial Acknowledgment:** Within **24 hours**.
* **Triage & Severity Assessment:** Within **48 hours**.
* **Remediation & Patch Release:** Critical vulnerabilities are patched within **72 hours**.

---

## 4. Safe Harbor Policy

We consider security research conducted in accordance with this policy to be authorized:
* Security researchers must make good-faith efforts to avoid data destruction, privacy violations, or degradation of live testnet services.
* Research should focus on synthetic or dedicated test accounts on **Base Sepolia (Chain ID: 84532)** or **Ethereum Sepolia (Chain ID: 11155111)**.
* Do not attempt to drain or exploit third-party user funds on mainnet protocols.
* If you act in good faith, we will not pursue legal action against you for research activities within these guidelines.
