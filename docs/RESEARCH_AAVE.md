# Aave V3 — Verified Facts for BULWARK (2026-09-13)

> Sources: aave.com docs, github.com/aave (+ bgd-labs address book endorsed by Aave docs), DefiLlama API.
> Tags: VERIFIED / OBSERVED / INFERRED / UNVERIFIED. Evidence URLs inline.

## 1. Liveness (the "live project" requirement)

- Aave V3 TVL **$17,475,061,357** (2026-09-13) — VERIFIED via https://api.llama.fi/tvl/aave-v3
- Production V3 markets with official subgraphs: Ethereum, Polygon, Avalanche, Arbitrum, Optimism, **Base**, and ~15 more —
  VERIFIED https://github.com/aave/protocol-subgraphs ("Production networks")
- **Sepolia (11155111) testnet market is active**: official docs — app.aave.com testnet mode + faucet.
  VERIFIED https://aave.com/docs/aave-v3/smart-contracts/testing-and-debugging

## 2. Contract addresses (from Aave-docs-endorsed address book)

Registry: https://github.com/bgd-labs/aave-address-book (endorsed at https://aave.com/docs/resources/addresses).

| Chain | Pool | PoolAddressesProvider | AaveProtocolDataProvider |
|---|---|---|---|
| **Sepolia 11155111** | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` | `0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A` | `0x3e9708d80f7B3e43118013075F7e95CE3AB31F31` |
| **Base 8453** | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D` | `0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A` |
| Ethereum 1 (ref) | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` | `0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e` | `0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD` |

**Correction vs naive assumptions**: `getUserAccountData` lives on the **Pool** (interface `IPool`), NOT on the
PoolDataProvider. DataProvider exposes per-reserve views (`getUserReserveData`). VERIFIED
(https://aave.com/docs/aave-v3/smart-contracts/pool, https://aave.com/docs/aave-v3/smart-contracts/view-contracts).

## 3. Reading positions

```solidity
// IPool — on the Pool proxy
function getUserAccountData(address user) external view returns (
  uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase,
  uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor);
```

- Units (INFERRED from aave-v3-core code, to be confirmed against `PoolAddressesProvider.BASE_CURRENCY_UNIT()`
  at runtime): collateral/debt in market base currency (USD-quoted markets → 8 decimals); thresholds/ltv in
  **bps (1e4)**; **healthFactor in WAD (1e18)** — HF < 1e18 ⇒ liquidatable; no debt ⇒ `type(uint256).max`.
- Per-reserve detail: `AaveProtocolDataProvider.getUserReserveData(asset, user)` → aTokenBalance,
  variableDebtTokenBalance, usageAsCollateralEnabled, … VERIFIED.
- Official GraphQL: `https://api.v3.aave.com/graphql` (AaveKit) — VERIFIED
  (https://aave.com/docs/aave-v3/getting-started/graphql); rate limits UNVERIFIED.

## 4. Health factor & liquidation semantics

- Formula (VERIFIED, docs + GenericLogic.sol): `HF = totalCollateral × avgLiquidationThreshold / totalDebt` (1e18 precision).
- Liquidatable when HF < 1. Liquidation: `liquidationCall(collateralAsset, debtAsset, user, debtToCover, receiveAToken)`
  — anyone can call; liquidator keeps a per-reserve **liquidation bonus**; **close factor 50%** normally
  (docs https://aave.com/docs/aave-v3/smart-contracts/pool); app help adds a 100% close-factor tier when HF ≤ 0.95 or
  position < $2,000 — OBSERVED (https://aave.com/help/borrowing/liquidations), per-market V3.2 extension UNVERIFIED.

## 5. Rescue transactions (exact, VERIFIED from IPool.sol + docs)

```solidity
function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
function withdraw(address asset, uint256 amount, address to) external returns (uint256);
function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256);
function repayWithPermit(...) / repayWithATokens(...) / supplyWithPermit(...)  // permit flows exist
```

- `repay`: burns `onBehalfOf`'s debt tokens; funds pulled from **msg.sender**; **`amount = type(uint256).max` repays ALL debt**;
  docs: `interestRateMode` **always 2** (variable). VERIFIED.
- `withdraw`: burns aTokens, sends underlying to `to`; `amount = type(uint256).max` = full balance. VERIFIED.
- Approvals: `ERC20.approve(pool, amount)` on the underlying before supply/repay by the funding party. VERIFIED.

**BULWARK rescue economics (design consequence)**: with `msg.sender = backstop desk wallet` (the KeeperHub org wallet)
and `onBehalfOf = position owner`, a repay is a **third-party rescue**: the desk spends its own capital to burn the owner's
debt. That is exactly the backstop-economy value movement — desk capital → owner debt reduction — with the desk's risk
bounded by the RescueGrant cap.

## 6. Tooling

- Official TS SDK: **`@aave/client` 6.5.0** (AaveKit; viem/ethers executors, permit support) — VERIFIED (npm + docs).
- `@aave/math-utils` 1.38.0, `@aave/core-v3` 1.19.3, `@bgd-labs/aave-address-book` 4.44.22 — VERIFIED on npm.
- **`@aave/contract-getters` does NOT exist on npm** — VERIFIED (registry 404). BULWARK hand-encodes the two read calls
  (zero deps) and lets KeeperHub encode writes (`functionName` + `functionArgs`).

## 7. Known competitors (detail in archive/RESEARCH_COMPETITIVE.md)

DeFi Saver Automation (Auto Repay / stop-loss, keeper bots, closed), Summer.fi (merging into DeFi Saver),
Instadapp DSA guardians, Aave Umbrella (protocol-level deficit coverage, NOT user rescue), Gelato's Aave
health-factor maintenance grant, Chainlink Automation (deterministic, no agents).

## 8. Open uncertainties

1. Sepolia market maintenance status is implicit (docs + faucet live) — re-verify at demo time.
2. `BASE_CURRENCY_UNIT()` decimals per market — confirm on-chain before formatting USD figures.
3. Close-factor 100% tier per-chain implementation — UNVERIFIED.
4. AaveKit GraphQL key/rate limits — UNVERIFIED (not needed for the core loop; on-chain reads are canonical).
