// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ZenTokenOFTAdapter} from "../src/mocks/ZenTokenOFTAdapter.sol";

/// @notice Deploys Base-side `ZenTokenOFTAdapter` wrapping a plain ERC20 ZEN (e.g. MockZEN).
///
/// Required env:
///   BASE_ZEN_TOKEN_ADDRESS — underlying ERC20 on Base (MockZEN)
///   LZ_ENDPOINT_BASE       — LayerZero V2 Endpoint on Base
///   PRIVATE_KEY            — deployer (also initial adapter owner/delegate)
///
/// After deploy: set `BASE_ZEN_ADAPTER` / frontend `NEXT_PUBLIC_BASE_ZEN_OFT_ADAPTER_ADDRESS`.
contract DeployZenTokenOFTAdapter is Script {
  function run() external returns (ZenTokenOFTAdapter adapter) {
    address token = vm.envAddress("BASE_ZEN_TOKEN_ADDRESS");
    address lzEndpoint = vm.envAddress("LZ_ENDPOINT_BASE");
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");
    address deployer = vm.addr(deployerKey);

    vm.startBroadcast(deployerKey);
    adapter = new ZenTokenOFTAdapter(token, lzEndpoint, deployer);
    vm.stopBroadcast();

    console2.log("ZenTokenOFTAdapter (Base):", address(adapter));
    console2.log("Underlying ZEN ERC20:     ", token);
    console2.log("LZ endpoint:              ", lzEndpoint);
    console2.log("Owner/delegate:           ", deployer);
  }
}
