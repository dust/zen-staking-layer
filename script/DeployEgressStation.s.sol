// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {EgressStation} from "../src/stlighter/station/EgressStation.sol";
import {ZenOftStationBridge} from "../src/stlighter/station/ZenOftStationBridge.sol";
import {StLighterGovernanceLib} from "./StLighterGovernanceLib.sol";

/// @notice Deploys Horizen Wave B egress stack: `EgressStation` + `ZenOftStationBridge`.
///
/// Circular constructor dependency (see checklist Phase G / ZenOftStationBridge.t.sol):
///   1. `EgressStation(zen, placeholderBridge, deployer)` — placeholder = `address(1)` (never called)
///   2. `ZenOftStationBridge(oft, egress, BASE_EID, owner)`
///   3. `egress.setBridge(realBridge)` then optionally `transferOwnership(governance)`
///
/// Required env:
///   ZEN_TOKEN_ADDRESS       — Horizen ZenTokenOFT (`zen` + bridge `oft`)
///   STLIGHTER_PROXY_ADDRESS — StLighter proxy (immutable on Egress for redeemAndCredit)
///   BASE_EID                — Base Sepolia LZ endpoint id (immutable on Bridge)
///   PRIVATE_KEY             — deployer (must be able to call `setBridge` as temporary owner)
///
/// Owner: `TIMELOCK_ADDRESS` or `GOVERNANCE_ADDRESS`. On testnet use deployer EOA so
/// `setBridge` succeeds in the same broadcast. If owner ≠ deployer, script transfers
/// Egress ownership (Ownable2Step — governance must `acceptOwnership`).
contract DeployEgressStation is Script {
  /// @dev Non-zero throwaway; Egress only stores it until `setBridge`.
  address internal constant BRIDGE_PLACEHOLDER = address(1);

  function run() external returns (EgressStation station, ZenOftStationBridge bridge) {
    address zenOft = vm.envAddress("ZEN_TOKEN_ADDRESS");
    address stLighter = vm.envAddress("STLIGHTER_PROXY_ADDRESS");
    uint32 dstEid = uint32(vm.envUint("BASE_EID"));
    address owner_ = StLighterGovernanceLib.timelockAddress();
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");
    address deployer = vm.addr(deployerKey);

    vm.startBroadcast(deployerKey);

    // Temporary owner = deployer so `setBridge` can run in this broadcast.
    station = new EgressStation(IERC20(zenOft), stLighter, BRIDGE_PLACEHOLDER, deployer);
    bridge = new ZenOftStationBridge(zenOft, address(station), dstEid, owner_);
    station.setBridge(address(bridge));

    if (owner_ != deployer) {
      station.transferOwnership(owner_);
    }

    vm.stopBroadcast();

    console2.log("EgressStation:         ", address(station));
    console2.log("ZenOftStationBridge:   ", address(bridge));
    console2.log("stLighter:             ", stLighter);
    console2.log("zen / oft:             ", zenOft);
    console2.log("dstEid (Base):         ", dstEid);
    console2.log("bridge.egress:         ", bridge.egress());
    console2.log("egress.bridge:         ", address(station.bridge()));
    console2.log("egress owner (current):", station.owner());
    console2.log("bridge owner:          ", bridge.owner());
    if (owner_ != deployer) {
      console2.log("pending Egress owner:  ", owner_);
      console2.log("governance must acceptOwnership on EgressStation");
    }
  }
}
