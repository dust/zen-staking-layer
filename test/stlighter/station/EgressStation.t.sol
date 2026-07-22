// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {EgressStation} from "../../../src/stlighter/station/EgressStation.sol";
import {ERC20VotesMock} from "../../mocks/MockERC20Votes.sol";
import {MockStationBridge} from "./mocks/MockStationBridge.sol";

contract EgressStationTest is Test {
  ERC20VotesMock zen;
  MockStationBridge mockBridge;
  EgressStation station;

  address governance = makeAddr("governance");
  address relayer = makeAddr("relayer");

  uint256 ownerKey = 0xA11CE;
  address owner;

  bytes32 constant CREDIT_TYPEHASH = keccak256(
    "CreditFromRedeem(uint256 assets,address owner,uint256 nonce,uint256 deadline)"
  );
  bytes32 constant BRIDGE_TYPEHASH = keccak256(
    "BridgeToBase(uint256 assets,address dest,uint256 maxFeeZen,address owner,uint256 nonce,uint256 deadline)"
  );
  bytes32 constant WITHDRAW_TYPEHASH = keccak256(
    "WithdrawToHorizen(uint256 assets,address to,address owner,uint256 nonce,uint256 deadline)"
  );

  function setUp() public {
    vm.warp(1_000_000);
    owner = vm.addr(ownerKey);

    zen = new ERC20VotesMock();
    mockBridge = new MockStationBridge(IERC20(address(zen)));
    station = new EgressStation(IERC20(address(zen)), address(mockBridge), governance);
    mockBridge.setEgress(address(station));
  }

  function _sign(bytes32 structHash) internal view returns (bytes memory) {
    bytes32 digest =
      keccak256(abi.encodePacked("\x19\x01", station.DOMAIN_SEPARATOR(), structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
    return abi.encodePacked(r, s, v);
  }

  function _deliverFloat(uint256 assets) internal {
    zen.mint(address(station), assets);
  }

  function _credit(uint256 assets) internal {
    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, assets, owner, station.nonces(owner), deadline)
    );
    bytes memory sig = _sign(structHash);
    station.creditFromRedeem(assets, owner, deadline, sig);
  }

  function test_CreditFromRedeem() public {
    uint256 assets = 100e18;
    _deliverFloat(assets);
    _credit(assets);

    assertEq(station.credited(owner), assets);
    assertEq(station.float(), 0);
    assertEq(zen.balanceOf(address(station)), assets);
  }

  function test_CreditRevertsWithoutMatchingFloat() public {
    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, uint256(1e18), owner, station.nonces(owner), deadline)
    );
    bytes memory sig = _sign(structHash);

    vm.expectRevert(EgressStation.EgressStation__InsufficientFloat.selector);
    station.creditFromRedeem(1e18, owner, deadline, sig);
  }

  function test_CreditRevertsBadSignature() public {
    _deliverFloat(10e18);
    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, uint256(10e18), owner, station.nonces(owner), deadline)
    );
    (uint8 v, bytes32 r, bytes32 s) =
      vm.sign(0xB0B, keccak256(abi.encodePacked("\x19\x01", station.DOMAIN_SEPARATOR(), structHash)));
    bytes memory sig = abi.encodePacked(r, s, v);

    vm.expectRevert(EgressStation.EgressStation__InvalidSignature.selector);
    station.creditFromRedeem(10e18, owner, deadline, sig);
  }

  function test_CreditRevertsReplay() public {
    _deliverFloat(20e18);
    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, uint256(10e18), owner, station.nonces(owner), deadline)
    );
    bytes memory sig = _sign(structHash);
    station.creditFromRedeem(10e18, owner, deadline, sig);

    vm.expectRevert(EgressStation.EgressStation__InvalidSignature.selector);
    station.creditFromRedeem(10e18, owner, deadline, sig);
  }

  function test_SnatchFailsWithoutOwnerSig() public {
    // Attacker cannot credit float to themselves without a valid owner signature.
    address attacker = makeAddr("attacker");
    _deliverFloat(50e18);
    uint256 deadline = block.timestamp + 1 hours;
    // Attacker signs for themselves — but that only credits attacker if they have float;
    // the point is they cannot steal owner's intended credit without owner's key.
    // Owner signed for owner; attacker tries to use that sig with different owner — fails.
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, uint256(50e18), owner, station.nonces(owner), deadline)
    );
    bytes memory ownerSig = _sign(structHash);

    vm.expectRevert(EgressStation.EgressStation__InvalidSignature.selector);
    station.creditFromRedeem(50e18, attacker, deadline, ownerSig);

    assertEq(station.credited(attacker), 0);
    assertEq(station.float(), 50e18);
  }

  function test_BridgeToBaseThenComplete() public {
    uint256 assets = 100e18;
    uint256 maxFee = 5e18;
    uint256 fee = 2e18;
    address dest = makeAddr("baseDest");
    _deliverFloat(assets);
    _credit(assets);

    uint256 deadline = block.timestamp + 1 hours;
    uint256 nonce = station.nonces(owner);
    bytes32 structHash = keccak256(
      abi.encode(BRIDGE_TYPEHASH, assets, dest, maxFee, owner, nonce, deadline)
    );
    bytes memory sig = _sign(structHash);

    vm.prank(relayer);
    station.bridgeToBase(assets, dest, maxFee, fee, owner, deadline, sig, "");

    uint256 bridgeAmount = assets - fee;
    bytes32 bridgeId =
      keccak256(abi.encode(address(station), owner, nonce, dest, bridgeAmount, block.number));

    assertEq(zen.balanceOf(relayer), fee);
    assertEq(station.credited(owner), 0);
    assertEq(station.pendingTotal(), bridgeAmount);
    assertEq(zen.balanceOf(address(mockBridge)), bridgeAmount);
    assertEq(mockBridge.destOf(bridgeId), dest);

    mockBridge.mockComplete(bridgeId);
    assertEq(station.pendingTotal(), 0);
    assertEq(station.credited(owner), 0);
    // Adapter retains ZEN (simulated Base delivery).
    assertEq(zen.balanceOf(address(mockBridge)), bridgeAmount);
  }

  function test_BridgeRefundReturnsCredit_RelayerBalanceUnchanged() public {
    uint256 assets = 80e18;
    address dest = makeAddr("baseDest");
    _deliverFloat(assets);
    _credit(assets);

    uint256 deadline = block.timestamp + 1 hours;
    uint256 nonce = station.nonces(owner);
    bytes32 structHash = keccak256(
      abi.encode(BRIDGE_TYPEHASH, assets, dest, uint256(0), owner, nonce, deadline)
    );
    bytes memory sig = _sign(structHash);

    uint256 relayerZenBefore = zen.balanceOf(relayer);
    vm.prank(relayer);
    station.bridgeToBase(assets, dest, 0, 0, owner, deadline, sig, "");

    bytes32 bridgeId =
      keccak256(abi.encode(address(station), owner, nonce, dest, assets, block.number));

    mockBridge.mockFailAndRefund(bridgeId);

    assertEq(station.credited(owner), assets);
    assertEq(station.pendingTotal(), 0);
    assertEq(zen.balanceOf(address(station)), assets);
    // Negative acceptance: relayer ZEN must not increase on refund.
    assertEq(zen.balanceOf(relayer), relayerZenBefore);
  }

  function test_WithdrawToHorizen() public {
    uint256 assets = 40e18;
    address recipient = makeAddr("recipient");
    _deliverFloat(assets);
    _credit(assets);

    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(
        WITHDRAW_TYPEHASH, assets, recipient, owner, station.nonces(owner), deadline
      )
    );
    bytes memory sig = _sign(structHash);

    vm.prank(relayer);
    station.withdrawToHorizen(assets, recipient, owner, deadline, sig);

    assertEq(zen.balanceOf(recipient), assets);
    assertEq(station.credited(owner), 0);
  }

  function test_BridgeRevertsFeeOverMax() public {
    uint256 assets = 50e18;
    _deliverFloat(assets);
    _credit(assets);
    address dest = makeAddr("dest");
    uint256 deadline = block.timestamp + 1 hours;
    uint256 maxFee = 1e18;
    uint256 fee = 2e18;

    bytes32 structHash = keccak256(
      abi.encode(
        BRIDGE_TYPEHASH, assets, dest, maxFee, owner, station.nonces(owner), deadline
      )
    );
    bytes memory sig = _sign(structHash);

    vm.prank(relayer);
    vm.expectRevert(EgressStation.EgressStation__GasFeeExceedsMax.selector);
    station.bridgeToBase(assets, dest, maxFee, fee, owner, deadline, sig, "");
  }

  function test_UnauthorizedBridgeCallback() public {
    vm.expectRevert(EgressStation.EgressStation__UnauthorizedBridge.selector);
    station.onBridgeComplete(bytes32(uint256(1)));
  }

  function test_SweepFloatToUnassigned() public {
    uint256 amount = 7e18;
    address treasury = makeAddr("treasury");
    _deliverFloat(amount);

    vm.startPrank(governance);
    station.sweepFloatToUnassigned();
    station.rescueUnassigned(treasury, amount);
    vm.stopPrank();

    assertEq(zen.balanceOf(treasury), amount);
    assertEq(station.unassigned(), 0);
    assertEq(station.float(), 0);
  }

  function test_CreditRevertsWhenPaused() public {
    _deliverFloat(1e18);
    vm.prank(governance);
    station.pause();

    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, uint256(1e18), owner, station.nonces(owner), deadline)
    );
    bytes memory sig = _sign(structHash);

    vm.expectRevert();
    station.creditFromRedeem(1e18, owner, deadline, sig);
  }
}
