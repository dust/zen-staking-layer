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
  StakeDepositedEvent as StakeDepositedEntity,
  StakeWithdrawnEvent as StakeWithdrawnEntity,
  RewardClaimedEvent as RewardClaimedEntity,
  DelegateeAlteredEvent as DelegateeAlteredEntity,
  ClaimerAlteredEvent as ClaimerAlteredEntity,
  RewardNotifiedEvent as RewardNotifiedEntity,
} from "../generated/schema";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

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
}
