# BULWARK v0.1.0 — Deterministic Aave Backstop on KeeperHub

**BULWARK** is the autonomous, state-bound backstop economy for live Aave positions, executed deterministically by KeeperHub with cryptographic Proof of Authorized Agency (PoAA).

## What's Included

- **`@bulwark/core`** (SDK v0.1.0):
  - Pure TypeScript zero-dependency core with hand-rolled Keccak-256 and Aave V3 ABI encoding.
  - Verified KeeperHub REST API client with automatic idempotency, rate-limit backoff, and Bearer token redaction.
  - RescueGrant state machine with canonical JSON hashing and atomic ledger persistence.
  - Bounded Underwriter counterfactual ladder and Bulwark premium curve math.
  - Clamp-only Policy Compiler that deterministically bounds agent intent to live health factor bands.
  - Dual-truth receipt verification (KeeperHub receipts + independent RPC lookups).
  - 11-Check Proof of Authorized Agency (PoAA) engine.
- **`@bulwark/cli`** (`bulwark` v0.1.0):
  - Unified command-line interface with provenance chips on every fact (`doctor`, `positions scan`, `grants propose/list/show/approve/revoke`, `grants dry`, `grants execute`, `workflow compile`, `desk tick`, `proof export`, `proof verify`, `audit export`, `keys check`).
- **`@bulwark/agent`** (`bulwark-agent` v0.1.0):
  - Minimal streamable-HTTP MCP client supporting JSON-RPC 2.0 and Server-Sent Events over `https://app.keeperhub.com/mcp` and `/mcp/public`.
  - Real capability discovery and schema validation.
- **`@bulwark/web`** (Ops Console v0.1.0):
  - Zero-scroll operations console with live position telemetry and internal panel scrolling.
  - Public `/verify` standalone portal for independent 11-check PoAA bundle verification.

## Release Assets & Integrity

| Asset | SHA-256 Checksum |
|---|---|
| `bulwark-core-0.1.0.tgz` | `fa024a0da0bdd85f007f169c3035cad811285b6b3ce2f49add1a632a53c75578` |
| `bulwark-cli-0.1.0.tgz` | `dcf3148bcd6c10a3eb8096b24e915c9db76a2b41641b34ab2d7cb2b12ba14f5c` |

### Integrity Verification

Verify the downloaded tarballs before installing:

```bash
sha256sum -c CHECKSUMS.txt
```

### Installation from Release Assets

```bash
# Install CLI globally from release tarball
npm install -g ./release-artifacts/bulwark-cli-0.1.0.tgz

# Or install Core SDK in your local project
npm install ./release-artifacts/bulwark-core-0.1.0.tgz
```
