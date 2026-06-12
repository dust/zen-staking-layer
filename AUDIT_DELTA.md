# Audit Delta — ZenStaker

## Audited base

- Repository: withtally/staker
- Tag: v1.0.1
- Commit hash: b5b6f98daf53cf1d678ab3cc219223890b5cda3b
- Audits:
  - Sherlock audit contest (Nov 2024): sherlock-audit/2024-11-tally
  - Offbeat Security: private audit
  - Cantina: public contest
  - UniStaker (foundation): Uniswap Foundation audits (multiple rounds)

## Changes made

All changes are **additive or purely declarative**. No write-path logic was altered.
No storage layout was changed.

### New files

- `src/ZenStaker.sol` — Concrete implementation. Inherits audited `Staker`
  and `StakerPermitAndStake`. Contains `ZenDelegationSurrogate`, a minimal
  non-voting concrete implementation of `DelegationSurrogate` that holds
  staked tokens without delegating any governance voting power. Adds
  view-only helper functions (listed below). No overrides of any
  state-changing functions.

### Modified in Staker.sol

| Change | Kind | Behavioral impact |
|--------|------|-------------------|
| `StakeDeposited.owner` → `indexed` | Event schema only | None — EVM log layout changes; no opcode or storage change |
| `StakeWithdrawn.owner` → `indexed` | Event schema only | None — EVM log layout changes; no opcode or storage change |

Adding `indexed` to an event parameter moves it from the log data field to a topic slot. It does not alter gas costs for any write path, does not modify any storage variable, and does not change any function's observable behaviour. Off-chain consumers (indexers, subgraphs) must update their ABI to reflect the new layout.

### New view functions added to ZenStaker.sol

| Function | Type | State changes | Purpose |
|----------|------|---------------|---------|
| `getDepositInfo(depositId)` | external view | None | Single deposit read helper |
| `getDepositsInfo(depositId[])` | external view | None | Batch deposit read helper |
| `getGlobalState()` | external view | None | Dashboard data aggregator |
| `getDepositorSummary(address)` | external view | None | Per-user totals (no unclaimed rewards) |
| `getDepositorFullSummary(address, depositId[])` | external view | None | Per-user totals including unclaimed rewards across all deposits |

### New deployment scripts (off-chain tooling only)

- `script/DeployZenStaker.s.sol` — Foundry deployment script.
- `script/ConfigureRewardNotifier.s.sol` — Admin post-deploy script to
  enable a reward notifier.

### New test files

- `test/ZenStaker.t.sol` — Integration tests for ZenStaker.

### What was NOT changed

- `Staker.sol` (GovernanceStaker) — event schema only (see above); all functions, storage, and logic untouched
- `DelegationSurrogate.sol` — untouched
- `DelegationSurrogateVotes.sol` — untouched
- All extension contracts — untouched
- All interfaces — untouched
- `src/calculators/IdentityEarningPowerCalculator.sol` — already present in
  the audited base; used as-is without modification
- Reward notification logic — untouched
- Staking, withdrawal, and claim logic — untouched
- Storage layout — untouched

### Audit implications

The `indexed` additions to `StakeDeposited` and `StakeWithdrawn` change only
how the EVM encodes the log entry (topic vs. data field). The function bodies,
storage layout, and all observable on-chain behaviour are identical to the
audited version. These changes do not affect any invariant covered by prior
audits; however, any auditor diff should verify that the log layout change is
intentional.

The new view functions are stateless reads with no side effects and require no
re-audit of the core contracts. `ZenDelegationSurrogate` contains no logic
beyond the `DelegationSurrogate` base constructor. `IdentityEarningPowerCalculator`
is a pure passthrough already present in the audited repository.
