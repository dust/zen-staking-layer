// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {RewardAccumulator} from "../src/RewardAccumulator.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Rolls a RewardAccumulator forward: optionally notifies it of rewards already sitting
/// in its balance, forwards the accumulated rewards to the Staker, then sets a new time window.
/// Intended for the bootstrap flow where the accumulator starts on a short window (to release the
/// first reward and kick off the Staker's 30 day cycle) and is then switched to match the
/// Staker's REWARD_DURATION going forward.
/// @dev Must be called with the RewardAccumulator owner's key (setTimeWindow is onlyOwner). If
/// SHOULD_NOTIFY is true and the accumulator has whitelistEnabled, the owner must also be
/// whitelisted, since notifyAlreadyTransferredRewards is onlyWhitelisted.
/// Required environment variables:
///   REWARD_ACCUMULATOR_ADDRESS — address of the deployed RewardAccumulator
///   PRIVATE_KEY                — owner private key (hex, with or without 0x prefix)
///
/// Optional:
///   SHOULD_NOTIFY     — bool, defaults to false. If true, notifies the accumulator of any
///                        reward tokens sitting in its balance that haven't been accounted for
///                        yet (i.e. rewardToken.balanceOf(accumulator) - accumulatedRewards),
///                        without performing any transfer.
///   NEW_WINDOW_LENGTH — uint256, defaults to 30 days
contract RewardAccumulatorRollover is Script {
  function run() external {
    address accumulatorAddress = vm.envAddress("REWARD_ACCUMULATOR_ADDRESS");
    uint256 ownerKey = vm.envUint("PRIVATE_KEY");
    bool shouldNotify = vm.envOr("SHOULD_NOTIFY", false);
    uint256 newWindowLength = vm.envOr("NEW_WINDOW_LENGTH", uint256(30 days));

    RewardAccumulator accumulator = RewardAccumulator(accumulatorAddress);

    vm.startBroadcast(ownerKey);

    if (shouldNotify) {
      ERC20 rewardToken = accumulator.rewardToken();
      uint256 unaccountedAmount =
        rewardToken.balanceOf(accumulatorAddress) - accumulator.accumulatedRewards();

      if (unaccountedAmount > 0) {
        accumulator.notifyAlreadyTransferredRewards(unaccountedAmount);
        console2.log("Notified already-transferred rewards:", unaccountedAmount);
      } else {
        console2.log("SHOULD_NOTIFY set but no unaccounted balance found, skipping notify");
      }
    }

    accumulator.sendRewardsToStaker();
    console2.log("Sent accumulated rewards to staker");

    accumulator.setTimeWindow(newWindowLength);
    console2.log("Time window set:", newWindowLength);

    vm.stopBroadcast();
  }
}
