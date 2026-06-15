// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ZenStaker} from "../src/ZenStaker.sol";
import {
  IdentityEarningPowerCalculator
} from "../src/calculators/IdentityEarningPowerCalculator.sol";
import {StLighter} from "../src/stlighter/StLighter.sol";
import {LtZEN} from "../src/stlighter/LtZEN.sol";
import {ILtZEN} from "../src/stlighter/ILtZEN.sol";
import {ERC20VotesMock} from "./mocks/MockERC20Votes.sol";
import {EndpointV2Mock} from "@layerzerolabs/test-devtools-evm-foundry/mocks/EndpointV2Mock.sol";
import {StLighterProxyDeploy} from "./helpers/StLighterProxyDeploy.sol";

contract StLighterUpgradeTest is Test {
  ERC20VotesMock zen;
  IdentityEarningPowerCalculator calculator;
  ZenStaker zenStaker;
  LtZEN ltZen;
  StLighter implementationV1;
  StLighter protocol;

  address governance = makeAddr("governance");
  address alice = makeAddr("alice");

  function setUp() public {
    vm.warp(1_000_000);
    zen = new ERC20VotesMock();
    calculator = new IdentityEarningPowerCalculator();
    zenStaker = new ZenStaker(IERC20(address(zen)), IERC20(address(zen)), calculator, 0, governance);

    ltZen = new LtZEN(
      "Lighter Staked ZEN",
      "ltZEN",
      address(new EndpointV2Mock(1, address(this))),
      address(this),
      address(0)
    );
    (implementationV1, protocol) = StLighterProxyDeploy.deploy(
      IERC20(address(zen)), zenStaker, ILtZEN(address(ltZen)), governance
    );
    ltZen.setMinter(address(protocol));
  }

  function test_InitializeCannotBeCalledTwice() public {
    vm.expectRevert(Initializable.InvalidInitialization.selector);
    protocol.initialize(IERC20(address(zen)), zenStaker, ILtZEN(address(ltZen)), governance);
  }

  function test_ImplementationRejectsDirectInitialize() public {
    vm.expectRevert(Initializable.InvalidInitialization.selector);
    implementationV1.initialize(IERC20(address(zen)), zenStaker, ILtZEN(address(ltZen)), governance);
  }

  function test_UUPSUpgradePreservesState() public {
    zen.mint(alice, 1000e18);
    vm.startPrank(alice);
    zen.approve(address(protocol), 1000e18);
    uint256 shares = protocol.deposit(1000e18, alice);
    vm.stopPrank();

    StLighter implementationV2 = new StLighter();
    vm.prank(governance);
    protocol.upgradeToAndCall(address(implementationV2), "");

    assertEq(protocol.issuedShares(), shares);
    assertEq(ltZen.balanceOf(alice), shares);
    assertTrue(protocol.initialized());

    vm.prank(alice);
    uint256 assets = protocol.redeem(shares, alice);
    assertApproxEqAbs(assets, 1000e18, 1e12);
  }

  function test_OnlyOwnerCanUpgrade() public {
    StLighter implementationV2 = new StLighter();
    vm.prank(alice);
    vm.expectRevert();
    protocol.upgradeToAndCall(address(implementationV2), "");
  }

  function test_ProxyAddressStableForLtZENMinter() public {
    address proxyAddr = address(protocol);
    assertEq(ltZen.minter(), proxyAddr);

    StLighter implementationV2 = new StLighter();
    vm.prank(governance);
    protocol.upgradeToAndCall(address(implementationV2), "");

    assertEq(ltZen.minter(), proxyAddr);
  }
}
