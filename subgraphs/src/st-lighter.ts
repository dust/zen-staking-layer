import {
  Deposited as DepositedEvent,
  Redeemed as RedeemedEvent,
  Harvested as HarvestedEvent,
} from "../generated/StLighter/StLighter";
import {
  StLighterDeposit,
  StLighterRedeem,
  HarvestEvent,
} from "../generated/schema";
import { dataSource } from "@graphprotocol/graph-ts";
import { sampleRate } from "./shared";

export function handleDeposited(event: DepositedEvent): void {
  let e = new StLighterDeposit(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  e.caller = event.params.caller;
  e.receiver = event.params.receiver;
  e.assets = event.params.assets;
  e.shares = event.params.shares;
  e.blockNumber = event.block.number;
  e.blockTimestamp = event.block.timestamp;
  e.transactionHash = event.transaction.hash;
  e.save();

  sampleRate(event, "deposit", dataSource.address());
}

export function handleRedeemed(event: RedeemedEvent): void {
  let e = new StLighterRedeem(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  e.caller = event.params.caller;
  e.receiver = event.params.receiver;
  e.shares = event.params.shares;
  e.assets = event.params.assets;
  e.blockNumber = event.block.number;
  e.blockTimestamp = event.block.timestamp;
  e.transactionHash = event.transaction.hash;
  e.save();

  sampleRate(event, "redeem", dataSource.address());
}

export function handleHarvested(event: HarvestedEvent): void {
  let e = new HarvestEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  e.rewardClaimed = event.params.rewardClaimed;
  e.feeTaken = event.params.feeTaken;
  e.restaked = event.params.restaked;
  e.blockNumber = event.block.number;
  e.blockTimestamp = event.block.timestamp;
  e.transactionHash = event.transaction.hash;
  e.save();

  sampleRate(event, "harvest", dataSource.address());
}
