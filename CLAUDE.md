# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This monorepo consists of:
1. **Solidity Smart Contracts (`src/`, `test/`)**: A Foundry-based workspace containing the base staking contract (`Staker`), Horizen-specific staking deployment (`ZenStaker`), and the liquid staking layers (`StLighter`, `LtZEN`).
2. **Next.js Frontend (`ltzen-frontend/`)**: dApp for the liquid staking protocol, utilizing App Router, wagmi v3, viem, RainbowKit, and Tailwind v4.
3. **Goldsky Subgraph (`subgraphs/`)**: GraphQL indexing service for parsing and exposing ZenStaker chain events.

---

## Commands

### Smart Contracts (Foundry)
```bash
# Build & Compilation
forge build                         # compile contracts
forge clean                         # clean build cache

# Testing
forge test                          # run all tests
FOUNDRY_PROFILE=lite forge test     # fast local iteration (optimizer off, low fuzz)
forge test --match-test testName -vvv # run single test by name
forge test --match-contract ZenStakerTest # run single contract test
forge test --match-path test/StLighter.t.sol # run tests in specific file
# Run tests excluding specific fuzz tests failing due to via_ir codegen timestamp warp
forge test --no-match-test testFuzz_UpdatesExistingDelegateScore

# Gas Reporting & Coverage
make gas                            # run gas report (uses --isolate)
# Run coverage (requires --ir-minimum for stLighter's via_ir requirement)
forge coverage --ir-minimum --no-match-test testFuzz_UpdatesExistingDelegateScore --report summary

# Formatting & Linting
scopelint check                     # format and lint check (CI uses this, NOT forge fmt)
scopelint fmt                       # auto-format codebase (scopelint rules)
```

### End-to-End Tests
```bash
npm run e2e                         # run full E2E staking test suite
npm run e2e:anvil                   # run E2E suite spinning up local Anvil node
```

### Next.js Frontend (`ltzen-frontend/`)
```bash
cd ltzen-frontend
npm install                         # install dependencies
npm run dev                         # spin up frontend dev server (http://localhost:3000)
npm run build                       # production build (M0 acceptance gate)
npm run lint                        # run ESLint checks
npm run sync-abi                    # copy StLighter.json and LtZEN.json from root abi/ to src/abi/
```

### Self-hosted deploy (`deploy/`)
```bash
cd deploy
cp .env.example .env                # fill secrets + NEXT_PUBLIC_* + RRELAYER_*
make release                        # build frontend image + force-recreate stack
# make force-recreate BUILD=1 | make logs | make gen-api-key
```
Unified compose: external edge (`staking.lighter.im`) → frontend → internal rrelayer. See `deploy/README.md`.

### Goldsky Subgraph (`subgraphs/`)
```bash
cd subgraphs
npm install                         # install packages
graph codegen                       # generate schema and mapping models
graph build                         # compile subgraph

# Local Graph Node Stack (docker-based)
docker compose up -d                # start local node, IPFS, and Postgres
npm run create-local                # register subgraph slot locally
npm run deploy-local                # deploy compiled subgraph to local node
docker compose down -v              # stop and wipe local subgraph volumes

# Goldsky Deployment
goldsky login                       # login to Goldsky with API key
goldsky subgraph deploy <name>/<v> --path . # deploy to Goldsky
```

---

## High-Level Architecture

### Core & ZenStaker Layer
1. **Staker Core (`src/Staker.sol`)**: Abstract contract defining Synthetix-style reward streaming where users deposit tokens to earn dynamic rewards.
2. **ZenStaker (`src/ZenStaker.sol`)**: Inherits `Staker` + `StakerPermitAndStake` extensions. Disables claims fees, uses a non-voting `ZenDelegationSurrogate` (since delegation is out of scope), and exposes view helpers to minimize RPC roundtrips for indexing.

### Liquid Staking Layer (`src/stlighter/`)
1. **StLighter (`src/stlighter/StLighter.sol`)**: A pooled liquid staking contract acting as the **single depositor** on behalf of all users inside `ZenStaker`. It mints `ltZEN` shares to users, compounds rewards automatically back into the pool, and processes immediate withdrawals.
   * **UUPS Upgradeable**: Deployed via ERC1967Proxy. The proxy address holds ownership of the ZenStaker deposit.
2. **LtZEN (`src/stlighter/LtZEN.sol`)**: The liquid-staking yield-bearing representation token. It is a standard ERC20 token featuring:
   * **LayerZero v2 OFT (Omnichain Fungible Token)**: Capable of mint-and-burn cross-chain transfers between Horizen (hub) and Base (spoke) networks.
   * **EIP-2612 Permit**: Built-in support for gasless approvals.
   * **Minter Access**: Controlled by a swappable `minter` address (pointing to the `StLighter` proxy on Horizen).

### Key Technical Rules & Safeguards
* **Audit Constraint (`AUDIT_DELTA.md`)**: The base staking code (`Staker.sol`, extensions) tracks audited `withtally/staker` v1.0.1. Do NOT modify write-path logic or storage layouts in base contracts. Any modifications must be additive, declared, and updated in `AUDIT_DELTA.md`.
* **Global bookkeeping with `issuedShares`**: Standard ERC4626 contracts use `totalSupply()` for share calculations. However, since `LtZEN` is an OFT, cross-chain transfers `burn` tokens on Horizen and `mint` on Base, shifting `totalSupply()` per chain while aggregate pool deposits remain static. Thus, `StLighter.sol` tracks and utilizes `issuedShares` (only modified during true deposit/redeem actions) as the global denominator for exchange rate and share conversions.
* **DECIMALS_OFFSET = 3**: `StLighter` incorporates an ERC4626-style virtual asset offset (`DECIMALS_OFFSET = 3`) to mitigate inflation attacks. Users' `ltZEN` shares are offset by 10³ from raw `ZEN` amounts. Frontends must call `convertToAssets(balance)` to display a depositor's true convertible `ZEN` balance.

---

## Code & Development Conventions

### Solidity Configuration
* **Version**: `0.8.28`, `evm_version = paris`.
* **via_ir**: Enabled globally to accommodate the LayerZero OFT inheritance chains.
* **Formatting**: 2-space indentation, double quotes, attributes-first multiline function headers, 100-character column limits (enforced by `scopelint`).
* **Custom Errors**: Namespaced as `ContractName__ErrorName`.

### Frontend Guidelines (`ltzen-frontend/`)
* **Environment**: Expects `NEXT_PUBLIC_WC_PROJECT_ID` (WalletConnect ID) and proxy addresses (`NEXT_PUBLIC_HORIZEN_*_ADDRESS` & `NEXT_PUBLIC_BASE_LTZEN_ADDRESS`).
* **Relaying Models**: Supports Direct signing (DirectContractRelayer), BFF + rrelayer (via `/api/relay`), or mock simulation based on env flags.
