// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {EgressStation} from "../src/stlighter/station/EgressStation.sol";
import {ZenOftStationBridge} from "../src/stlighter/station/ZenOftStationBridge.sol";
import {StLighterGovernanceLib} from "./StLighterGovernanceLib.sol";

/// @notice Redeploy `ZenOftStationBridge` and point an existing EgressStation at it via `setBridge`.
///
/// Use when Bridge logic changes (e.g. minAmountLD dust fix) without replacing Egress accounting.
///
/// Required env:
///   ZEN_TOKEN_ADDRESS
///   EGRESS_STATION_ADDRESS
///   BASE_EID
///   PRIVATE_KEY — must be current EgressStation owner
///   GOVERNANCE_ADDRESS / TIMELOCK_ADDRESS — Bridge owner
contract RedeployZenOftStationBridge is Script {
  function run() external returns (ZenOftStationBridge bridge) {
    address zenOft = vm.envAddress("ZEN_TOKEN_ADDRESS");
    address egress = vm.envAddress("EGRESS_STATION_ADDRESS");
    uint32 dstEid = uint32(vm.envUint("BASE_EID"));
    address owner_ = StLighterGovernanceLib.timelockAddress();
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");

    vm.startBroadcast(deployerKey);
    bridge = new ZenOftStationBridge(zenOft, egress, dstEid, owner_);
    EgressStation(payable(egress)).setBridge(address(bridge));
    vm.stopBroadcast();

    console2.log("ZenOftStationBridge: ", address(bridge));
    console2.log("EgressStation:       ", egress);
    console2.log("egress.bridge():     ", address(EgressStation(payable(egress)).bridge()));
  }
}
