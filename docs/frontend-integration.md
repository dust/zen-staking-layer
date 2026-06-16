# ZenStaker — Frontend Integration Guide

This guide explains how a frontend developer can interact with the `ZenStaker` contract directly via `ethers.js` (v6, TypeScript).

The contract uses the same ZEN token for both staking and rewards. There are no claim fees.

---

## Table of Contents

1. [Initial Setup](#1-initial-setup)
2. [Minimal Reference ABI](#2-minimal-reference-abi)
3. [Global Contract State](#3-global-contract-state)
4. [Fetching a User's Deposits](#4-fetching-a-users-deposits)
5. [Reading Accrued Rewards](#5-reading-accrued-rewards)
6. [New Stake (approve + stake)](#6-new-stake-approve--stake)
7. [Stake Without a Separate Approve (permit)](#7-stake-without-a-separate-approve-permit)
8. [Adding Stake to an Existing Deposit](#8-adding-stake-to-an-existing-deposit)
9. [Claiming Rewards](#9-claiming-rewards)
10. [Withdrawing Stake](#10-withdrawing-stake)
11. [Advanced Operations](#11-advanced-operations)
12. [Listening to Events](#12-listening-to-events)
13. [Error Handling](#13-error-handling)

---

## 1. Initial Setup

```typescript
import { ethers, BrowserProvider, Contract, JsonRpcSigner } from "ethers";
import ZEN_STAKER_ABI from "./abis/ZenStaker.json"; // see section 2
import ZEN_TOKEN_ABI  from "./abis/ZenToken.json";  // standard ERC20

// Deployment addresses (replace with the real ones for each network)
const ADDRESSES = {
  zenStaker: "0x...",
  zenToken:  "0x...",
} as const;

// Read-only provider (for view calls, no wallet needed)
const readProvider = new ethers.JsonRpcProvider(process.env.RPC_URL);

// Read-only contract instances
const stakerRead = new Contract(ADDRESSES.zenStaker, ZEN_STAKER_ABI, readProvider);
const tokenRead  = new Contract(ADDRESSES.zenToken,  ZEN_TOKEN_ABI,  readProvider);

// Wallet connection (MetaMask or any EIP-1193 provider)
async function connectWallet(): Promise<JsonRpcSigner> {
  const browserProvider = new BrowserProvider(window.ethereum);
  await browserProvider.send("eth_requestAccounts", []);
  return browserProvider.getSigner();
}

// Signed contract instances (for write operations)
async function getSignedContracts(signer: JsonRpcSigner) {
  return {
    staker: new Contract(ADDRESSES.zenStaker, ZEN_STAKER_ABI, signer),
    token:  new Contract(ADDRESSES.zenToken,  ZEN_TOKEN_ABI,  signer),
  };
}
```

---

## 2. Minimal Reference ABI

Include only the functions you use. This is the full ABI for every operation documented in this guide.

```json
[
  // -- View: global state -----------------------------------------------------
  {
    "name": "getGlobalState",
    "type": "function", "stateMutability": "view",
    "inputs": [],
    "outputs": [
      { "name": "totalStaked_",              "type": "uint256" },
      { "name": "totalEarningPower_",        "type": "uint256" },
      { "name": "rewardRate_",               "type": "uint256" },
      { "name": "rewardEndTime_",            "type": "uint256" },
      { "name": "lastCheckpointTime_",       "type": "uint256" },
      { "name": "rewardPerTokenAccumulated_","type": "uint256" }
    ]
  },
  // -- View: single deposit ---------------------------------------------------
  {
    "name": "getDepositInfo",
    "type": "function", "stateMutability": "view",
    "inputs": [{ "name": "_depositId", "type": "uint256" }],
    "outputs": [
      { "name": "balance",         "type": "uint96"  },
      { "name": "owner",           "type": "address" },
      { "name": "earningPower",    "type": "uint96"  },
      { "name": "delegatee",       "type": "address" },
      { "name": "claimer",         "type": "address" },
      { "name": "unclaimedRewards","type": "uint256" }
    ]
  },
  // -- View: batch deposits ---------------------------------------------------
  {
    "name": "getDepositsInfo",
    "type": "function", "stateMutability": "view",
    "inputs": [{ "name": "_depositIds", "type": "uint256[]" }],
    "outputs": [
      { "name": "balances",        "type": "uint96[]"  },
      { "name": "owners",          "type": "address[]" },
      { "name": "earningPowers",   "type": "uint96[]"  },
      { "name": "unclaimedRewards","type": "uint256[]" }
    ]
  },
  // -- View: depositor summary ------------------------------------------------
  {
    "name": "getDepositorSummary",
    "type": "function", "stateMutability": "view",
    "inputs": [{ "name": "_depositor", "type": "address" }],
    "outputs": [
      { "name": "totalStaked_",       "type": "uint256" },
      { "name": "totalEarningPower_", "type": "uint256" }
    ]
  },
  {
    "name": "getDepositorFullSummary",
    "type": "function", "stateMutability": "view",
    "inputs": [
      { "name": "_depositor",  "type": "address"   },
      { "name": "_depositIds", "type": "uint256[]" }
    ],
    "outputs": [
      { "name": "totalStaked_",           "type": "uint256" },
      { "name": "totalEarningPower_",     "type": "uint256" },
      { "name": "totalUnclaimedRewards_", "type": "uint256" }
    ]
  },
  // -- View: rewards for a single deposit ------------------------------------
  {
    "name": "unclaimedReward",
    "type": "function", "stateMutability": "view",
    "inputs": [{ "name": "_depositId", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  // -- Write ------------------------------------------------------------------
  {
    "name": "stake",
    "type": "function", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "_amount",    "type": "uint256" },
      { "name": "_delegatee", "type": "address" }
    ],
    "outputs": [{ "name": "_depositId", "type": "uint256" }]
  },
  {
    "name": "stakeMore",
    "type": "function", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "_depositId", "type": "uint256" },
      { "name": "_amount",    "type": "uint256" }
    ],
    "outputs": []
  },
  {
    "name": "withdraw",
    "type": "function", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "_depositId", "type": "uint256" },
      { "name": "_amount",    "type": "uint256" }
    ],
    "outputs": []
  },
  {
    "name": "claimReward",
    "type": "function", "stateMutability": "nonpayable",
    "inputs": [{ "name": "_depositId", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "name": "permitAndStake",
    "type": "function", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "_amount",    "type": "uint256" },
      { "name": "_delegatee", "type": "address" },
      { "name": "_claimer",   "type": "address" },
      { "name": "_deadline",  "type": "uint256" },
      { "name": "_v",         "type": "uint8"   },
      { "name": "_r",         "type": "bytes32" },
      { "name": "_s",         "type": "bytes32" }
    ],
    "outputs": [{ "name": "_depositId", "type": "uint256" }]
  },
  {
    "name": "alterDelegatee",
    "type": "function", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "_depositId",    "type": "uint256" },
      { "name": "_newDelegatee", "type": "address" }
    ],
    "outputs": []
  },
  {
    "name": "alterClaimer",
    "type": "function", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "_depositId", "type": "uint256" },
      { "name": "_newClaimer","type": "address" }
    ],
    "outputs": []
  },
  // -- Events -----------------------------------------------------------------
  {
    "name": "StakeDeposited",
    "type": "event",
    "inputs": [
      { "name": "owner",         "type": "address", "indexed": true  },
      { "name": "depositId",     "type": "uint256", "indexed": true  },
      { "name": "amount",        "type": "uint256", "indexed": false },
      { "name": "depositBalance","type": "uint256", "indexed": false },
      { "name": "earningPower",  "type": "uint256", "indexed": false }
    ]
  },
  {
    "name": "StakeWithdrawn",
    "type": "event",
    "inputs": [
      { "name": "owner",         "type": "address", "indexed": true  },
      { "name": "depositId",     "type": "uint256", "indexed": true  },
      { "name": "amount",        "type": "uint256", "indexed": false },
      { "name": "depositBalance","type": "uint256", "indexed": false },
      { "name": "earningPower",  "type": "uint256", "indexed": false }
    ]
  },
  {
    "name": "RewardClaimed",
    "type": "event",
    "inputs": [
      { "name": "depositId",   "type": "uint256", "indexed": true  },
      { "name": "claimer",     "type": "address", "indexed": true  },
      { "name": "amount",      "type": "uint256", "indexed": false },
      { "name": "earningPower","type": "uint256", "indexed": false }
    ]
  },
  {
    "name": "RewardNotified",
    "type": "event",
    "inputs": [
      { "name": "amount",   "type": "uint256", "indexed": false },
      { "name": "notifier", "type": "address", "indexed": false }
    ]
  }
]
```

---

## 3. Global Contract State

Use `getGlobalState()` for the main dashboard: total ZEN staked, the active reward rate, and when the current distribution period ends.

```typescript
interface GlobalState {
  totalStaked: bigint;               // total ZEN currently staked (wei)
  totalEarningPower: bigint;         // total earning power (= totalStaked with IdentityCalculator)
  rewardRate: bigint;                // ZEN distributed per second (wei/s) in the current period
  rewardEndTime: Date | null;        // end of the reward distribution period, null if not started
  rewardPerTokenAccumulated: bigint;
}

async function fetchGlobalState(): Promise<GlobalState> {
  const [
    totalStaked,
    totalEarningPower,
    rewardRate,
    rewardEndTime,
    ,                                // lastCheckpointTime — not needed for the UI
    rewardPerTokenAccumulated,
  ] = await stakerRead.getGlobalState();

  return {
    totalStaked,
    totalEarningPower,
    rewardRate,
    rewardEndTime: rewardEndTime > 0n
      ? new Date(Number(rewardEndTime) * 1000)
      : null,
    rewardPerTokenAccumulated,
  };
}

// Usage
const state = await fetchGlobalState();
console.log("ZEN staked:", ethers.formatEther(state.totalStaked));
console.log("Reward rate:", ethers.formatEther(state.rewardRate), "ZEN/s");
console.log("Distribution ends:", state.rewardEndTime?.toLocaleDateString() ?? "—");
```

> **Note:** `rewardRate` is already expressed in ZEN per second. Multiply by `3600 * 24` to get the daily rate.

---

## 4. Fetching a User's Deposits

Deposit IDs are **not enumerable on-chain**: the contract keeps no per-address list. There are two approaches depending on what you need to display.

### 4a. Quick summary (no deposit IDs needed)

`getDepositorSummary` returns the total staked amount and earning power without requiring any deposit IDs.

```typescript
async function fetchUserSummary(userAddress: string) {
  const [totalStaked, totalEarningPower] =
    await stakerRead.getDepositorSummary(userAddress);

  return {
    totalStaked,       // total ZEN staked across all of the user's deposits
    totalEarningPower, // total earning power (= totalStaked with Phase 1 calculator)
  };
}
```

### 4b. Full summary including rewards (deposit IDs required)

To display aggregate unclaimed rewards you must supply the deposit IDs. Fetch them from past `StakeDeposited` events.

```typescript
// Retrieve all deposit IDs for a user from historical events
async function fetchDepositIds(userAddress: string): Promise<bigint[]> {
  const filter = stakerRead.filters.StakeDeposited(userAddress);
  const events = await stakerRead.queryFilter(filter);

  // depositId is the second indexed argument of each event
  const depositIds = events.map((e) => (e as ethers.EventLog).args[1] as bigint);

  // Keep only deposits that are still open (balance > 0)
  const activeIds: bigint[] = [];
  for (const id of depositIds) {
    const [balance] = await stakerRead.getDepositInfo(id);
    if (balance > 0n) activeIds.push(id);
  }
  return activeIds;
}

// Full summary: staked ZEN + earning power + unclaimed rewards
async function fetchUserFullSummary(userAddress: string) {
  const depositIds = await fetchDepositIds(userAddress);
  if (depositIds.length === 0) {
    return { totalStaked: 0n, totalEarningPower: 0n, totalUnclaimedRewards: 0n, depositIds: [] };
  }

  const [totalStaked, totalEarningPower, totalUnclaimedRewards] =
    await stakerRead.getDepositorFullSummary(userAddress, depositIds);

  return { totalStaked, totalEarningPower, totalUnclaimedRewards, depositIds };
}
```

> **Warning:** `queryFilter` can be slow on networks with a long history. In production, store deposit IDs in a database or indexer (Goldsky, The Graph) and pass them directly to `getDepositorFullSummary`.

### 4c. Detailed view of every deposit (batch)

```typescript
interface DepositInfo {
  depositId: bigint;
  balance: bigint;          // ZEN staked in this deposit
  earningPower: bigint;     // earning power (= balance with Phase 1 calculator)
  unclaimedRewards: bigint;
}

async function fetchDepositsDetail(depositIds: bigint[]): Promise<DepositInfo[]> {
  if (depositIds.length === 0) return [];

  const [balances, , earningPowers, unclaimedRewards] =
    await stakerRead.getDepositsInfo(depositIds);

  return depositIds.map((id, i) => ({
    depositId:        id,
    balance:          balances[i],
    earningPower:     earningPowers[i],
    unclaimedRewards: unclaimedRewards[i],
  }));
}
```

### 4d. Single deposit detail

```typescript
async function fetchDepositInfo(depositId: bigint) {
  const [balance, owner, earningPower, delegatee, claimer, unclaimedRewards] =
    await stakerRead.getDepositInfo(depositId);

  return { balance, owner, earningPower, delegatee, claimer, unclaimedRewards };
}
```

---

## 5. Reading Accrued Rewards

### For a single deposit (live polling)

```typescript
// Rewards accrued up to the current block (in ZEN, no fees deducted)
async function fetchUnclaimedReward(depositId: bigint): Promise<bigint> {
  return stakerRead.unclaimedReward(depositId);
}
```

### For all of a user's deposits

```typescript
async function fetchTotalUnclaimedRewards(
  userAddress: string,
  depositIds: bigint[]
): Promise<bigint> {
  if (depositIds.length === 0) return 0n;
  const [, , totalUnclaimedRewards] =
    await stakerRead.getDepositorFullSummary(userAddress, depositIds);
  return totalUnclaimedRewards;
}
```

> **UI tip:** `unclaimedReward` grows with every block. To display a live counter you can poll every ~12 s (average block time), or estimate the current value client-side by interpolating with `rewardRate`:
>
> ```typescript
> // Client-side estimate without an RPC call
> // (approximate — does not account for stake changes between samples)
> function estimateCurrentReward(
>   lastKnownReward: bigint,
>   rewardRate: bigint,
>   totalEarningPower: bigint,
>   userEarningPower: bigint,
>   secondsElapsed: number
> ): bigint {
>   if (totalEarningPower === 0n) return lastKnownReward;
>   const perSecond = (rewardRate * userEarningPower) / totalEarningPower;
>   return lastKnownReward + perSecond * BigInt(Math.floor(secondsElapsed));
> }
> ```

---

## 6. New Stake (approve + stake)

Staking requires two transactions: the user first approves the contract to spend their ZEN, then calls `stake`.

```typescript
async function stakeZen(
  signer: JsonRpcSigner,
  amountZen: string,          // e.g. "1000" (in ZEN, not in wei)
  delegateeAddress: string    // address to delegate governance voting power to
                               // (use the user's own address if no delegation is wanted)
): Promise<bigint> {          // returns the new deposit ID
  const { staker, token } = await getSignedContracts(signer);
  const amount = ethers.parseEther(amountZen);

  // 1. Check allowance — skip the approve tx if already sufficient
  const userAddress = await signer.getAddress();
  const allowance = await token.allowance(userAddress, ADDRESSES.zenStaker);
  if (allowance < amount) {
    console.log("Approving...");
    const approveTx = await token.approve(ADDRESSES.zenStaker, amount);
    await approveTx.wait();
    console.log("Approval confirmed:", approveTx.hash);
  }

  // 2. Stake
  // IMPORTANT: stake has two overloads. Use the explicit function selector in
  // ethers.js v6 to avoid ambiguity with the 3-argument version (which also
  // accepts a claimer address).
  const stakeTx = await staker["stake(uint256,address)"](amount, delegateeAddress);
  const receipt = await stakeTx.wait();
  console.log("Stake confirmed:", stakeTx.hash);

  // 3. Extract the deposit ID from the StakeDeposited event
  const iface = new ethers.Interface(ZEN_STAKER_ABI);
  const log = receipt!.logs.find(
    (l) => { try { return iface.parseLog(l)?.name === "StakeDeposited"; } catch { return false; } }
  )!;
  const depositId = iface.parseLog(log)!.args[1] as bigint;
  console.log("Deposit ID:", depositId);

  return depositId;
}
```

> **Custom claimer:** if you want rewards to be claimable by a different address (e.g. a vesting contract), use the three-argument overload:
> ```typescript
> const stakeTx = await staker["stake(uint256,address,address)"](
>   amount, delegateeAddress, claimerAddress
> );
> ```

---

## 7. Stake Without a Separate Approve (permit)

`permitAndStake` combines approve + stake into **a single transaction** using an EIP-2612 signature. Better UX — only one wallet confirmation required.

```typescript
async function permitAndStake(
  signer: JsonRpcSigner,
  amountZen: string,
  delegateeAddress: string
): Promise<bigint> {
  const { staker } = await getSignedContracts(signer);
  const amount      = ethers.parseEther(amountZen);
  const userAddress = await signer.getAddress();
  const deadline    = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

  // Build the EIP-2612 permit signature
  const tokenContract = new Contract(ADDRESSES.zenToken, [
    "function nonces(address) view returns (uint256)",
    "function name() view returns (string)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)",
  ], signer);

  const nonce   = await tokenContract.nonces(userAddress);
  const network = await signer.provider!.getNetwork();

  const domain = {
    name:              await tokenContract.name(),
    version:           "1",
    chainId:           network.chainId,
    verifyingContract: ADDRESSES.zenToken,
  };

  const types = {
    Permit: [
      { name: "owner",    type: "address" },
      { name: "spender",  type: "address" },
      { name: "value",    type: "uint256" },
      { name: "nonce",    type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const value = { owner: userAddress, spender: ADDRESSES.zenStaker, value: amount, nonce, deadline };
  const sig   = await signer.signTypedData(domain, types, value);
  const { v, r, s } = ethers.Signature.from(sig);

  // Stake in a single tx (claimer defaults to userAddress)
  const tx      = await staker.permitAndStake(amount, delegateeAddress, userAddress, deadline, v, r, s);
  const receipt = await tx.wait();
  console.log("permitAndStake confirmed:", tx.hash);

  const iface = new ethers.Interface(ZEN_STAKER_ABI);
  const log = receipt!.logs.find(
    (l) => { try { return iface.parseLog(l)?.name === "StakeDeposited"; } catch { return false; } }
  )!;
  return iface.parseLog(log)!.args[1] as bigint;
}
```

---

## 8. Adding Stake to an Existing Deposit

Use `stakeMore` to increase the balance of an existing deposit while keeping the same delegatee and claimer. Only the deposit owner can call this.

```typescript
async function stakeMore(
  signer: JsonRpcSigner,
  depositId: bigint,
  amountZen: string
): Promise<void> {
  const { staker, token } = await getSignedContracts(signer);
  const amount = ethers.parseEther(amountZen);
  const userAddress = await signer.getAddress();

  // Approve if necessary
  const allowance = await token.allowance(userAddress, ADDRESSES.zenStaker);
  if (allowance < amount) {
    const approveTx = await token.approve(ADDRESSES.zenStaker, amount);
    await approveTx.wait();
  }

  const tx      = await staker.stakeMore(depositId, amount);
  const receipt = await tx.wait();
  console.log("stakeMore confirmed:", tx.hash);

  // Verify the updated deposit balance
  const [newBalance] = await stakerRead.getDepositInfo(depositId);
  console.log("New deposit balance:", ethers.formatEther(newBalance), "ZEN");
}
```

---

## 9. Claiming Rewards

`claimReward` can be called by the deposit **owner** or its **claimer** (if set to a different address). Tokens are sent to the caller.

There are no fees: 100% of accrued rewards go to the claimer/owner.

```typescript
async function claimReward(
  signer: JsonRpcSigner,
  depositId: bigint
): Promise<bigint> {  // returns the claimed amount in wei
  const { staker } = await getSignedContracts(signer);
  const userAddress = await signer.getAddress();

  // Check pending rewards before claiming (optional, for UX)
  const pending = await stakerRead.unclaimedReward(depositId);
  console.log("Pending rewards:", ethers.formatEther(pending), "ZEN");

  if (pending === 0n) {
    console.log("Nothing to claim");
    return 0n;
  }

  const balanceBefore = await tokenRead.balanceOf(userAddress);

  const tx      = await staker.claimReward(depositId);
  const receipt = await tx.wait();
  console.log("Claim confirmed:", tx.hash);

  const balanceAfter = await tokenRead.balanceOf(userAddress);
  const claimed = balanceAfter - balanceBefore;
  console.log("ZEN received:", ethers.formatEther(claimed));

  return claimed;
}

// Claim rewards from all deposits in one call
async function claimAllRewards(
  signer: JsonRpcSigner,
  depositIds: bigint[]
): Promise<void> {
  // Filter to deposits that actually have rewards, to avoid wasting gas
  const claimable: bigint[] = [];
  for (const id of depositIds) {
    const reward = await stakerRead.unclaimedReward(id);
    if (reward > 0n) claimable.push(id);
  }

  console.log(`${claimable.length} / ${depositIds.length} deposits have claimable rewards`);

  for (const id of claimable) {
    await claimReward(signer, id);
  }
}
```

---

## 10. Withdrawing Stake

`withdraw` pulls a specified amount of ZEN out of a deposit. Only the owner can call it. Rewards are **not claimed automatically** — call `claimReward` first if you don't want to leave them behind.

```typescript
async function withdrawStake(
  signer: JsonRpcSigner,
  depositId: bigint,
  amountZen: string | "all"   // pass "all" to withdraw the full balance
): Promise<void> {
  const { staker } = await getSignedContracts(signer);

  // Fetch the current deposit balance
  const [currentBalance] = await stakerRead.getDepositInfo(depositId);
  const amount = amountZen === "all"
    ? currentBalance
    : ethers.parseEther(amountZen);

  if (amount > currentBalance) {
    throw new Error(
      `Requested amount (${ethers.formatEther(amount)}) exceeds deposit balance (${ethers.formatEther(currentBalance)})`
    );
  }

  // Claim accrued rewards before withdrawing so they are not left stranded
  const pending = await stakerRead.unclaimedReward(depositId);
  if (pending > 0n) {
    console.log(`Auto-claiming ${ethers.formatEther(pending)} ZEN before withdrawal...`);
    const claimTx = await staker.claimReward(depositId);
    await claimTx.wait();
  }

  const tx      = await staker.withdraw(depositId, amount);
  const receipt = await tx.wait();
  console.log("Withdrawal confirmed:", tx.hash);
  console.log("ZEN withdrawn:", ethers.formatEther(amount));
}
```

---

## 11. Advanced Operations

### Changing the delegatee

The delegatee is the address that receives the governance voting power of the staked tokens. Only the deposit owner can change it.

```typescript
async function changeDelegatee(
  signer: JsonRpcSigner,
  depositId: bigint,
  newDelegatee: string
): Promise<void> {
  const { staker } = await getSignedContracts(signer);
  const tx = await staker.alterDelegatee(depositId, newDelegatee);
  await tx.wait();
  console.log("Delegatee updated:", tx.hash);
}
```

### Changing the claimer

The claimer is the only address (besides the owner) authorised to call `claimReward` on a deposit.

```typescript
async function changeClaimer(
  signer: JsonRpcSigner,
  depositId: bigint,
  newClaimer: string
): Promise<void> {
  const { staker } = await getSignedContracts(signer);
  const tx = await staker.alterClaimer(depositId, newClaimer);
  await tx.wait();
  console.log("Claimer updated:", tx.hash);
}
```

---

## 12. Listening to Events

Subscribe to contract events to update the UI in real time without polling.

```typescript
function subscribeToUserEvents(
  userAddress: string,
  onStake:    (depositId: bigint, amount: bigint) => void,
  onWithdraw: (depositId: bigint, amount: bigint) => void,
  onClaim:    (depositId: bigint, amount: bigint) => void
) {
  // New stake by the user
  const stakeFilter = stakerRead.filters.StakeDeposited(userAddress);
  stakerRead.on(stakeFilter, (owner, depositId, amount) => {
    console.log(`New deposit #${depositId}: ${ethers.formatEther(amount)} ZEN`);
    onStake(depositId, amount);
  });

  // Withdrawal by the user
  const withdrawFilter = stakerRead.filters.StakeWithdrawn(userAddress);
  stakerRead.on(withdrawFilter, (owner, depositId, amount) => {
    console.log(`Withdrawal deposit #${depositId}: ${ethers.formatEther(amount)} ZEN`);
    onWithdraw(depositId, amount);
  });

  // Claim — filter on the claimer address, not the owner
  const claimFilter = stakerRead.filters.RewardClaimed(null, userAddress);
  stakerRead.on(claimFilter, (depositId, claimer, amount) => {
    console.log(`Claim deposit #${depositId}: ${ethers.formatEther(amount)} ZEN`);
    onClaim(depositId, amount);
  });

  // To stop listening (e.g. on component unmount):
  // stakerRead.removeAllListeners();
}

// Listen for new reward distributions (useful for showing a "new rewards available" banner)
function subscribeToRewardNotifications(onNewReward: (amount: bigint) => void) {
  stakerRead.on("RewardNotified", (amount) => {
    console.log(`New rewards distributed: ${ethers.formatEther(amount)} ZEN`);
    onNewReward(amount);
  });
}
```

---

## 13. Error Handling

The contract uses custom Solidity errors. ethers.js v6 decodes them automatically when the ABI includes the error definitions.

```typescript
// Main custom errors emitted by the contract
const STAKER_ERRORS = {
  Unauthorized:      "Staker__Unauthorized",      // caller lacks permission for this operation
  InvalidAddress:    "Staker__InvalidAddress",    // address(0) passed where not allowed
  InsufficientStake: "Staker__InsufficientStake", // requested amount > deposit balance
  InvalidRewardRate: "Staker__InvalidRewardRate", // computed reward rate would be 0
} as const;

async function safeStake(
  signer: JsonRpcSigner,
  amountZen: string,
  delegatee: string
): Promise<bigint | null> {
  try {
    return await stakeZen(signer, amountZen, delegatee);
  } catch (err: unknown) {
    if (err instanceof Error) {
      // Custom contract errors
      if ("data" in err) {
        const iface = new ethers.Interface(ZEN_STAKER_ABI);
        try {
          const decoded = iface.parseError((err as { data: string }).data);
          switch (decoded?.name) {
            case "Staker__InvalidAddress":
              console.error("Invalid delegatee address (cannot be zero address)");
              break;
            case "Staker__Unauthorized":
              console.error("Unauthorized:", decoded.args[0]);
              break;
            default:
              console.error("Contract error:", decoded?.name, decoded?.args);
          }
          return null;
        } catch {
          // Not a decodable custom error
        }
      }
      // Common user-facing errors
      if (err.message.includes("insufficient funds")) {
        console.error("Not enough ETH to cover gas");
      } else if (err.message.includes("user rejected")) {
        console.error("Transaction rejected by user");
      } else {
        console.error("Unexpected error:", err.message);
      }
    }
    return null;
  }
}
```

---

## Quick Reference

| What to display                  | Function                                            | Notes                                      |
|----------------------------------|-----------------------------------------------------|--------------------------------------------|
| Total ZEN staked (all users)     | `getGlobalState()` → `totalStaked`                  | Protocol-wide total                        |
| Active reward rate               | `getGlobalState()` → `rewardRate`                   | In ZEN/second                              |
| User's staked ZEN                | `getDepositorSummary(addr)` → `totalStaked`         | No deposit IDs needed                      |
| User's total unclaimed rewards   | `getDepositorFullSummary(addr, ids)`                | Deposit IDs required                       |
| Rewards for one deposit          | `unclaimedReward(depositId)`                        | Per-deposit                                |
| Deposit list with details        | `getDepositsInfo(ids[])`                            | Batch call, more efficient                 |
| New stake                        | `approve` + `stake(amount, delegatee)`              | Two txs, or one with `permitAndStake`      |
| Top up an existing deposit       | `stakeMore(depositId, amount)`                      | Owner only                                 |
| Claim rewards                    | `claimReward(depositId)`                            | Owner or claimer                           |
| Withdraw stake                   | `withdraw(depositId, amount)`                       | Owner only; claim first                    |
| Retrieve deposit IDs             | `StakeDeposited` event filtered by `owner`          | Not enumerable on-chain                    |
