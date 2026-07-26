// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {OFTComposeMsgCodec} from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";

import {InboundStation} from "../../../src/stlighter/station/InboundStation.sol";
import {StationAccounting} from "../../../src/stlighter/station/StationAccounting.sol";
import {StationComposePayload} from "../../../src/stlighter/station/libraries/StationComposePayload.sol";
import {ERC20VotesMock} from "../../mocks/MockERC20Votes.sol";
import {MockStLighterDeposit} from "./mocks/MockStLighterDeposit.sol";

contract InboundStationTest is Test {
  ERC20VotesMock zen;
  MockStLighterDeposit mockStLighter;
  InboundStation station;

  address governance = makeAddr("governance");
  address composeCaller = makeAddr("composeCaller");
  address zenOft = makeAddr("zenOft");
  address relayer = makeAddr("relayer");

  uint256 ownerKey = 0xA11CE;
  address owner;

  bytes32 constant CREDIT_TYPEHASH = keccak256(
    "CreditFromCompose(uint256 assets,address owner,uint256 nonce,uint256 deadline)"
  );
  bytes32 constant WITHDRAW_TYPEHASH = keccak256(
    "WithdrawToHorizen(uint256 assets,address to,address owner,uint256 nonce,uint256 deadline)"
  );

  function setUp() public {
    vm.warp(1_000_000);
    owner = vm.addr(ownerKey);

    zen = new ERC20VotesMock();
    mockStLighter = new MockStLighterDeposit(IERC20(address(zen)));
    station = new InboundStation(
      IERC20(address(zen)), address(mockStLighter), composeCaller, zenOft, governance
    );
  }

  function _credit(uint256 assets) internal {
    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, assets, owner, station.nonces(owner), deadline)
    );
    bytes memory sig = _signStation(structHash);

    zen.mint(address(station), assets);
    vm.prank(composeCaller);
    station.creditFromTrustedComposer(assets, owner, deadline, sig);
  }

  function _signStation(bytes32 structHash) internal view returns (bytes memory) {
    bytes32 digest =
      keccak256(abi.encodePacked("\x19\x01", station.DOMAIN_SEPARATOR(), structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
    return abi.encodePacked(r, s, v);
  }

  function _buildLzMessage(uint256 assets, uint256 deadline, bytes memory signature)
    internal
    view
    returns (bytes memory)
  {
    bytes memory userPayload = StationComposePayload.encodeV1(owner, assets, deadline, signature);
    bytes memory composeFromAndMsg =
      abi.encodePacked(OFTComposeMsgCodec.addressToBytes32(zenOft), userPayload);
    return OFTComposeMsgCodec.encode(uint64(1), uint32(30_184), assets, composeFromAndMsg);
  }

  function test_CreditFromTrustedComposer() public {
    uint256 assets = 100e18;
    _credit(assets);

    assertEq(station.credited(owner), assets);
    assertEq(station.totalCredited(), assets);
    assertEq(zen.balanceOf(address(station)), assets);
  }

  function test_LzComposeCreditsOwner() public {
    uint256 assets = 55e18;
    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, assets, owner, station.nonces(owner), deadline)
    );
    bytes memory sig = _signStation(structHash);
    bytes memory message = _buildLzMessage(assets, deadline, sig);
    bytes32 guid = keccak256("guid-1");

    zen.mint(address(station), assets);
    vm.prank(composeCaller);
    station.lzCompose(zenOft, guid, message, address(0), "");

    assertEq(station.credited(owner), assets);
    assertEq(station.nonces(owner), 1);
  }

  function test_LzComposeRevertsUnauthorizedCaller() public {
    uint256 assets = 1e18;
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _signStation(
      keccak256(abi.encode(CREDIT_TYPEHASH, assets, owner, station.nonces(owner), deadline))
    );
    bytes memory message = _buildLzMessage(assets, deadline, sig);
    zen.mint(address(station), assets);

    vm.expectRevert(InboundStation.InboundStation__UnauthorizedComposer.selector);
    station.lzCompose(zenOft, bytes32(0), message, address(0), "");
  }

  function test_LzComposeRevertsUnauthorizedOft() public {
    uint256 assets = 1e18;
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _signStation(
      keccak256(abi.encode(CREDIT_TYPEHASH, assets, owner, station.nonces(owner), deadline))
    );
    bytes memory message = _buildLzMessage(assets, deadline, sig);
    zen.mint(address(station), assets);

    vm.prank(composeCaller);
    vm.expectRevert(InboundStation.InboundStation__UnauthorizedOft.selector);
    station.lzCompose(makeAddr("otherOft"), bytes32(0), message, address(0), "");
  }

  function test_LzComposeRevertsAmountMismatch() public {
    uint256 assets = 10e18;
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _signStation(
      keccak256(abi.encode(CREDIT_TYPEHASH, assets, owner, station.nonces(owner), deadline))
    );
    // Envelope amountLD differs from signed/payload assets.
    bytes memory userPayload = StationComposePayload.encodeV1(owner, assets, deadline, sig);
    bytes memory composeFromAndMsg =
      abi.encodePacked(OFTComposeMsgCodec.addressToBytes32(zenOft), userPayload);
    bytes memory message =
      OFTComposeMsgCodec.encode(uint64(1), uint32(30_184), assets + 1, composeFromAndMsg);

    zen.mint(address(station), assets + 1);
    vm.prank(composeCaller);
    vm.expectRevert(InboundStation.InboundStation__AmountMismatch.selector);
    station.lzCompose(zenOft, bytes32(0), message, address(0), "");
  }

  function test_CreditRevertsUnauthorizedComposer() public {
    uint256 assets = 1e18;
    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, assets, owner, station.nonces(owner), deadline)
    );
    bytes memory sig = _signStation(structHash);
    zen.mint(address(station), assets);

    vm.expectRevert(InboundStation.InboundStation__UnauthorizedComposer.selector);
    station.creditFromTrustedComposer(assets, owner, deadline, sig);
  }

  function test_CreditRevertsReplayNonce() public {
    uint256 assets = 10e18;
    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, assets, owner, station.nonces(owner), deadline)
    );
    bytes memory sig = _signStation(structHash);

    zen.mint(address(station), assets * 2);
    vm.prank(composeCaller);
    station.creditFromTrustedComposer(assets, owner, deadline, sig);

    vm.prank(composeCaller);
    vm.expectRevert(InboundStation.InboundStation__InvalidSignature.selector);
    station.creditFromTrustedComposer(assets, owner, deadline, sig);
  }

  function test_CreditRevertsIfTokensMissing() public {
    uint256 assets = 1e18;
    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, assets, owner, station.nonces(owner), deadline)
    );
    bytes memory sig = _signStation(structHash);

    vm.prank(composeCaller);
    vm.expectRevert(StationAccounting.StationAccounting__InvariantBroken.selector);
    station.creditFromTrustedComposer(assets, owner, deadline, sig);
  }

  function test_StakeViaDepositWithSigPayer() public {
    uint256 assets = 1000e18;
    uint256 maxFee = 5e18;
    uint256 fee = 3e18;
    uint256 deadline = block.timestamp + 1 hours;
    _credit(assets);

    vm.prank(relayer);
    uint256 shares = mockStLighter.depositWithSig(
      assets, owner, maxFee, fee, address(station), relayer, owner, deadline, ""
    );

    assertEq(shares, assets - fee);
    assertEq(mockStLighter.balanceOf(owner), assets - fee);
    assertEq(zen.balanceOf(relayer), fee);
    assertEq(station.credited(owner), 0);
    assertEq(zen.balanceOf(address(station)), 0);
  }

  function test_PayForDepositRevertsUnauthorizedCaller() public {
    _credit(10e18);
    vm.expectRevert(InboundStation.InboundStation__UnauthorizedStLighter.selector);
    station.payForDeposit(owner, 1e18);
  }

  function test_WithdrawToHorizen() public {
    uint256 assets = 50e18;
    address recipient = makeAddr("recipient");
    _credit(assets);
    uint256 deadline = block.timestamp + 1 hours;

    bytes32 structHash = keccak256(
      abi.encode(
        WITHDRAW_TYPEHASH, assets, recipient, owner, station.nonces(owner), deadline
      )
    );
    bytes memory sig = _signStation(structHash);

    vm.prank(relayer);
    station.withdrawToHorizen(assets, recipient, owner, deadline, sig);

    assertEq(zen.balanceOf(recipient), assets);
    assertEq(station.credited(owner), 0);
  }

  function test_CreditRevertsWhenPaused() public {
    uint256 assets = 10e18;
    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(CREDIT_TYPEHASH, assets, owner, station.nonces(owner), deadline)
    );
    bytes memory sig = _signStation(structHash);
    zen.mint(address(station), assets);

    vm.prank(governance);
    station.pause();

    vm.prank(composeCaller);
    vm.expectRevert();
    station.creditFromTrustedComposer(assets, owner, deadline, sig);
  }

  function test_RescueUnassigned() public {
    uint256 amount = 7e18;
    address treasury = makeAddr("treasury");
    zen.mint(address(station), amount);

    vm.startPrank(governance);
    station.sweepFloatToUnassigned();
    station.rescueUnassigned(treasury, amount);
    vm.stopPrank();

    assertEq(zen.balanceOf(treasury), amount);
    assertEq(station.unassigned(), 0);
  }
}
