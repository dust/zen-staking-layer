// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

interface IStLighterUUPS {
  function upgradeToAndCall(address newImplementation, bytes memory data) external payable;
}

/// @notice Schedules or executes a UUPS upgrade for the StLighter proxy through the timelock.
///
/// Usage:
///   1. Deploy new implementation: `new StLighter()` (no initialize).
///   2. `ACTION=schedule` — multisig broadcasts `schedule` on the timelock.
///   3. Wait `TIMELOCK_MIN_DELAY`.
///   4. `ACTION=execute` — anyone broadcasts `execute` on the timelock.
///
/// Required env vars:
///   TIMELOCK_ADDRESS, STLighter_PROXY_ADDRESS, NEW_IMPLEMENTATION_ADDRESS, PRIVATE_KEY
///
/// Optional:
///   ACTION — `schedule` (default) or `execute`
///   OPERATION_SALT — bytes32 salt for the timelock operation (default 0)
contract UpgradeStLighterViaTimelock is Script {
  function run() external {
    address timelockAddr = vm.envAddress("TIMELOCK_ADDRESS");
    address proxy = vm.envAddress("STLighter_PROXY_ADDRESS");
    address newImpl = vm.envAddress("NEW_IMPLEMENTATION_ADDRESS");
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");
    string memory action = vm.envOr("ACTION", string("schedule"));
    bytes32 salt = bytes32(vm.envOr("OPERATION_SALT", uint256(0)));

    TimelockController timelock = TimelockController(payable(timelockAddr));
    bytes memory data = abi.encodeCall(IStLighterUUPS.upgradeToAndCall, (newImpl, ""));
    bytes32 predecessor = bytes32(0);
    bytes32 operationId = timelock.hashOperation(proxy, 0, data, predecessor, salt);

    vm.startBroadcast(deployerKey);

    if (_eq(action, "schedule")) {
      uint256 delay = timelock.getMinDelay();
      timelock.schedule(proxy, 0, data, predecessor, salt, delay);
      console2.log("Scheduled UUPS upgrade; wait delay then run ACTION=execute");
      console2.log("Delay (sec):", delay);
    } else if (_eq(action, "execute")) {
      timelock.execute(proxy, 0, data, predecessor, salt);
      console2.log("Executed UUPS upgrade");
    } else {
      revert("UpgradeStLighterViaTimelock: unknown ACTION");
    }

    vm.stopBroadcast();

    console2.log("Operation id:");
    console2.logBytes32(operationId);
    console2.log("Proxy:         ", proxy);
    console2.log("New impl:      ", newImpl);
  }

  function _eq(string memory a, string memory b) private pure returns (bool) {
    return keccak256(bytes(a)) == keccak256(bytes(b));
  }
}
