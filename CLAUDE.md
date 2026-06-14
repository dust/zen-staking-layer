# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Foundry-based Solidity library for **Staker**, a configurable staking contract that distributes ERC20 rewards (forked from `withtally/staker` / ScopeLift). This repo layers a concrete Horizen deployment, **ZenStaker**, on top of the audited base. Staker is `abstract` by design: concrete deployments inherit it plus a chosen set of extensions and implement the constructor.

## Commands

```bash
forge build                 # compile (or: make build)
forge test                  # run all tests (or: make test)
forge test --match-test testName -vvv      # single test by name
forge test --match-contract ZenStakerTest  # single test contract
forge test --match-path test/ZenStaker.t.sol
make gas                    # write gas report to test/gas-reports/ (uses --isolate)
forge coverage --report summary            # coverage (CI requires >= 99.5%)
scopelint check             # lint + format check (CI uses this, NOT forge fmt)
scopelint fmt               # apply formatting
```

- **Profiles** (set via `FOUNDRY_PROFILE`): `default` (10M optimizer runs), `ci` (5000 fuzz / 1000 invariant runs), `coverage`, `lite` (optimizer off, low fuzz — use for fast local iteration).
- Tests requiring `MAINNET_RPC_URL` read it from env; copy `.env.template` to `.env`.
- Deploy ZenStaker: `forge script script/DeployZenStaker.s.sol` with env vars `ZEN_TOKEN_ADDRESS`, `ADMIN_ADDRESS`, `PRIVATE_KEY` (optional `MAX_BUMP_TIP`).

## Architecture

**Core staking flow** (`src/Staker.sol`): Synthetix-style reward streaming. Each deposit has an owner, balance, delegatee, claimer, and earning power. Rewards stream over a fixed period; a new reward restarts the duration and recomputes the rate. Reward share is proportional to earning power over time, scaled by `SCALE_FACTOR`. Stake/withdraw are instant (no lockup).

The system is composed from four swappable pieces:

1. **Staker** (abstract core) — deposit/withdraw/claim accounting. Concrete contracts inherit this plus extensions.
2. **Earning power calculator** (`src/calculators/`, implements `IEarningPowerCalculator`) — owner-swappable module deciding who earns and how fast. `IdentityEarningPowerCalculator` is a passthrough (earning power == staked balance); `BinaryEligibilityOracleEarningPowerCalculator` gates eligibility via an off-chain oracle score per delegatee.
3. **Reward notifiers** (`src/notifiers/`, implement `INotifiableRewardReceiver`) — authorized sources that tell Staker about incoming rewards. Variants: `TransferRewardNotifier`, `TransferFromRewardNotifier`, `MintRewardNotifier` (share `RewardTokenNotifierBase`).
4. **Delegation surrogates** (`src/DelegationSurrogate*.sol`) — Staker creates **one surrogate contract per delegatee** to hold that delegatee's staked tokens and forward voting power. `DelegationSurrogateVotes` delegates `ERC20Votes` power; ZenStaker uses a non-voting `ZenDelegationSurrogate`.

**Extensions** (`src/extensions/`) mix optional features into a concrete Staker via inheritance:
- `StakerDelegateSurrogateVotes` — per-delegatee voting surrogates for `ERC20Votes` tokens.
- `StakerPermitAndStake` — EIP-2612 permit-based staking.
- `StakerOnBehalf` — EIP-712 signature-authorized actions for third parties.
- `StakerCapDeposits` — global staked-amount cap.

**Deployment system** (`src/script/DeployBase.sol` + per-component deploy mixins): modular. A concrete deploy script overrides `_deployStaker`, `_deployEarningPowerCalculator`, `_deployRewardNotifiers`, and `_baseConfiguration`. The deployer must be the initial admin; the script then transfers admin to the configured address. `test/fakes/DeployBaseFake.sol` is the reference assembly.

## ZenStaker (the active work in this fork)

`src/ZenStaker.sol` = `Staker` + `StakerPermitAndStake`, with claim fees hard-disabled and a non-voting surrogate (governance delegation is out of scope for Phase 1; ZEN is both stake and reward token). It adds **only view helpers** (`getDepositInfo`, `getDepositsInfo`, `getGlobalState`, `getDepositorSummary`, `getDepositorFullSummary`) to reduce RPC round-trips for the Goldsky indexer/frontend.

**Audit constraint (read `AUDIT_DELTA.md` before touching base contracts):** this fork tracks audited `withtally/staker` v1.0.1. All changes so far are additive or declarative — no write-path logic, no storage layout changes. The only base modifications are `indexed` additions to `StakeDeposited.owner` and `StakeWithdrawn.owner` (log-layout only). Preserve this discipline: prefer adding to ZenStaker/new files over editing `Staker.sol` or other audited base/extension/interface contracts, and update `AUDIT_DELTA.md` if you must.

## Testing conventions

- `test/StakerTestBase.sol` is the shared base; harnesses in `test/harnesses/` expose internals; mocks/fakes in `test/mocks/` and `test/fakes/`.
- Invariant suite: `test/Staker.invariants.t.sol` with `test/helpers/Staker.handler.sol`. See `test/README.md` for the invariants and the handler's implemented/unimplemented action checklist.
- `[fuzz] include_storage = false` in `foundry.toml` is intentional — it stops the fuzzer from picking not-yet-deployed surrogate addresses as actors. Keep it.

## Conventions

- Solidity `0.8.28`, `evm_version = paris`. Formatting: 2-space tabs, 100-col lines, double quotes, `long` int types, attributes-first multiline function headers (enforced by `scopelint`, configured in `foundry.toml [fmt]`).
- Remapping: `staker-test/` → `test/`. Deps are git submodules in `lib/` (`forge-std`, `openzeppelin-contracts`); OZ is also referenced as `@openzeppelin/contracts` for Hardhat compatibility.
- Custom errors are namespaced `ContractName__ErrorName`.
