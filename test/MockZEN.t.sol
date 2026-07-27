// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Staker} from "../src/Staker.sol";
import {ZenStaker} from "../src/ZenStaker.sol";
import {IdentityEarningPowerCalculator} from "../src/calculators/IdentityEarningPowerCalculator.sol";
import {MockZEN} from "../src/mocks/MockZEN.sol";

contract MockZENTest is Test {
  MockZEN zen;

  address alice = makeAddr("alice");

  function setUp() public {
    zen = new MockZEN();
  }

  function test_MetadataIsZen() public view {
    assertEq(zen.name(), "Mock ZEN");
    assertEq(zen.symbol(), "ZEN");
    assertEq(zen.decimals(), 18);
    assertEq(zen.MAX_MINT_PER_CALL(), 256e18);
  }

  function test_MintUpToCap() public {
    zen.mint(alice, 256e18);
    assertEq(zen.balanceOf(alice), 256e18);
  }

  function test_MintSmallAmount() public {
    zen.mint(alice, 1e18);
    assertEq(zen.balanceOf(alice), 1e18);
  }

  function test_FaucetMintsFullCapToCaller() public {
    vm.prank(alice);
    zen.mint();
    assertEq(zen.balanceOf(alice), 256e18);
  }

  function test_RevertWhen_MintExceedsCap() public {
    vm.expectRevert(
      abi.encodeWithSelector(MockZEN.MockZEN__MintAmountExceedsCap.selector, 256e18 + 1, 256e18)
    );
    zen.mint(alice, 256e18 + 1);
  }

  function testFuzz_MintRespectsCap(uint256 _amount) public {
    if (_amount > 256e18) {
      vm.expectRevert(
        abi.encodeWithSelector(MockZEN.MockZEN__MintAmountExceedsCap.selector, _amount, 256e18)
      );
      zen.mint(alice, _amount);
    } else {
      zen.mint(alice, _amount);
      assertEq(zen.balanceOf(alice), _amount);
    }
  }

  function test_AnyoneCanMint() public {
    address bob = makeAddr("bob");
    vm.prank(bob);
    zen.mint(bob, 100e18);
    assertEq(zen.balanceOf(bob), 100e18);
  }

  function test_DelegationIsMocked() public {
    address delegatee = makeAddr("delegatee");
    vm.prank(alice);
    zen.delegate(delegatee);
    assertEq(zen.delegates(alice), delegatee);
  }
}

/// @notice Proves MockZEN's EIP-2612 permit works end-to-end with ZenStaker.permitAndStake,
/// i.e. a user can stake without a separate approve transaction (the gasless-friendly path).
contract MockZENPermitAndStake is Test {
  bytes32 constant PERMIT_TYPEHASH =
    keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

  MockZEN zen;
  IdentityEarningPowerCalculator calculator;
  ZenStaker staker;
  address admin = makeAddr("admin");

  function setUp() public {
    vm.warp(1_000_000);
    zen = new MockZEN();
    calculator = new IdentityEarningPowerCalculator();
    staker = new ZenStaker(IERC20(address(zen)), calculator, 0, admin);
  }

  function test_PermitAndStakeWithoutPriorApproval() public {
    uint256 depositorKey = 0xA11CE;
    address depositor = vm.addr(depositorKey);
    uint256 amount = 256e18; // exactly one mint cap

    vm.prank(depositor);
    zen.mint(depositor, amount);

    uint256 deadline = block.timestamp + 1 hours;
    bytes32 message = keccak256(
      abi.encode(
        PERMIT_TYPEHASH, depositor, address(staker), amount, zen.nonces(depositor), deadline
      )
    );
    bytes32 messageHash =
      keccak256(abi.encodePacked("\x19\x01", zen.DOMAIN_SEPARATOR(), message));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(depositorKey, messageHash);

    vm.prank(depositor);
    Staker.DepositIdentifier depositId =
      staker.permitAndStake(amount, depositor, depositor, deadline, v, r, s);

    (uint96 balance, address owner,,,,) = staker.getDepositInfo(depositId);
    assertEq(balance, amount);
    assertEq(owner, depositor);
    assertEq(zen.balanceOf(depositor), 0);
  }
}
