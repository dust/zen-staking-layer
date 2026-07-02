// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ZenStakerUpgradeable} from "../src/ZenStakerUpgradeable.sol";

/// @notice Deploys a new ZenStakerUpgradeable implementation and upgrades an
/// existing ERC1967 proxy to point to it.
///
/// The caller (PRIVATE_KEY) must be the current staker admin, because
/// `upgradeToAndCall` is gated by `_authorizeUpgrade → _revertIfNotAdmin`.
///
/// Required environment variables:
///   PROXY_ADDRESS      — address of the deployed ZenStakerUpgradeable proxy
///   ZEN_TOKEN_ADDRESS  — address of the ZEN ERC20 token (needed for the
///                        new implementation constructor)
///   PRIVATE_KEY        — admin private key (hex, with or without 0x prefix)
///
/// Dry-run  (no broadcast):
///   forge script script/UpgradeZenStakerUpgradeable.s.sol \
///     --rpc-url $RPC_URL
///
/// Broadcast:
///   forge script script/UpgradeZenStakerUpgradeable.s.sol \
///     --rpc-url $RPC_URL --broadcast --verify
contract UpgradeZenStakerUpgradeable is Script {
  function run() external returns (ZenStakerUpgradeable newImplementation) {
    address proxyAddr = vm.envAddress("PROXY_ADDRESS");
    address zenToken  = vm.envAddress("ZEN_TOKEN_ADDRESS");
    uint256 adminKey  = vm.envUint("PRIVATE_KEY");

    ZenStakerUpgradeable proxy = ZenStakerUpgradeable(proxyAddr);

    // Sanity-check: confirm the caller is the current admin before broadcasting
    address currentAdmin = proxy.admin();
    address broadcaster  = vm.addr(adminKey);
    require(
      broadcaster == currentAdmin,
      string.concat(
        "UpgradeZenStakerUpgradeable: caller is not admin. ",
        "current admin=", vm.toString(currentAdmin),
        " caller=", vm.toString(broadcaster)
      )
    );

    console2.log("Proxy:           ", proxyAddr);
    console2.log("Current admin:   ", currentAdmin);
    console2.log("ZEN token:       ", zenToken);

    vm.startBroadcast(adminKey);

    // Deploy new implementation (sets immutables, locks initializers)
    newImplementation = new ZenStakerUpgradeable(IERC20(zenToken));
    console2.log("New impl:        ", address(newImplementation));

    // Upgrade the proxy — no re-initialization needed; state is preserved
    proxy.upgradeToAndCall(address(newImplementation), "");
    console2.log("Upgrade complete. Proxy still at:", proxyAddr);

    vm.stopBroadcast();
  }
}
