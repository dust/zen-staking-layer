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
- `script/DeployZenStakerUpgradeable.s.sol` — Deploys `IdentityEarningPowerCalculator`,
  the `ZenStakerUpgradeable` implementation, and the `ERC1967Proxy` in one run.
- `script/UpgradeZenStakerUpgradeable.s.sol` — Upgrades an existing proxy to a
  new `ZenStakerUpgradeable` implementation. Reads `PROXY_ADDRESS`,
  `ZEN_TOKEN_ADDRESS`, and `PRIVATE_KEY` (admin) from environment; asserts the
  caller is the current admin before broadcasting; emits no on-chain state
  changes beyond the ERC-1967 implementation slot update.

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

---

## ZenStakerUpgradeable — UUPS upgrade layer

### What changed

`src/ZenStakerUpgradeable.sol` is a new file. **No existing files were
modified.** `Staker.sol`, `StakerPermitAndStake.sol`, `DelegationSurrogate.sol`,
and all audited base contracts are untouched.

### New inheritance

```
ZenStakerUpgradeable
├── Staker                  (audited, unchanged)
├── StakerPermitAndStake    (audited, unchanged)
├── Initializable           (@openzeppelin/contracts v5, audited by OZ)
└── UUPSUpgradeable         (@openzeppelin/contracts v5, audited by OZ)
```

`Initializable` and `UUPSUpgradeable` are both from `@openzeppelin/contracts`
v5.0.2, the same dependency already audited as part of the ZenStaker scope.
No new external dependencies were added.

### Entire new audit surface (3 items)

| Item | Size | Description |
|------|------|-------------|
| `constructor(IERC20 _token)` | 5 lines | Sets `REWARD_TOKEN`, `STAKE_TOKEN`, `MAX_CLAIM_FEE` immutables; calls `_disableInitializers()` to permanently lock the implementation contract. `address(1)` is passed as a placeholder to satisfy the non-zero checks in `Staker`'s constructor — these values are written to the implementation's own storage, which is never accessed through a proxy. |
| `initialize(address, IEarningPowerCalculator, uint256)` | 6 lines | Replaces the constructor for proxy-side state setup. Calls existing internal setters `_setAdmin`, `_setEarningPowerCalculator`, `_setMaxBumpTip`, and `_setClaimFeeParameters` — the same setters the original `Staker` constructor calls. Protected by the `initializer` modifier (can be called exactly once). |
| `_authorizeUpgrade(address)` | 2 lines | Overrides the OZ hook that gates `upgradeToAndCall`. Delegates entirely to `_revertIfNotAdmin()`, the same admin check already used throughout `Staker`. Upgrade authority is exclusively the `admin` address (Horizen multisig). |

Everything else in `ZenStakerUpgradeable.sol` — the `surrogates` mapping,
`_fetchOrDeploySurrogate`, and the five view helpers — is a verbatim copy from
`ZenStaker.sol` with no behavioural differences.

### Storage layout

Proxy storage slots 0–15 are identical to `ZenStaker`. OZ's `Initializable`
uses ERC-7201 namespaced storage (`keccak256("openzeppelin.storage.Initializable") - 1`),
so it occupies a non-sequential slot that cannot collide with the sequential
Staker layout. The ERC-1967 implementation pointer lives at
`keccak256("eip1967.proxy.implementation") - 1`, also non-sequential.

### Proxy pattern

Deploy via `ERC1967Proxy` (already in `@openzeppelin/contracts` v5):

1. Deploy `ZenStakerUpgradeable(zenToken)` — implementation.
2. Deploy `ERC1967Proxy(implementation, abi.encodeCall(initialize, (admin, calculator, 0)))` — proxy.
3. All user and admin interactions go to the **proxy address**, which delegatecalls to the implementation.
4. To upgrade: admin calls `proxy.upgradeToAndCall(newImpl, "")`.

### What was NOT changed

- `Staker.sol` — untouched
- `ZenStaker.sol` — untouched (non-upgradeable version preserved)
- `DelegationSurrogate.sol` — untouched
- All extension contracts — untouched
- All interfaces — untouched
- Write-path logic (stake, withdraw, claim, notifyRewardAmount) — untouched
- Storage layout of existing slots — untouched
