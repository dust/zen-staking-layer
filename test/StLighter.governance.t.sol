// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {ZenStaker} from "../src/ZenStaker.sol";
import {IdentityEarningPowerCalculator} from
  "../src/calculators/IdentityEarningPowerCalculator.sol";
import {StLighter} from "../src/stlighter/StLighter.sol";
import {LtZEN} from "../src/stlighter/LtZEN.sol";
import {ILtZEN} from "../src/stlighter/ILtZEN.sol";
import {ERC20VotesMock} from "./mocks/MockERC20Votes.sol";
import {EndpointV2Mock} from
  "@layerzerolabs/test-devtools-evm-foundry/mocks/EndpointV2Mock.sol";
import {StLighterProxyDeploy} from "./helpers/StLighterProxyDeploy.sol";

interface IStLighterUUPS {
  function upgradeToAndCall(address newImplementation, bytes memory data) external payable;
}

contract StLighterGovernanceTest is Test {
  uint256 internal constant MIN_DELAY = 2 days;

  ERC20VotesMock zen;
  IdentityEarningPowerCalculator calculator;
  ZenStaker zenStaker;
  LtZEN ltZen;
  StLighter protocol;
  TimelockController timelock;

  address multisig = makeAddr("multisig");
  address alice = makeAddr("alice");

  function setUp() public {
    vm.warp(1_000_000);
    zen = new ERC20VotesMock();
    calculator = new IdentityEarningPowerCalculator();
    zenStaker = new ZenStaker(IERC20(address(zen)), IERC20(address(zen)), calculator, 0, multisig);

    address[] memory proposers = _singleton(multisig);
    address[] memory executors = _singleton(address(0));
    timelock = new TimelockController(MIN_DELAY, proposers, executors, address(0));

    ltZen = new LtZEN(
      "Lighter Staked ZEN",
      "ltZEN",
      address(new EndpointV2Mock(1, address(this))),
      address(this),
      address(0)
    );

    (, protocol) = StLighterProxyDeploy.deploy(
      IERC20(address(zen)), zenStaker, ILtZEN(address(ltZen)), address(timelock)
    );

    ltZen.setMinter(address(protocol));
    ltZen.transferOwnership(address(timelock));
  }

  function test_TimelockOwnsStLighterAndLtZEN() public view {
    assertEq(protocol.owner(), address(timelock));
    assertEq(ltZen.owner(), address(timelock));
  }

  function test_MultisigCannotUpgradeWithoutTimelock() public {
    StLighter newImpl = new StLighter();
    vm.prank(multisig);
    vm.expectRevert();
    protocol.upgradeToAndCall(address(newImpl), "");
  }

  function test_UUPSUpgradeViaTimelock() public {
    zen.mint(alice, 500e18);
    vm.startPrank(alice);
    zen.approve(address(protocol), 500e18);
    uint256 shares = protocol.deposit(500e18, alice);
    vm.stopPrank();

    StLighter newImpl = new StLighter();
    bytes memory data = abi.encodeCall(IStLighterUUPS.upgradeToAndCall, (address(newImpl), ""));
    bytes32 salt = bytes32(uint256(1));

    vm.prank(multisig);
    timelock.schedule(address(protocol), 0, data, bytes32(0), salt, MIN_DELAY);

    vm.warp(block.timestamp + MIN_DELAY + 1);
    timelock.execute(address(protocol), 0, data, bytes32(0), salt);

    assertEq(protocol.issuedShares(), shares);
    assertEq(ltZen.minter(), address(protocol));
  }

  function test_LtZENOwnershipTransferIsImmediate() public {
    LtZEN spokeLtZen = new LtZEN(
      "Lighter Staked ZEN",
      "ltZEN",
      address(new EndpointV2Mock(2, address(this))),
      address(this),
      address(0)
    );
    assertEq(spokeLtZen.owner(), address(this));

    spokeLtZen.transferOwnership(address(timelock));

    assertEq(spokeLtZen.owner(), address(timelock));
  }

  function _singleton(address addr) private pure returns (address[] memory arr) {
    arr = new address[](1);
    arr[0] = addr;
  }
}
