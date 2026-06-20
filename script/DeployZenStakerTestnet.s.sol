// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IEarningPowerCalculator} from "../src/interfaces/IEarningPowerCalculator.sol";
import {IdentityEarningPowerCalculator} from "../src/calculators/IdentityEarningPowerCalculator.sol";
import {ZenStakerUpgradeable} from "../src/ZenStakerUpgradeable.sol";
import {ERC20VotesMock} from "../test/mocks/MockERC20Votes.sol";

/// @notice Testnet deployment: deploys a public-mint ERC20 test token, then
/// IdentityEarningPowerCalculator + ZenStakerUpgradeable (impl) + ERC1967Proxy.
/// The deployer becomes the staker admin.
///
/// Required env:
///   PRIVATE_KEY — deployer private key (hex, with or without 0x prefix)
contract DeployZenStakerTestnet is Script {
  function run()
    external
    returns (
      ERC20VotesMock testToken,
      IdentityEarningPowerCalculator calculator,
      ZenStakerUpgradeable implementation,
      ZenStakerUpgradeable proxy
    )
  {
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");
    address deployer = vm.addr(deployerKey);

    vm.startBroadcast(deployerKey);

    testToken = new ERC20VotesMock();
    console2.log("TestToken (ERC20VotesMock):    ", address(testToken));

    calculator = new IdentityEarningPowerCalculator();
    console2.log("IdentityEarningPowerCalculator:", address(calculator));

    implementation = new ZenStakerUpgradeable(IERC20(address(testToken)));
    console2.log("ZenStakerUpgradeable (impl):   ", address(implementation));

    bytes memory initData = abi.encodeCall(
      ZenStakerUpgradeable.initialize,
      (deployer, IEarningPowerCalculator(address(calculator)), uint256(0))
    );
    proxy =
      ZenStakerUpgradeable(address(new ERC1967Proxy(address(implementation), initData)));
    console2.log("ZenStakerUpgradeable (proxy):  ", address(proxy));
    console2.log("Admin (deployer):              ", deployer);

    vm.stopBroadcast();
  }
}
