// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {EgressStation} from "../../../src/stlighter/station/EgressStation.sol";
import {ERC20VotesMock} from "../../mocks/MockERC20Votes.sol";
import {MockStationBridge} from "./mocks/MockStationBridge.sol";
import {MockStLighterRedeem} from "./mocks/MockStLighterRedeem.sol";

contract EgressStationTest is Test {
  ERC20VotesMock zen;
  MockStationBridge mockBridge;
  MockStLighterRedeem mockStLighter;
  EgressStation station;

  address governance = makeAddr("governance");
  address relayer = makeAddr("relayer");

  uint256 ownerKey = 0xA11CE;
  address owner;

  bytes32 constant BRIDGE_TYPEHASH = keccak256(
    "BridgeToBase(uint256 assets,address dest,uint256 maxFeeZen,address relayer,address owner,uint256 nonce,uint256 deadline)"
  );
  bytes32 constant WITHDRAW_TYPEHASH = keccak256(
    "WithdrawToHorizen(uint256 assets,address to,address owner,uint256 nonce,uint256 deadline)"
  );

  function setUp() public {
    vm.warp(1_000_000);
    owner = vm.addr(ownerKey);

    zen = new ERC20VotesMock();
    mockBridge = new MockStationBridge(IERC20(address(zen)));
    mockStLighter = new MockStLighterRedeem(IERC20(address(zen)));
    station =
      new EgressStation(IERC20(address(zen)), address(mockStLighter), address(mockBridge), governance);
    mockBridge.setEgress(address(station));
  }

  function _sign(bytes32 structHash) internal view returns (bytes memory) {
    bytes32 digest =
      keccak256(abi.encodePacked("\x19\x01", station.DOMAIN_SEPARATOR(), structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
    return abi.encodePacked(r, s, v);
  }

  /// @dev Fund mock vault and redeem+credit `gross` with `fee` deducted to `relayer`.
  function _redeemAndCredit(uint256 gross, uint256 fee) internal {
    zen.mint(address(mockStLighter), gross);
    uint256 deadline = block.timestamp + 1 hours;
    vm.prank(relayer);
    station.redeemAndCredit(gross, fee, fee, relayer, owner, deadline, "");
  }

  function test_RedeemAndCredit() public {
    uint256 gross = 100e18;
    uint256 fee = 2e18;
    _redeemAndCredit(gross, fee);

    assertEq(station.credited(owner), gross - fee);
    assertEq(station.float(), 0);
    assertEq(zen.balanceOf(address(station)), gross - fee);
    assertEq(zen.balanceOf(relayer), fee);
  }

  function test_RedeemAndCreditZeroFee() public {
    uint256 gross = 50e18;
    _redeemAndCredit(gross, 0);

    assertEq(station.credited(owner), gross);
    assertEq(zen.balanceOf(relayer), 0);
  }

  function test_RedeemAndCreditRevertsWhenPaused() public {
    zen.mint(address(mockStLighter), 1e18);
    vm.prank(governance);
    station.pause();

    vm.prank(relayer);
    vm.expectRevert();
    station.redeemAndCredit(1e18, 0, 0, relayer, owner, block.timestamp + 1 hours, "");
  }

  function test_BridgeToBaseThenComplete() public {
    uint256 net = 98e18;
    uint256 fee = 2e18;
    uint256 assets = net; // credited amount bridged
    uint256 maxFee = 5e18;
    address dest = makeAddr("baseDest");
    _redeemAndCredit(net + fee, fee);

    uint256 deadline = block.timestamp + 1 hours;
    uint256 nonce = station.nonces(owner);
    bytes32 structHash = keccak256(
      abi.encode(BRIDGE_TYPEHASH, assets, dest, maxFee, relayer, owner, nonce, deadline)
    );
    bytes memory sig = _sign(structHash);

    uint256 relayerBefore = zen.balanceOf(relayer);
    vm.prank(makeAddr("submitter"));
    station.bridgeToBase(assets, dest, maxFee, fee, relayer, owner, deadline, sig, "");

    uint256 bridgeAmount = assets - fee;
    bytes32 bridgeId =
      keccak256(abi.encode(address(station), owner, nonce, dest, bridgeAmount, block.number));

    assertEq(zen.balanceOf(relayer), relayerBefore + fee);
    assertEq(station.credited(owner), 0);
    assertEq(station.pendingTotal(), bridgeAmount);
    assertEq(zen.balanceOf(address(mockBridge)), bridgeAmount);
    assertEq(mockBridge.destOf(bridgeId), dest);

    mockBridge.mockComplete(bridgeId);
    assertEq(station.pendingTotal(), 0);
    assertEq(station.credited(owner), 0);
    assertEq(zen.balanceOf(address(mockBridge)), bridgeAmount);
  }

  function test_BridgeFeeGoesToSignedRelayerNotMsgSender() public {
    uint256 assets = 80e18;
    address dest = makeAddr("baseDest");
    address feeRecipient = makeAddr("feeRecipient");
    _redeemAndCredit(assets, 0);

    uint256 deadline = block.timestamp + 1 hours;
    uint256 nonce = station.nonces(owner);
    uint256 maxFee = 5e18;
    uint256 fee = 3e18;
    bytes32 structHash = keccak256(
      abi.encode(BRIDGE_TYPEHASH, assets, dest, maxFee, feeRecipient, owner, nonce, deadline)
    );
    bytes memory sig = _sign(structHash);

    address submitter = makeAddr("submitter");
    vm.prank(submitter);
    station.bridgeToBase(assets, dest, maxFee, fee, feeRecipient, owner, deadline, sig, "");

    assertEq(zen.balanceOf(feeRecipient), fee);
    assertEq(zen.balanceOf(submitter), 0);
  }

  function test_BridgeRefundReturnsCredit_RelayerBalanceUnchanged() public {
    uint256 assets = 80e18;
    address dest = makeAddr("baseDest");
    _redeemAndCredit(assets, 0);

    uint256 deadline = block.timestamp + 1 hours;
    uint256 nonce = station.nonces(owner);
    bytes32 structHash = keccak256(
      abi.encode(BRIDGE_TYPEHASH, assets, dest, uint256(0), relayer, owner, nonce, deadline)
    );
    bytes memory sig = _sign(structHash);

    uint256 relayerZenBefore = zen.balanceOf(relayer);
    vm.prank(relayer);
    station.bridgeToBase(assets, dest, 0, 0, relayer, owner, deadline, sig, "");

    bytes32 bridgeId =
      keccak256(abi.encode(address(station), owner, nonce, dest, assets, block.number));

    mockBridge.mockFailAndRefund(bridgeId);

    assertEq(station.credited(owner), assets);
    assertEq(station.pendingTotal(), 0);
    assertEq(zen.balanceOf(address(station)), assets);
    assertEq(zen.balanceOf(relayer), relayerZenBefore);
  }

  function test_WithdrawToHorizen() public {
    uint256 assets = 40e18;
    address recipient = makeAddr("recipient");
    _redeemAndCredit(assets, 0);

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
    _redeemAndCredit(assets, 0);
    address dest = makeAddr("dest");
    uint256 deadline = block.timestamp + 1 hours;
    uint256 maxFee = 1e18;
    uint256 fee = 2e18;

    bytes32 structHash = keccak256(
      abi.encode(
        BRIDGE_TYPEHASH, assets, dest, maxFee, relayer, owner, station.nonces(owner), deadline
      )
    );
    bytes memory sig = _sign(structHash);

    vm.prank(relayer);
    vm.expectRevert(EgressStation.EgressStation__GasFeeExceedsMax.selector);
    station.bridgeToBase(assets, dest, maxFee, fee, relayer, owner, deadline, sig, "");
  }

  function test_UnauthorizedBridgeCallback() public {
    vm.expectRevert(EgressStation.EgressStation__UnauthorizedBridge.selector);
    station.onBridgeComplete(bytes32(uint256(1)));
  }

  function test_SweepFloatToUnassigned() public {
    uint256 amount = 7e18;
    address treasury = makeAddr("treasury");
    // Orphan float (direct transfer) — governance sweep only.
    zen.mint(address(station), amount);

    vm.startPrank(governance);
    station.sweepFloatToUnassigned();
    station.rescueUnassigned(treasury, amount);
    vm.stopPrank();

    assertEq(zen.balanceOf(treasury), amount);
    assertEq(station.unassigned(), 0);
    assertEq(station.float(), 0);
  }
}
