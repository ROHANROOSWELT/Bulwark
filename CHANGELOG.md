# Changelog

All notable changes to BULWARK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-14

### Added
- **`@bulwark/core`**:
  - Hand-rolled Keccak-256 implementation (zero external crypto dependencies).
  - Aave V3 ABI encoder/decoder for `getUserAccountData`, `getReserveTokensAddresses`, `balanceOf`, `decimals`, `getPriceOracle`, and `getAssetPrice`.
  - Verified registry for Sepolia (11155111) and Base (8453) deployments.
  - KeeperHub REST API client with automatic idempotency headers, Bearer key redaction, and `simulate:true` safety checks.
  - RescueGrant state machine with canonical JSON hashing, state-bound conditions, and capacity ledger.
  - Policy Compiler: deterministic, clamp-only intent bounding with `authorityHash` binding.
  - Bounded Underwriter: counterfactual ladder, projected health factor math, and Bulwark premium curve.
  - Dual-truth receipt verification combining KeeperHub execution receipts and independent public RPC lookups.
  - Proof of Authorized Agency (PoAA) 11-check verification engine.
  - Execution reputation engine derived strictly from verified execution history.
- **`@bulwark/cli`**:
  - Full suite of commands with provenance labels: `doctor`, `positions scan`, `grants propose/list/show/approve/revoke`, `grants dry`, `grants execute`, `workflow compile`, `desk tick`, `proof export`, `proof verify`, `audit export`, `keys check`.
- **`@bulwark/agent`**:
  - Streamable-HTTP MCP client supporting JSON-RPC 2.0 and Server-Sent Events (SSE) against `/mcp` and `/mcp/public`.
  - Commands: `discover`, `validate`, `call`, and `guard`.
- **`@bulwark/web`**:
  - Zero-scroll operations console with live telemetry, four internally scrollable panels, and provenance chips.
  - Public standalone `/verify` portal for trustless, independent PoAA bundle validation.
- **Verification & Scripts**:
  - Automated smoke runner (`scripts/smoke.sh`).
  - Automated live proof runner (`scripts/live-proof.sh`).
  - Release packaging and checksum generator (`scripts/prepare-release.sh`, `scripts/release.sh`).
