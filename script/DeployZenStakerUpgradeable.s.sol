// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IEarningPowerCalculator} from "../src/interfaces/IEarningPowerCalculator.sol";
import {IdentityEarningPowerCalculator} from
  "../src/calculators/IdentityEarningPowerCalculator.sol";
import {ZenStakerUpgradeable} from "../src/ZenStakerUpgradeable.sol";

/// @notice Deploys IdentityEarningPowerCalculator, then ZenStakerUpgradeable
/// (implementation) + ERC1967Proxy (proxy). The proxy is the canonical staker
/// address for all user and admin interactions.
///
/// Required environment variables:
///   ZEN_TOKEN_ADDRESS  — address of the deployed ZEN ERC20 token
///   ADMIN_ADDRESS      — address of the Horizen multisig (becomes staker admin)
///   PRIVATE_KEY        — deployer private key (hex, with or without 0x prefix)
///
/// Optional:
///   MAX_BUMP_TIP       — uint256, defaults to 0
contract DeployZenStakerUpgradeable is Script {
  function run()
    external
    returns (
      IdentityEarningPowerCalculator calculator,
      ZenStakerUpgradeable implementation,
      ZenStakerUpgradeable proxy
    )
  {
    address zenToken = vm.envAddress("ZEN_TOKEN_ADDRESS");
    address admin = vm.envAddress("ADMIN_ADDRESS");
    uint256 maxBumpTip = vm.envOr("MAX_BUMP_TIP", uint256(0));
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");

    vm.startBroadcast(deployerKey);

    // Step 1: deploy supporting contracts
    calculator = new IdentityEarningPowerCalculator();
    console2.log("IdentityEarningPowerCalculator:", address(calculator));

    // Step 2: deploy the implementation (sets immutables, locks initializers)
    implementation = new ZenStakerUpgradeable(IERC20(zenToken));
    console2.log("ZenStakerUpgradeable (impl):   ", address(implementation));

    // Step 3: deploy the proxy and initialize in one transaction
    bytes memory initData = abi.encodeCall(
      ZenStakerUpgradeable.initialize,
      (admin, IEarningPowerCalculator(address(calculator)), maxBumpTip)
    );
    proxy = ZenStakerUpgradeable(address(new ERC1967Proxy(address(implementation), initData)));
    console2.log("ZenStakerUpgradeable (proxy):  ", address(proxy));
    console2.log("Admin:                         ", admin);
    console2.log("ZEN token:                     ", zenToken);

    vm.stopBroadcast();
  }
}
