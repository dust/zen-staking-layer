// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IStationBridge} from "../../../../src/stlighter/station/IStationBridge.sol";
import {EgressStation} from "../../../../src/stlighter/station/EgressStation.sol";

/// @notice Test bridge: holds ZEN, only accepts calls from `egress`, can refund or complete.
contract MockStationBridge is IStationBridge {
  using SafeERC20 for IERC20;

  IERC20 public immutable zen;
  address public override egress;

  mapping(bytes32 => uint256) public held;
  mapping(bytes32 => address) public destOf;

  error MockStationBridge__Unauthorized();
  error MockStationBridge__UnknownId();
  error MockStationBridge__BadAmount();
  error MockStationBridge__EgressAlreadySet();

  constructor(IERC20 zen_) {
    zen = zen_;
  }

  function setEgress(address egress_) external {
    if (egress != address(0)) revert MockStationBridge__EgressAlreadySet();
    if (egress_ == address(0)) revert MockStationBridge__BadAmount();
    egress = egress_;
  }

  function bridgeZen(
    bytes32 bridgeId,
    uint256 amount,
    address destOnBase,
    bytes calldata /* extraOptions */
  ) external payable override {
    if (msg.sender != egress) revert MockStationBridge__Unauthorized();
    if (amount == 0) revert MockStationBridge__BadAmount();
    // Egress already transferred `amount` here.
    if (zen.balanceOf(address(this)) < amount) revert MockStationBridge__BadAmount();
    held[bridgeId] += amount;
    destOf[bridgeId] = destOnBase;
  }

  function mockFailAndRefund(bytes32 bridgeId) external {
    uint256 amount = held[bridgeId];
    if (amount == 0) revert MockStationBridge__UnknownId();
    held[bridgeId] = 0;
    zen.safeTransfer(egress, amount);
    EgressStation(payable(egress)).onBridgeRefund(bridgeId, amount);
  }

  function mockComplete(bytes32 bridgeId) external {
    uint256 amount = held[bridgeId];
    if (amount == 0) revert MockStationBridge__UnknownId();
    held[bridgeId] = 0;
    // Simulate funds delivered on Base — retain ZEN on adapter.
    EgressStation(payable(egress)).onBridgeComplete(bridgeId);
  }
}
