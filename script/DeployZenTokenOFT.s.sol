// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ZenTokenOFT} from "../src/mocks/ZenTokenOFT.sol";

/// @notice Deploys Horizen-native ZEN as LayerZero `ZenTokenOFT` (token == OFT).
///
/// Required env:
///   LZ_ENDPOINT_HORIZEN — LayerZero V2 Endpoint on Horizen
///   PRIVATE_KEY         — deployer (also initial OFT owner/delegate)
///
/// Optional:
///   ZEN_OFT_NAME / ZEN_OFT_SYMBOL — defaults "ZEN" / "ZEN"
///
/// After deploy: set `ZEN_TOKEN_ADDRESS` to the printed address, then run DeployZenStaker.
contract DeployZenTokenOFT is Script {
  function run() external returns (ZenTokenOFT zenOft) {
    address lzEndpoint = vm.envAddress("LZ_ENDPOINT_HORIZEN");
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");
    address deployer = vm.addr(deployerKey);
    string memory name_ = vm.envOr("ZEN_OFT_NAME", string("ZEN"));
    string memory symbol_ = vm.envOr("ZEN_OFT_SYMBOL", string("ZEN"));

    vm.startBroadcast(deployerKey);
    zenOft = new ZenTokenOFT(name_, symbol_, lzEndpoint, deployer);
    vm.stopBroadcast();

    console2.log("ZenTokenOFT (Horizen ZEN):", address(zenOft));
    console2.log("LZ endpoint:              ", lzEndpoint);
    console2.log("Owner/delegate:           ", deployer);
    console2.log("NOTE: set ZEN_TOKEN_ADDRESS to this address before DeployZenStaker.");
  }
}
