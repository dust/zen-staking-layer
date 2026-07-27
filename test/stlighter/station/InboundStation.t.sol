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
  uint32 constant SRC_EID = 40_245;

  ERC20VotesMock zen;
  MockStLighterDeposit mockStLighter;
  InboundStation station;

  address governance = makeAddr("governance");
  address composeCaller = makeAddr("composeCaller");
  address zenOft = makeAddr("zenOft");
  address relayer = makeAddr("relayer");

  uint256 ownerKey = 0xA11CE;
  address owner;
  uint256 nextUnorderedNonce = 1;

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
      IERC20(address(zen)), address(mockStLighter), composeCaller, zenOft, SRC_EID, governance
    );
  }

  function _allocNonce() internal returns (uint256 nonce) {
    nonce = nextUnorderedNonce;
    nextUnorderedNonce += 1;
  }

  function _signStation(bytes32 structHash) internal view returns (bytes memory) {
    bytes32 digest =
      keccak256(abi.encodePacked("\x19\x01", station.DOMAIN_SEPARATOR(), structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
    return abi.encodePacked(r, s, v);
  }

  function _creditSig(uint256 assets, uint256 nonce, uint256 deadline)
    internal
    view
    returns (bytes memory)
  {
    return _signStation(
      keccak256(abi.encode(CREDIT_TYPEHASH, assets, owner, nonce, deadline))
    );
  }

  function _buildLzMessage(
    uint256 assets,
    uint256 nonce,
    uint256 deadline,
    bytes memory signature,
    uint32 srcEid
  ) internal view returns (bytes memory) {
    bytes memory userPayload =
      StationComposePayload.encodeV1(owner, assets, nonce, deadline, signature);
    bytes memory composeFromAndMsg =
      abi.encodePacked(OFTComposeMsgCodec.addressToBytes32(zenOft), userPayload);
    return OFTComposeMsgCodec.encode(uint64(1), srcEid, assets, composeFromAndMsg);
  }

  function _lzCompose(uint256 assets, uint256 nonce, bytes32 guid) internal {
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _creditSig(assets, nonce, deadline);
    bytes memory message = _buildLzMessage(assets, nonce, deadline, sig, SRC_EID);
    zen.mint(address(station), assets);
    vm.prank(composeCaller);
    station.lzCompose(zenOft, guid, message, address(0), "");
  }

  function _credit(uint256 assets) internal {
    _lzCompose(assets, _allocNonce(), keccak256(abi.encode(assets, nextUnorderedNonce)));
  }

  function test_LzComposeCreditsOwner() public {
    uint256 assets = 55e18;
    uint256 nonce = 7;
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _creditSig(assets, nonce, deadline);
    bytes memory message = _buildLzMessage(assets, nonce, deadline, sig, SRC_EID);
    bytes32 guid = keccak256("guid-1");

    zen.mint(address(station), assets);
    vm.prank(composeCaller);
    station.lzCompose(zenOft, guid, message, address(0), "");

    assertEq(station.credited(owner), assets);
    // Sequential Nonces untouched by compose.
    assertEq(station.nonces(owner), 0);
    // Bitmap bit set for nonce 7 (word 0, bit 7).
    assertEq(station.nonceBitmap(owner, 0) & (uint256(1) << 7), uint256(1) << 7);
  }

  function test_LzComposeOutOfOrderNoncesBothSucceed() public {
    uint256 a0 = 10e18;
    uint256 a1 = 20e18;
    uint256 n0 = 100;
    uint256 n1 = 200;
    uint256 deadline = block.timestamp + 1 hours;

    bytes memory sig1 = _creditSig(a1, n1, deadline);
    bytes memory msg1 = _buildLzMessage(a1, n1, deadline, sig1, SRC_EID);
    bytes memory sig0 = _creditSig(a0, n0, deadline);
    bytes memory msg0 = _buildLzMessage(a0, n0, deadline, sig0, SRC_EID);

    zen.mint(address(station), a0 + a1);

    // Arrive out of order: nonce 200 before 100.
    vm.prank(composeCaller);
    station.lzCompose(zenOft, keccak256("g1"), msg1, address(0), "");
    vm.prank(composeCaller);
    station.lzCompose(zenOft, keccak256("g0"), msg0, address(0), "");

    assertEq(station.credited(owner), a0 + a1);
  }

  function test_LzComposeRevertsReplaySameNonce() public {
    uint256 assets = 10e18;
    uint256 nonce = 42;
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _creditSig(assets, nonce, deadline);
    bytes memory message = _buildLzMessage(assets, nonce, deadline, sig, SRC_EID);

    zen.mint(address(station), assets * 2);
    vm.prank(composeCaller);
    station.lzCompose(zenOft, keccak256("g1"), message, address(0), "");

    vm.prank(composeCaller);
    vm.expectRevert(InboundStation.InboundStation__InvalidNonce.selector);
    station.lzCompose(zenOft, keccak256("g2"), message, address(0), "");

    assertEq(station.credited(owner), assets);
  }

  function test_WithdrawDoesNotInvalidateComposeNonce() public {
    uint256 creditAssets = 50e18;
    uint256 composeNonce = 9;
    uint256 deadline = block.timestamp + 1 hours;

    // Pre-sign compose, then withdraw (consumes sequential nonce), then compose should still work.
    bytes memory composeSig = _creditSig(creditAssets, composeNonce, deadline);
    bytes memory message =
      _buildLzMessage(creditAssets, composeNonce, deadline, composeSig, SRC_EID);

    _credit(30e18); // fund credited balance for withdraw
    address recipient = makeAddr("recipient");
    bytes memory withdrawSig = _signStation(
      keccak256(
        abi.encode(
          WITHDRAW_TYPEHASH, uint256(10e18), recipient, owner, station.nonces(owner), deadline
        )
      )
    );
    vm.prank(relayer);
    station.withdrawToHorizen(10e18, recipient, owner, deadline, withdrawSig);
    assertEq(station.nonces(owner), 1);

    zen.mint(address(station), creditAssets);
    vm.prank(composeCaller);
    station.lzCompose(zenOft, keccak256("compose-after-withdraw"), message, address(0), "");
    assertEq(station.credited(owner), 30e18 - 10e18 + creditAssets);
  }

  function test_LzComposeRevertsInvalidSrcEid() public {
    uint256 assets = 1e18;
    uint256 nonce = 1;
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _creditSig(assets, nonce, deadline);
    bytes memory message = _buildLzMessage(assets, nonce, deadline, sig, SRC_EID + 1);
    zen.mint(address(station), assets);

    vm.prank(composeCaller);
    vm.expectRevert(InboundStation.InboundStation__InvalidSrcEid.selector);
    station.lzCompose(zenOft, bytes32(0), message, address(0), "");
  }

  function test_LzComposeRevertsUnauthorizedCaller() public {
    uint256 assets = 1e18;
    uint256 nonce = 1;
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _creditSig(assets, nonce, deadline);
    bytes memory message = _buildLzMessage(assets, nonce, deadline, sig, SRC_EID);
    zen.mint(address(station), assets);

    vm.expectRevert(InboundStation.InboundStation__UnauthorizedComposer.selector);
    station.lzCompose(zenOft, bytes32(0), message, address(0), "");
  }

  function test_LzComposeRevertsUnauthorizedOft() public {
    uint256 assets = 1e18;
    uint256 nonce = 1;
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _creditSig(assets, nonce, deadline);
    bytes memory message = _buildLzMessage(assets, nonce, deadline, sig, SRC_EID);
    zen.mint(address(station), assets);

    vm.prank(composeCaller);
    vm.expectRevert(InboundStation.InboundStation__UnauthorizedOft.selector);
    station.lzCompose(makeAddr("otherOft"), bytes32(0), message, address(0), "");
  }

  function test_LzComposeRevertsAmountMismatch() public {
    uint256 assets = 10e18;
    uint256 nonce = 1;
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _creditSig(assets, nonce, deadline);
    bytes memory userPayload =
      StationComposePayload.encodeV1(owner, assets, nonce, deadline, sig);
    bytes memory composeFromAndMsg =
      abi.encodePacked(OFTComposeMsgCodec.addressToBytes32(zenOft), userPayload);
    bytes memory message =
      OFTComposeMsgCodec.encode(uint64(1), SRC_EID, assets + 1, composeFromAndMsg);

    zen.mint(address(station), assets + 1);
    vm.prank(composeCaller);
    vm.expectRevert(InboundStation.InboundStation__AmountMismatch.selector);
    station.lzCompose(zenOft, bytes32(0), message, address(0), "");
  }

  function test_LzComposeRevertsIfTokensMissing() public {
    uint256 assets = 1e18;
    uint256 nonce = 1;
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _creditSig(assets, nonce, deadline);
    bytes memory message = _buildLzMessage(assets, nonce, deadline, sig, SRC_EID);

    vm.prank(composeCaller);
    vm.expectRevert(StationAccounting.StationAccounting__InvariantBroken.selector);
    station.lzCompose(zenOft, bytes32(0), message, address(0), "");
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
    uint256 nonce = 1;
    uint256 deadline = block.timestamp + 1 hours;
    bytes memory sig = _creditSig(assets, nonce, deadline);
    bytes memory message = _buildLzMessage(assets, nonce, deadline, sig, SRC_EID);
    zen.mint(address(station), assets);

    vm.prank(governance);
    station.pause();

    vm.prank(composeCaller);
    vm.expectRevert();
    station.lzCompose(zenOft, bytes32(0), message, address(0), "");
  }

  function test_SweepNative() public {
    address payable treasury = payable(makeAddr("treasury"));
    vm.deal(address(station), 1.5 ether);

    vm.prank(governance);
    station.sweepNative(treasury);

    assertEq(address(station).balance, 0);
    assertEq(treasury.balance, 1.5 ether);
  }

  function test_SweepNativeRevertsNonOwner() public {
    vm.deal(address(station), 1 ether);
    vm.expectRevert();
    station.sweepNative(payable(relayer));
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
