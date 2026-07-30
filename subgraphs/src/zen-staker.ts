import {
  StakeDeposited as StakeDepositedEvent,
  StakeWithdrawn as StakeWithdrawnEvent,
  RewardClaimed as RewardClaimedEvent,
  DelegateeAltered as DelegateeAlteredEvent,
  ClaimerAltered as ClaimerAlteredEvent,
  RewardNotified as RewardNotifiedEvent,
} from "../generated/ZenStaker/ZenStaker";
import {
  Deposit,
  Activity as ActivityEntity,
  StakeDepositedEvent as StakeDepositedEntity,
  StakeWithdrawnEvent as StakeWithdrawnEntity,
  RewardClaimedEvent as RewardClaimedEntity,
  DelegateeAlteredEvent as DelegateeAlteredEntity,
  ClaimerAlteredEvent as ClaimerAlteredEntity,
  RewardNotifiedEvent as RewardNotifiedEntity,
} from "../generated/schema";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { sampleRate, loadMeta, STLIGHTER } from "./shared";

// Records a unified Activity row for the chronological history feed, alongside
// the per-type event entities, so the merged timeline can be queried from a
// single, cursor-paginated entity.
//
// NOTE: the (blockNumber << 32) | logIndex multiplier is computed as a LOCAL,
// not a module-level const. A module-level `BigInt.fromString(...)` global adds
// a wasm start/init routine that interferes with graph-ts's entity type-id
// registration, which made graph-node fail every store.set with an empty entity
// type name. Keeping it local avoids that.
function recordActivity(
  kind: string,
  account: Bytes,
  depositId: BigInt,
  amount: BigInt,
  event: ethereum.Event
): void {
  let orderKeyShift = BigInt.fromI32(2).pow(32); // 2^32

  let activity = new ActivityEntity(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  activity.kind = kind;
  activity.account = account;
  activity.depositId = depositId;
  activity.amount = amount;
  activity.orderKey = event.block.number.times(orderKeyShift).plus(event.logIndex);
  activity.blockNumber = event.block.number;
  activity.logIndex = event.logIndex;
  activity.blockTimestamp = event.block.timestamp;
  activity.transactionHash = event.transaction.hash;
  activity.save();
}

export function handleStakeDeposited(event: StakeDepositedEvent): void {
  let depositIdStr = event.params.depositId.toString();

  let deposit = Deposit.load(depositIdStr);
  if (deposit == null) {
    deposit = new Deposit(depositIdStr);
    deposit.owner = event.params.owner;
    deposit.delegatee = Address.zero();
    deposit.claimer = Address.zero();
    deposit.createdAtBlock = event.block.number;
    deposit.createdAtTimestamp = event.block.timestamp;
  }

  deposit.stakedAmount = event.params.depositBalance;
  deposit.earningPower = event.params.earningPower;
  deposit.updatedAtBlock = event.block.number;
  deposit.updatedAtTimestamp = event.block.timestamp;
  deposit.save();

  let entity = new StakeDepositedEntity(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.owner = event.params.owner;
  entity.depositId = event.params.depositId;
  entity.amount = event.params.amount;
  entity.depositBalance = event.params.depositBalance;
  entity.earningPower = event.params.earningPower;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  recordActivity("stake", event.params.owner, event.params.depositId, event.params.amount, event);
}

export function handleStakeWithdrawn(event: StakeWithdrawnEvent): void {
  let depositIdStr = event.params.depositId.toString();

  let deposit = Deposit.load(depositIdStr);
  if (deposit == null) {
    deposit = new Deposit(depositIdStr);
    deposit.owner = event.params.owner;
    deposit.delegatee = Address.zero();
    deposit.claimer = Address.zero();
    deposit.createdAtBlock = event.block.number;
    deposit.createdAtTimestamp = event.block.timestamp;
  }

  deposit.stakedAmount = event.params.depositBalance;
  deposit.earningPower = event.params.earningPower;
  deposit.updatedAtBlock = event.block.number;
  deposit.updatedAtTimestamp = event.block.timestamp;
  deposit.save();

  let entity = new StakeWithdrawnEntity(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.owner = event.params.owner;
  entity.depositId = event.params.depositId;
  entity.amount = event.params.amount;
  entity.depositBalance = event.params.depositBalance;
  entity.earningPower = event.params.earningPower;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  recordActivity("withdraw", event.params.owner, event.params.depositId, event.params.amount, event);
}

export function handleRewardClaimed(event: RewardClaimedEvent): void {
  let entity = new RewardClaimedEntity(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.depositId = event.params.depositId;
  entity.claimer = event.params.claimer;
  entity.amount = event.params.amount;
  entity.earningPower = event.params.earningPower;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  recordActivity("claim", event.params.claimer, event.params.depositId, event.params.amount, event);
}

export function handleDelegateeAltered(event: DelegateeAlteredEvent): void {
  let depositIdStr = event.params.depositId.toString();

  let deposit = Deposit.load(depositIdStr);
  if (deposit == null) {
    deposit = new Deposit(depositIdStr);
    deposit.owner = Address.zero();
    deposit.claimer = Address.zero();
    deposit.stakedAmount = BigInt.zero();
    deposit.createdAtBlock = event.block.number;
    deposit.createdAtTimestamp = event.block.timestamp;
  }

  deposit.delegatee = event.params.newDelegatee;
  deposit.earningPower = event.params.earningPower;
  deposit.updatedAtBlock = event.block.number;
  deposit.updatedAtTimestamp = event.block.timestamp;
  deposit.save();

  let entity = new DelegateeAlteredEntity(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.depositId = event.params.depositId;
  entity.oldDelegatee = event.params.oldDelegatee;
  entity.newDelegatee = event.params.newDelegatee;
  entity.earningPower = event.params.earningPower;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();
}

export function handleClaimerAltered(event: ClaimerAlteredEvent): void {
  let depositIdStr = event.params.depositId.toString();

  let deposit = Deposit.load(depositIdStr);
  if (deposit == null) {
    deposit = new Deposit(depositIdStr);
    deposit.owner = Address.zero();
    deposit.delegatee = Address.zero();
    deposit.stakedAmount = BigInt.zero();
    deposit.createdAtBlock = event.block.number;
    deposit.createdAtTimestamp = event.block.timestamp;
  }

  deposit.claimer = event.params.newClaimer;
  deposit.earningPower = event.params.earningPower;
  deposit.updatedAtBlock = event.block.number;
  deposit.updatedAtTimestamp = event.block.timestamp;
  deposit.save();

  let entity = new ClaimerAlteredEntity(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.depositId = event.params.depositId;
  entity.oldClaimer = event.params.oldClaimer;
  entity.newClaimer = event.params.newClaimer;
  entity.earningPower = event.params.earningPower;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();
}

export function handleRewardNotified(event: RewardNotifiedEvent): void {
  let entity = new RewardNotifiedEntity(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.amount = event.params.amount;
  entity.notifier = event.params.notifier;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  // Reward injection is the source of net-value growth: accrue the cumulative
  // total, then sample the vault rate (this block is when the growth slope changes).
  let meta = loadMeta();
  meta.cumulativeRewardNotified = meta.cumulativeRewardNotified.plus(event.params.amount);
  meta.save();

  sampleRate(event, "reward", STLIGHTER);
}