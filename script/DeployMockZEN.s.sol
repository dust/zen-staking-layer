// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockZEN} from "../src/mocks/MockZEN.sol";

/// @notice Deploys the MockZEN faucet token for testnet use. Anyone can mint up to 256 ZEN per
/// call; supports EIP-2612 permit (works with ZenStaker `permitAndStake`).
///
/// Required env:
///   PRIVATE_KEY — deployer private key (hex, with or without 0x prefix)
///
/// After deploy: set ZEN_TOKEN_ADDRESS to the printed address, then run DeployZenStaker.
contract DeployMockZEN is Script {
  function run() external returns (MockZEN zen) {
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");

    vm.startBroadcast(deployerKey);
    zen = new MockZEN();
    vm.stopBroadcast();

    console2.log("MockZEN:                      ", address(zen));
    console2.log("Max mint per call (wei):      ", zen.MAX_MINT_PER_CALL());
    console2.log("NOTE: set ZEN_TOKEN_ADDRESS to this address before running DeployZenStaker.");
  }
}
