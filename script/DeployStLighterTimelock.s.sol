// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice Deploys the OpenZeppelin TimelockController for stLighter governance.
///
/// Roles:
///   - PROPOSER + CANCELLER: `MULTISIG_ADDRESS`
///   - EXECUTOR: `address(0)` (anyone may execute after the delay)
///   - DEFAULT_ADMIN: the timelock itself (self-administered; `admin` ctor arg = address(0))
///
/// After deployment, set `TIMELOCK_ADDRESS` (or `GOVERNANCE_ADDRESS`) to this contract in
/// `DeployStLighterHorizen` / `DeployStLighterBase`.
///
/// Required env vars:
///   MULTISIG_ADDRESS — Horizen multisig (proposer + canceller)
///   PRIVATE_KEY        — deployer key
///
/// Optional:
///   TIMELOCK_MIN_DELAY — seconds; defaults to 2 days (172800)
contract DeployStLighterTimelock is Script {
  uint256 internal constant DEFAULT_MIN_DELAY = 2 days;

  function run() external returns (TimelockController timelock) {
    address multisig = vm.envAddress("MULTISIG_ADDRESS");
    uint256 minDelay = vm.envOr("TIMELOCK_MIN_DELAY", DEFAULT_MIN_DELAY);
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");

    address[] memory proposers = _singleton(multisig);
    address[] memory executors = _singleton(address(0));

    vm.startBroadcast(deployerKey);
    timelock = new TimelockController(minDelay, proposers, executors, address(0));
    vm.stopBroadcast();

    console2.log("TimelockController:", address(timelock));
    console2.log("Multisig:           ", multisig);
    console2.log("Min delay (sec):    ", minDelay);
    console2.log("NOTE: set TIMELOCK_ADDRESS to this address before deploying stLighter.");
  }

  function _singleton(address addr) private pure returns (address[] memory arr) {
    arr = new address[](1);
    arr[0] = addr;
  }
}
