# ZenStaker Testnet QA Testing Guide

<<<<<<< HEAD
=======
> ⚠️ **Superseded deployment.** The addresses below belong to the retired
> `ZenStakerUpgradeable` QA deployment and are **not** the deployment covered
> by the bug bounty program. The current in-scope testnet deployment is the
> non-upgradeable **ZenStaker** at `0x6BF7CF29a8bcE11Aa62Cf593d165C244fA4d3E31`
> with the bridged **tZEN** token `0xb06EC4ce262D8dbDc24Fac87479A49A7DC4cFb87`
> (see [SECURITY.md](../SECURITY.md)). On the current deployment, rewards flow
> through the RewardAccumulator on a fixed schedule rather than via the
> admin-as-notifier flow described here, and tZEN has no public `mint`.
> <!-- TODO: rewrite this guide for the current deployment (tZEN via the
> testnet bridge, reward injection through RewardAccumulator) -->

>>>>>>> main
## Network & Contracts

| | |
|---|---|
| **Network** | Horizen Testnet |
| **Chain ID** | 2651420 |
<<<<<<< HEAD
| **RPC** | `http://horizen-testnet.rpc.caldera.xyz/http` |
=======
| **RPC** | `https://horizen-testnet.rpc.caldera.xyz/http` |
>>>>>>> main

| Contract | Address |
|---|---|
| TestToken (ERC20, public mint) | `0x38DbD13429Da34bCcb5343BD91C5152DEa825557` |
| IdentityEarningPowerCalculator | `0x4fc2f32c806b10595fE4C63db40Ae8Fd2027bf9A` |
| ZenStakerUpgradeable — **implementation** | `0x1E50532C984F35A56d6c1eD4298CC18f1364CE30` |
| ZenStakerUpgradeable — **proxy** ✅ use this | `0x7B4e9Fd36831CD08653cC72e5756fBb73Ab2D364` |
| Admin / Deployer | `0x75aC358b51cfBa290604C6dE0dADBa3B8b0791cc` |

> All user and admin interactions go to the **proxy address**. Never call the implementation directly.

---

## System Overview

```
TestToken (ERC20)
    │
    │  stake / stakeMore / withdraw
    ▼
ZenStakerUpgradeable (proxy)
    │                    ▲
    │  notifyRewardAmount│  tokens transferred first, then notify
    └────────────────────┘
         (admin acts as reward notifier in this testnet setup)
```

The staker streams rewards over a fixed 30-day window (`REWARD_DURATION`). Every time a new reward batch is notified, the window resets and the rate recalculates to include any leftover from the previous window.

Earning power in Phase 1 uses `IdentityEarningPowerCalculator`, which sets earning power equal to the staked balance. Every staker earns proportionally to their share.

---

## Prerequisites

All examples use `cast` from Foundry. Set these shell variables once:

```bash
<<<<<<< HEAD
RPC=http://horizen-testnet.rpc.caldera.xyz/http
=======
RPC=https://horizen-testnet.rpc.caldera.xyz/http
>>>>>>> main
TOKEN=0x38DbD13429Da34bCcb5343BD91C5152DEa825557
STAKER=0x7B4e9Fd36831CD08653cC72e5756fBb73Ab2D364
ADMIN_KEY=<deployer private key>          # 0x-prefixed
USER_KEY=<your test wallet private key>   # 0x-prefixed
MY_ADDRESS=<your test wallet address>
```

---

## Full Flow

### Phase 0 — Admin Setup (one-time, done by admin)

Before any rewards can flow, the admin must authorize a reward notifier address. For testnet simplicity, the admin wallet itself acts as the notifier.

#### Step 0.1 — Enable the admin as reward notifier

```bash
cast send $STAKER \
  "setRewardNotifier(address,bool)" \
  $MY_ADDRESS true \
  --rpc-url $RPC --private-key $ADMIN_KEY
```

**What it does:** registers `MY_ADDRESS` in the `isRewardNotifier` mapping. Only addresses in that mapping can call `notifyRewardAmount`.

**Event emitted:** `RewardNotifierSet(address indexed account, bool isEnabled)`

**Verify:**
```bash
cast call $STAKER "isRewardNotifier(address)(bool)" $MY_ADDRESS --rpc-url $RPC
# expected: true
```

---

### Phase 1 — Get Test Tokens

The TestToken has an unrestricted public mint. Anyone can call it.

#### Step 1.1 — Mint tokens to your wallet

```bash
cast send $TOKEN \
  "mint(address,uint256)" \
  $MY_ADDRESS 1000000000000000000000 \
  --rpc-url $RPC --private-key $USER_KEY
```

`1000000000000000000000` = 1 000 tokens (18 decimals).

**Verify:**
```bash
cast call $TOKEN "balanceOf(address)(uint256)" $MY_ADDRESS --rpc-url $RPC
```

---

### Phase 2 — Stake

Staking requires a prior ERC20 `approve`. The contract will `transferFrom` the tokens into a `DelegationSurrogate` contract (one per delegatee address, deployed lazily on first stake to that delegatee).

#### Step 2.1 — Approve the proxy to spend your tokens

```bash
cast send $TOKEN \
  "approve(address,uint256)" \
  $STAKER 1000000000000000000000 \
  --rpc-url $RPC --private-key $USER_KEY
```

#### Step 2.2 — Stake

```bash
cast send $STAKER \
  "stake(uint256,address)(uint256)" \
  500000000000000000000 $MY_ADDRESS \
  --rpc-url $RPC --private-key $USER_KEY
```

Parameters:
- `_amount` — tokens to stake (500 tokens here)
<<<<<<< HEAD
- `_delegatee` — address that receives governance weight (use your own address for testnet)
=======
- `_delegatee` — address that receives the deposit's surrogate delegation (non-voting in Phase 1; use your own address for testnet)
>>>>>>> main

Returns: `depositId` (a `uint256`). **Save this value** — you need it for every subsequent call.

**Alternative signature** (explicit claimer):
```solidity
stake(uint256 _amount, address _delegatee, address _claimer)
```
If not specified, `claimer == msg.sender`.

**Event emitted:** `StakeDeposited(address indexed owner, DepositIdentifier indexed depositId, uint256 amount, uint256 depositBalance, uint256 earningPower)`

**Verify deposit:**
```bash
cast call $STAKER \
  "getDepositInfo(uint256)(uint96,address,uint96,address,address,uint256)" \
  <depositId> --rpc-url $RPC
# returns: balance, owner, earningPower, delegatee, claimer, unclaimedRewards
```

---

### Phase 3 — Inject Rewards (Admin)

Before rewards can accrue, tokens must be transferred to the staker contract, then `notifyRewardAmount` must be called by an authorized notifier. Both steps are required.

#### Step 3.1 — Mint reward tokens to yourself (admin)

```bash
cast send $TOKEN \
  "mint(address,uint256)" \
  $MY_ADDRESS 10000000000000000000000 \
  --rpc-url $RPC --private-key $ADMIN_KEY
```

10 000 tokens as the reward pool.

#### Step 3.2 — Transfer reward tokens to the staker proxy

```bash
cast send $TOKEN \
  "transfer(address,uint256)" \
  $STAKER 10000000000000000000000 \
  --rpc-url $RPC --private-key $ADMIN_KEY
```

#### Step 3.3 — Notify the staker of the new reward

```bash
cast send $STAKER \
  "notifyRewardAmount(uint256)" \
  10000000000000000000000 \
  --rpc-url $RPC --private-key $ADMIN_KEY
```

**What it does:** resets the 30-day reward window and recalculates `scaledRewardRate`. The staker will distribute these tokens proportionally to all stakers over the next 30 days.

**Event emitted:** `RewardNotified(uint256 amount, address notifier)`

**Verify global state:**
```bash
cast call $STAKER \
  "getGlobalState()(uint256,uint256,uint256,uint256,uint256,uint256)" \
  --rpc-url $RPC
# returns: totalStaked, totalEarningPower, rewardRate, rewardEndTime,
#          lastCheckpointTime, rewardPerTokenAccumulated
```

---

### Phase 4 — Accrue & Check Rewards

Rewards accrue continuously per second from the moment `notifyRewardAmount` is called. There is no lock-up — you can check unclaimed rewards at any time.

#### Check unclaimed rewards for a deposit

```bash
cast call $STAKER \
  "unclaimedReward(uint256)(uint256)" \
  <depositId> --rpc-url $RPC
```

Or use the richer view:
```bash
cast call $STAKER \
  "getDepositInfo(uint256)(uint96,address,uint96,address,address,uint256)" \
  <depositId> --rpc-url $RPC
# 6th return value is unclaimedRewards
```

---

### Phase 5 — Add More Stake

Use `stakeMore` to add tokens to an existing deposit without changing its delegatee or claimer. Requires a prior `approve` for the additional amount.

```bash
cast send $TOKEN "approve(address,uint256)" $STAKER 200000000000000000000 \
  --rpc-url $RPC --private-key $USER_KEY

cast send $STAKER \
  "stakeMore(uint256,uint256)" \
  <depositId> 200000000000000000000 \
  --rpc-url $RPC --private-key $USER_KEY
```

**Event emitted:** `StakeDeposited` (same event as initial stake, with updated `depositBalance`)

---

### Phase 6 — Modify Deposit Settings

#### Change delegatee

```bash
cast send $STAKER \
  "alterDelegatee(uint256,address)" \
  <depositId> <newDelegatee> \
  --rpc-url $RPC --private-key $USER_KEY
```

Caller must be the deposit owner. Tokens are moved between surrogate contracts automatically.

**Event emitted:** `DelegateeAltered(DepositIdentifier indexed depositId, address oldDelegatee, address newDelegatee, uint256 earningPower)`

#### Change claimer

```bash
cast send $STAKER \
  "alterClaimer(uint256,address)" \
  <depositId> <newClaimer> \
  --rpc-url $RPC --private-key $USER_KEY
```

Caller must be the deposit owner. After this call, only `newClaimer` (or the owner) can call `claimReward` for this deposit.

**Event emitted:** `ClaimerAltered(DepositIdentifier indexed depositId, address indexed oldClaimer, address indexed newClaimer, uint256 earningPower)`

---

### Phase 7 — Claim Rewards

Callable by either the deposit's **claimer** or its **owner**. Tokens are sent to the caller.

```bash
cast send $STAKER \
  "claimReward(uint256)(uint256)" \
  <depositId> \
  --rpc-url $RPC --private-key $USER_KEY
```

Returns: amount of reward tokens actually transferred (after fee, which is 0 in Phase 1).

**Event emitted:** `RewardClaimed(DepositIdentifier indexed depositId, address indexed claimer, uint256 amount, uint256 earningPower)`

**Verify token balance increased:**
```bash
cast call $TOKEN "balanceOf(address)(uint256)" $MY_ADDRESS --rpc-url $RPC
```

---

### Phase 8 — Withdraw Stake

```bash
cast send $STAKER \
  "withdraw(uint256,uint256)" \
  <depositId> 300000000000000000000 \
  --rpc-url $RPC --private-key $USER_KEY
```

Caller must be the deposit owner. Partial withdrawals are allowed — the deposit remains open with the reduced balance. To fully close a deposit, pass the full `balance` from `getDepositInfo`.

**Event emitted:** `StakeWithdrawn(address indexed owner, DepositIdentifier indexed depositId, uint256 amount, uint256 depositBalance, uint256 earningPower)`

> Rewards already accrued are **not** lost on withdrawal. You can withdraw stake and still claim pending rewards afterwards.

---

## View Functions Reference

| Function | Who calls it | Returns |
|---|---|---|
| `getDepositInfo(depositId)` | anyone | balance, owner, earningPower, delegatee, claimer, unclaimedRewards |
| `getDepositsInfo(depositId[])` | anyone | parallel arrays of the above (batch) |
| `getGlobalState()` | anyone | totalStaked, totalEarningPower, rewardRate, rewardEndTime, lastCheckpointTime, rewardPerTokenAccumulated |
| `getDepositorSummary(address)` | anyone | totalStaked, totalEarningPower for one depositor |
| `getDepositorFullSummary(address, depositId[])` | anyone | totalStaked, totalEarningPower, totalUnclaimedRewards |
| `unclaimedReward(depositId)` | anyone | live unclaimed rewards for one deposit |
| `rewardPerTokenAccumulated()` | anyone | global accumulator (monotonically increasing) |
| `isRewardNotifier(address)` | anyone | bool — whether address can call notifyRewardAmount |
| `surrogates(delegatee)` | anyone | surrogate contract address for a delegatee |

---

## Events Reference

| Event | Trigger |
|---|---|
| `StakeDeposited` | `stake`, `stakeMore` |
| `StakeWithdrawn` | `withdraw` |
| `DelegateeAltered` | `stake` (initial), `alterDelegatee` |
| `ClaimerAltered` | `stake` (initial), `alterClaimer` |
| `RewardClaimed` | `claimReward` |
| `RewardNotified` | `notifyRewardAmount` |
| `RewardNotifierSet` | `setRewardNotifier` |
| `AdminSet` | `setAdmin` |

---

## Minimal End-to-End Checklist

```
[ ] 0. setRewardNotifier(adminAddr, true)             admin only, once
[ ] 1. mint(userAddr, 1000e18)                        get test tokens
[ ] 2. approve(proxyAddr, 500e18)                     allow staker to pull
[ ] 3. stake(500e18, delegatee)                       open deposit → save depositId
[ ] 4. mint + transfer 10000e18 to proxy              fund reward pool
[ ] 5. notifyRewardAmount(10000e18)                   start reward streaming
[ ] 6. wait (or query unclaimedReward)                watch rewards accrue
[ ] 7. claimReward(depositId)                         collect rewards
[ ] 8. stakeMore(depositId, 200e18)                   add to existing deposit
[ ] 9. alterDelegatee(depositId, newAddr)             change delegation
[  ] 10. alterClaimer(depositId, newAddr)             change claimer
[  ] 11. withdraw(depositId, fullBalance)             unstake
[  ] 12. claimReward(depositId)                       claim any remaining rewards
```

---

## Common Errors

| Error | Cause |
|---|---|
| `Staker__Unauthorized("not notifier", caller)` | Caller not in `isRewardNotifier` — admin must call `setRewardNotifier` first |
| `Staker__Unauthorized("not owner", caller)` | Caller is not the deposit owner |
| `Staker__Unauthorized("not claimer or owner", caller)` | Caller cannot claim this deposit |
| `Staker__InvalidRewardRate()` | Reward amount too small — results in zero rate |
| `Staker__InsufficientRewardBalance()` | Tokens not transferred to staker before calling `notifyRewardAmount` |
| `Staker__InvalidAddress()` | Zero address passed as delegatee or claimer |
| `ERC20: insufficient allowance` | `approve` not called before `stake` / `stakeMore` |
