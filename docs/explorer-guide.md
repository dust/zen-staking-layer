# ZenStaker — Block Explorer Interaction Guide

This guide explains how to perform stake, claim, and withdraw operations directly from the
block explorer's **Read/Write Contract** tabs, without a frontend. It targets users who want to
interact with the contracts manually (e.g. for testing, admin operations, or as a fallback UI).

The staking system uses the same ZEN token for both staking and rewards (ZEN-on-ZEN staking).

---

## 1. Contracts

| Contract | Testnet | Mainnet |
|---|---|---|
| ZenStaker | [0x6BF7CF29a8bcE11Aa62Cf593d165C244fA4d3E31](https://horizen-testnet.explorer.caldera.xyz/address/0x6BF7CF29a8bcE11Aa62Cf593d165C244fA4d3E31?tab=read_write_contract) | (TBD) |
| RewardAccumulator | [0x06f5555fee73EDdc385b6d76FE00DB2D96ccDaE8](https://horizen-testnet.explorer.caldera.xyz/address/0x06f5555fee73EDdc385b6d76FE00DB2D96ccDaE8?tab=read_write_contract) | (TBD) |
| ZEN Token | [0xb06EC4ce262D8dbDc24Fac87479A49A7DC4cFb87](https://horizen-testnet.explorer.caldera.xyz/address/0xb06EC4ce262D8dbDc24Fac87479A49A7DC4cFb87?tab=read_write_contract) | (TBD) |

> **Note on amounts:** ZEN has 18 decimals. Every amount entered in the explorer's write form
> must be expressed in the token's smallest unit (wei), e.g. `1000000000000000000000` = 1,000
> ZEN. Most explorers show a helper hint under the input field to convert from a human-readable
> value.

---

## 2. Before you start

1. Open the contract's link from the table above.
2. Click **Connect wallet** (top right of the explorer page) and connect the account you want to
   operate with.
3. Use the **Write Contract** tab for any operation that changes state (requires a transaction
   and gas). Use the **Read Contract** tab for free, view-only calls (no wallet/gas needed, but
   useful to check state before/after a write).

---

## 3. Staking

Staking is a two-step process: **approve** the ZEN token, then **stake** on the ZenStaker
contract.

### 3.1 Approve (on the ZEN Token contract)

Go to the **ZEN Token** contract → **Write Contract** tab → `approve`:

| Field | Value |
|---|---|
| `spender` | ZenStaker address (`0x6BF7...D3E31` on testnet) |
| `amount` | Amount to stake, in wei |

Submit and wait for the transaction to confirm before staking.

### 3.2 Stake (on the ZenStaker contract)

Go to the **ZenStaker** contract → **Write Contract** tab. There are two overloads of `stake`:

**`stake(uint256 _amount, address _delegatee)`** — creates a new deposit; the caller becomes both
owner and claimer.

| Field | Value |
|---|---|
| `_amount` | Amount to stake, in wei (must be ≤ approved amount) |
| `_delegatee` | Address to receive governance voting power. Use your own address if you don't want to delegate to someone else. Cannot be the zero address. |

**`stake(uint256 _amount, address _delegatee, address _claimer)`** — same as above, but lets you
set a different address as the rewards claimer (e.g. a vesting contract).

| Field | Value |
|---|---|
| `_amount` | Amount to stake, in wei |
| `_delegatee` | Address to receive governance voting power |
| `_claimer` | Address allowed to call `claimReward` for this deposit |

Both variants return a `depositId` — find it by inspecting the transaction receipt's
`StakeDeposited` event (topic `depositId`), or via `getDepositorSummary` / `StakeDeposited` events
on the Read tab / explorer's "Logs" tab.

### 3.3 Add to an existing deposit — `stakeMore`

Use this to top up an existing deposit while keeping its current delegatee and claimer. Only the
deposit owner can call it. Remember to `approve` the additional amount first (step 3.1).

| Field | Value |
|---|---|
| `_depositId` | ID of the existing deposit |
| `_amount` | Additional amount to stake, in wei |

---

## 4. Claiming rewards

On the **ZenStaker** contract:

### 4.1 Check pending rewards (optional, Read Contract tab)

`unclaimedReward(_depositId)` returns the rewards accrued so far for a deposit (in wei), without
spending gas.

### 4.2 Claim — `claimReward` (Write Contract tab)

| Field | Value |
|---|---|
| `_depositId` | ID of the deposit to claim rewards from |

Callable by the deposit's **owner** or its **claimer**. Rewards are sent to whichever of those two
addresses calls the function — there are no claim fees. This must be called once per deposit; there
is no "claim all" batch function on-chain.

---

## 5. Withdrawing stake

On the **ZenStaker** contract → **Write Contract** tab → `withdraw`:

| Field | Value |
|---|---|
| `_depositId` | ID of the deposit to withdraw from |
| `_amount` | Amount to withdraw, in wei (use the deposit's current balance to withdraw everything — check it first via `getDepositInfo` on the Read tab) |

Only the deposit owner can withdraw, and stake is always sent back to the caller.

> **Important:** withdrawing does **not** automatically claim pending rewards. If you don't want
> to leave rewards behind, call `claimReward` (section 4.2) **before** withdrawing.

---

## 6. Managing a deposit (optional/advanced)

Both callable only by the deposit owner, on the **ZenStaker** contract → **Write Contract** tab:

- **`alterDelegatee(uint256 _depositId, address _newDelegatee)`** — changes who receives the
  governance voting power of the staked tokens. Cannot be the zero address.
- **`alterClaimer(uint256 _depositId, address _newClaimer)`** — changes who (besides the owner)
  can call `claimReward` on this deposit. Cannot be the zero address.

---

## 7. Useful read-only calls

On the **ZenStaker** contract → **Read Contract** tab (free, no wallet needed):

| Function | Returns |
|---|---|
| `getGlobalState()` | Protocol-wide totals: total staked, total earning power, reward rate, reward end time, etc. |
| `getDepositInfo(_depositId)` | Balance, owner, earning power, delegatee, claimer, unclaimed rewards for one deposit |
| `getDepositsInfo(_depositIds[])` | Same as above, batched for multiple deposits |
| `getDepositorSummary(_depositor)` | Total staked and earning power across all of an address's deposits |
| `getDepositorFullSummary(_depositor, _depositIds[])` | Same, plus total unclaimed rewards (requires the deposit IDs) |
| `unclaimedReward(_depositId)` | Rewards accrued so far for a single deposit |

> Deposit IDs are not enumerable on-chain — retrieve them from the `StakeDeposited` event logs
> (filter by your address) in the explorer's "Logs" tab, or from your own records.

---

## 8. Appendix: funding rewards via RewardAccumulator

These operations are relevant to the Foundation, partners, and infra operators funding the reward
pool — not to regular stakers. See [initial_setup.md](./initial_setup.md) for the full picture.

On the **RewardAccumulator** contract → **Write Contract** tab:

- **`transferAndNotifyRewards(uint256 amount)`** — pulls `amount` of ZEN from the caller (requires
  a prior `approve` on the ZEN Token contract, with the RewardAccumulator address as spender) and
  records it as accumulated rewards for the current window.
- **`notifyAlreadyTransferredRewards(uint256 amount)`** — records `amount` of ZEN that was already
  sent to the RewardAccumulator's address via a plain transfer.
- **`sendRewardsToStaker()`** — callable by **anyone** once the current window has elapsed. Flushes
  the accumulated rewards to the ZenStaker contract, starting a new 30-day distribution period.

On the **RewardAccumulator** contract → **Read Contract** tab:

- **`nextRewardTime()`** — timestamp from which `sendRewardsToStaker()` becomes callable.
