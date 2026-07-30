import { BigInt, Address, ethereum } from "@graphprotocol/graph-ts";
import { StLighter } from "../generated/StLighter/StLighter";
import { RateSnapshot, ProtocolDayData, ProtocolMeta } from "../generated/schema";

// StLighter UUPS proxy — same address used by the StLighter data source and by
// handleRewardNotified (ZenStaker) to sample the vault rate.
export const STLIGHTER = Address.fromString(
  "0x92E0940f6dAE6e14f004bb411A7fE222EbCE4E59"
);

const ONE = BigInt.fromString("1000000000000000000"); // 1e18
const DAY = BigInt.fromI32(86400);

// Loads (or lazily creates) the global running-totals singleton.
export function loadMeta(): ProtocolMeta {
  let meta = ProtocolMeta.load("1");
  if (meta == null) {
    meta = new ProtocolMeta("1");
    meta.cumulativeRewardNotified = BigInt.zero();
    meta.lastRate = BigInt.zero();
    meta.lastTotalAssets = BigInt.zero();
    meta.lastIssuedShares = BigInt.zero();
  }
  return meta;
}

// Samples convertToAssets(1e18) / totalAssets / issuedShares via eth_call at the
// current block and writes a RateSnapshot + rolls the daily aggregate. Uses try_*
// so a revert (e.g. before the first deposit) skips the point without halting the
// whole index.
//
// `rewardAccrued` is the reward compounded at this event (StLighter Harvested
// `rewardClaimed`); it is added to the running cumulative total. Pass BigInt.zero()
// for deposit/redeem, which do not compound rewards.
export function sampleRate(
  event: ethereum.Event,
  trigger: string,
  stlighter: Address,
  rewardAccrued: BigInt
): void {
  let c = StLighter.bind(stlighter);

  let rateRes = c.try_convertToAssets(ONE);
  let taRes = c.try_totalAssets();
  let isRes = c.try_issuedShares();
  if (rateRes.reverted || taRes.reverted || isRes.reverted) return;

  let snap = new RateSnapshot(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  snap.rate = rateRes.value;
  snap.totalAssets = taRes.value;
  snap.issuedShares = isRes.value;
  snap.trigger = trigger;
  snap.blockNumber = event.block.number;
  snap.blockTimestamp = event.block.timestamp;
  snap.transactionHash = event.transaction.hash;
  snap.save();

  updateDay(event.block.timestamp, rateRes.value, taRes.value, isRes.value, rewardAccrued);
}

// Rolls the per-day aggregate (open/close rate, latest totals, cumulative reward).
// `rewardAccrued` is added to the running cumulative-compounded-reward total.
function updateDay(
  ts: BigInt,
  rate: BigInt,
  ta: BigInt,
  is: BigInt,
  rewardAccrued: BigInt
): void {
  let meta = loadMeta();
  meta.cumulativeRewardNotified = meta.cumulativeRewardNotified.plus(rewardAccrued);
  meta.lastRate = rate;
  meta.lastTotalAssets = ta;
  meta.lastIssuedShares = is;
  meta.save();

  let dayId = ts.div(DAY);
  let id = dayId.toString();
  let day = ProtocolDayData.load(id);
  if (day == null) {
    day = new ProtocolDayData(id);
    day.date = dayId.times(DAY).toI32();
    day.rateOpen = rate;
  }
  day.rateClose = rate;
  day.totalAssets = ta;
  day.issuedShares = is;
  day.cumulativeRewardNotified = meta.cumulativeRewardNotified;
  day.aggregateStakedBalance = ta; // aggregate position net value (balance + unclaimed)
  day.save();
}
