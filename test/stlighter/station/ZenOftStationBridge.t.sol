// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {EgressStation} from "../../../src/stlighter/station/EgressStation.sol";
import {ZenOftStationBridge} from "../../../src/stlighter/station/ZenOftStationBridge.sol";
import {MockStationBridge} from "./mocks/MockStationBridge.sol";
import {MockNativeOft} from "./mocks/MockNativeOft.sol";
import {MockStLighterRedeem} from "./mocks/MockStLighterRedeem.sol";

contract ZenOftStationBridgeTest is Test {
  uint32 constant DST_EID = 30_184;

  MockNativeOft oft;
  MockStationBridge placeholderBridge;
  MockStLighterRedeem mockStLighter;
  EgressStation station;
  ZenOftStationBridge bridge;

  address governance = makeAddr("governance");
  address relayer = makeAddr("relayer");

  uint256 ownerKey = 0xA11CE;
  address owner;

  bytes32 constant BRIDGE_TYPEHASH = keccak256(
    "BridgeToBase(uint256 assets,address dest,uint256 maxFeeZen,address relayer,address owner,uint256 nonce,uint256 deadline)"
  );

  function setUp() public {
    vm.warp(1_000_000);
    owner = vm.addr(ownerKey);

    oft = new MockNativeOft(DST_EID);
    mockStLighter = new MockStLighterRedeem(IERC20(address(oft)));
    // Circular deploy: Egress needs a bridge address first.
    placeholderBridge = new MockStationBridge(IERC20(address(oft)));
    station = new EgressStation(
      IERC20(address(oft)), address(mockStLighter), address(placeholderBridge), governance
    );
    placeholderBridge.setEgress(address(station));

    bridge = new ZenOftStationBridge(address(oft), address(station), DST_EID, governance);
    vm.prank(governance);
    station.setBridge(address(bridge));
  }

  function _sign(bytes32 structHash) internal view returns (bytes memory) {
    bytes32 digest =
      keccak256(abi.encodePacked("\x19\x01", station.DOMAIN_SEPARATOR(), structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
    return abi.encodePacked(r, s, v);
  }

  function _credit(uint256 assets) internal {
    oft.mint(address(mockStLighter), assets);
    uint256 deadline = block.timestamp + 1 hours;
    vm.prank(relayer);
    station.redeemAndCredit(assets, 0, 0, relayer, owner, deadline, "");
  }

  function test_BridgeToBaseSendsOftAndCompletes() public {
    uint256 assets = 100e18;
    address dest = makeAddr("baseDest");
    _credit(assets);

    uint256 deadline = block.timestamp + 1 hours;
    uint256 nonce = station.nonces(owner);
    bytes32 structHash = keccak256(
      abi.encode(BRIDGE_TYPEHASH, assets, dest, uint256(0), relayer, owner, nonce, deadline)
    );
    bytes memory sig = _sign(structHash);

    uint256 fee = bridge.quoteBridgeNativeFee(assets, dest, "");
    vm.deal(relayer, fee + 1 ether);

    uint256 egressEthBefore = address(station).balance;

    vm.prank(relayer);
    station.bridgeToBase{value: fee + 0.05 ether}(
      assets, dest, 0, 0, relayer, owner, deadline, sig, ""
    );

    // OFT burned from adapter; pending cleared via onBridgeComplete in-tx.
    assertEq(station.pendingTotal(), 0);
    assertEq(station.credited(owner), 0);
    assertEq(oft.balanceOf(address(bridge)), 0);
    assertEq(oft.sendCount(), 1);
    assertEq(oft.lastRefundAddress(), address(station));
    assertEq(oft.lastTo(), dest);
    assertEq(oft.lastAmount(), assets);
    // Excess native fee refunded to Egress, not relayer.
    assertEq(address(station).balance, egressEthBefore + 0.05 ether);
    assertEq(relayer.balance, 1 ether - 0.05 ether);
  }

  function test_BridgeRevertsInsufficientNativeFee() public {
    uint256 assets = 10e18;
    address dest = makeAddr("baseDest");
    _credit(assets);

    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(
        BRIDGE_TYPEHASH, assets, dest, uint256(0), relayer, owner, station.nonces(owner), deadline
      )
    );
    bytes memory sig = _sign(structHash);

    uint256 fee = bridge.quoteBridgeNativeFee(assets, dest, "");
    vm.deal(relayer, fee);

    vm.prank(relayer);
    vm.expectRevert(ZenOftStationBridge.ZenOftStationBridge__InsufficientNativeFee.selector);
    station.bridgeToBase{value: fee - 1}(assets, dest, 0, 0, relayer, owner, deadline, sig, "");

    // Full tx reverted — credit untouched.
    assertEq(station.credited(owner), assets);
    assertEq(station.pendingTotal(), 0);
  }

  function test_BridgeRevertsWhenOftReverts_RollsBackCredit() public {
    uint256 assets = 10e18;
    address dest = makeAddr("baseDest");
    _credit(assets);
    oft.setForceRevert(true);

    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(
        BRIDGE_TYPEHASH, assets, dest, uint256(0), relayer, owner, station.nonces(owner), deadline
      )
    );
    bytes memory sig = _sign(structHash);
    uint256 fee = bridge.quoteBridgeNativeFee(assets, dest, "");
    vm.deal(relayer, fee);

    vm.prank(relayer);
    vm.expectRevert(MockNativeOft.MockNativeOft__ForcedRevert.selector);
    station.bridgeToBase{value: fee}(assets, dest, 0, 0, relayer, owner, deadline, sig, "");

    assertEq(station.credited(owner), assets);
    assertEq(station.pendingTotal(), 0);
  }

  function test_UnauthorizedCallerCannotBridge() public {
    oft.mint(address(bridge), 1e18);
    vm.expectRevert(ZenOftStationBridge.ZenOftStationBridge__Unauthorized.selector);
    bridge.bridgeZen{value: 0.01 ether}(bytes32(uint256(1)), 1e18, makeAddr("d"), "");
  }

  function test_ConstructorRejectsTokenMismatch() public {
    // Egress still points at oft token; deploy a different OFT-shaped token.
    MockNativeOft other = new MockNativeOft(DST_EID);
    vm.expectRevert(ZenOftStationBridge.ZenOftStationBridge__TokenMismatch.selector);
    new ZenOftStationBridge(address(other), address(station), DST_EID, governance);
  }

  function test_QuoteBridgeNativeFeeTruncatesDustLikeSend() public {
    uint256 assets = 100e18 + 123; // dusty vs sharedDecimals=6
    address dest = makeAddr("baseDest");
    // Must not revert SlippageExceeded — quote mirrors bridgeZen truncation.
    uint256 fee = bridge.quoteBridgeNativeFee(assets, dest, "");
    assertEq(fee, oft.nativeFeeQuote());
  }

  function test_BridgeSetsMinAmountLDDustFloor() public {
    uint256 assets = 100e18 + 123; // dust remainder vs sharedDecimals=6
    address dest = makeAddr("baseDest");
    _credit(assets);

    uint256 deadline = block.timestamp + 1 hours;
    uint256 nonce = station.nonces(owner);
    bytes32 structHash = keccak256(
      abi.encode(BRIDGE_TYPEHASH, assets, dest, uint256(0), relayer, owner, nonce, deadline)
    );
    bytes memory sig = _sign(structHash);

    uint256 rate = bridge.decimalConversionRate();
    uint256 dust = assets % rate;
    uint256 sendAmount = assets - dust;
    uint256 fee = bridge.quoteBridgeNativeFee(assets, dest, "");
    vm.deal(relayer, fee);

    vm.prank(relayer);
    station.bridgeToBase{value: fee}(assets, dest, 0, 0, relayer, owner, deadline, sig, "");

    assertEq(oft.lastAmount(), sendAmount);
    assertEq(oft.lastMinAmount(), sendAmount);
    assertEq(station.credited(owner), dust);
    assertEq(station.pendingTotal(), 0);
    assertEq(oft.balanceOf(address(bridge)), 0);
  }

  function test_BridgeRevertsWhenOftFeeHaircutBelowMin() public {
    uint256 assets = 100e18;
    address dest = makeAddr("baseDest");
    _credit(assets);
    // Haircut larger than dust floor → amountReceived < minAmountLD.
    oft.setFeeHaircut(1e12); // one shared-decimal unit in LD

    uint256 deadline = block.timestamp + 1 hours;
    bytes32 structHash = keccak256(
      abi.encode(
        BRIDGE_TYPEHASH, assets, dest, uint256(0), relayer, owner, station.nonces(owner), deadline
      )
    );
    bytes memory sig = _sign(structHash);
    uint256 fee = bridge.quoteBridgeNativeFee(assets, dest, "");
    vm.deal(relayer, fee);

    vm.prank(relayer);
    vm.expectRevert(MockNativeOft.MockNativeOft__SlippageExceeded.selector);
    station.bridgeToBase{value: fee}(assets, dest, 0, 0, relayer, owner, deadline, sig, "");

    assertEq(station.credited(owner), assets);
    assertEq(station.pendingTotal(), 0);
  }
}
