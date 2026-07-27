// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {MessagingReceipt, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppSender.sol";
import {IOFT, SendParam, OFTReceipt} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";

import {IStationBridge} from "./IStationBridge.sol";
import {EgressStation} from "./EgressStation.sol";

/// @title ZenOftStationBridge
/// @notice Production `IStationBridge`: sends Horizen native ZenTokenOFT to Base.
/// @dev Destination unlocks ERC20 ZEN via the existing Base `ZenTokenOFTAdapter`.
/// `refundAddress` for LZ native fee excess is always `egress`. On successful `oft.send`,
/// source accounting is finalized via `EgressStation.onBridgeComplete` in the same tx (tokens
/// are burned/locked by the OFT). Pre-send failures revert the whole Egress `bridgeToBase` tx.
contract ZenOftStationBridge is IStationBridge, Ownable2Step, ReentrancyGuard {
  using SafeERC20 for IERC20;

  IOFT public immutable oft;
  IERC20 public immutable zen;
  address public immutable override egress;
  uint32 public immutable dstEid;
  /// @notice `10 ** (token.decimals - oft.sharedDecimals)` — dust floor for minAmountLD.
  uint256 public immutable decimalConversionRate;

  mapping(bytes32 bridgeId => bytes32 guid) public guidOf;

  event BridgeSent(
    bytes32 indexed bridgeId,
    bytes32 indexed guid,
    address indexed destOnBase,
    uint256 amountLD,
    uint256 amountReceivedLD,
    uint256 nativeFee
  );
  event NativeSwept(address indexed to, uint256 amount);
  event TokenSwept(address indexed to, uint256 amount);

  error ZenOftStationBridge__ZeroAddress();
  error ZenOftStationBridge__ZeroAmount();
  error ZenOftStationBridge__Unauthorized();
  error ZenOftStationBridge__InsufficientBalance();
  error ZenOftStationBridge__InsufficientNativeFee();
  error ZenOftStationBridge__TokenMismatch();
  error ZenOftStationBridge__InvalidDecimals();

  constructor(address oft_, address egress_, uint32 dstEid_, address owner_) Ownable(owner_) {
    if (oft_ == address(0) || egress_ == address(0) || owner_ == address(0)) {
      revert ZenOftStationBridge__ZeroAddress();
    }
    if (dstEid_ == 0) revert ZenOftStationBridge__ZeroAmount();

    oft = IOFT(oft_);
    address token = IOFT(oft_).token();
    if (token == address(0)) revert ZenOftStationBridge__ZeroAddress();
    zen = IERC20(token);
    egress = egress_;
    dstEid = dstEid_;

    uint8 localDecimals = IERC20Metadata(token).decimals();
    uint8 shared = IOFT(oft_).sharedDecimals();
    if (localDecimals < shared) revert ZenOftStationBridge__InvalidDecimals();
    decimalConversionRate = 10 ** uint256(localDecimals - shared);

    // EgressStation.zen() must be this OFT token — enforced at first bridge by balance checks.
    if (address(EgressStation(payable(egress_)).zen()) != token) {
      revert ZenOftStationBridge__TokenMismatch();
    }
  }

  /// @inheritdoc IStationBridge
  /// @dev `extraOptions` = LayerZero executor options (e.g. OptionsBuilder). `msg.value` pays nativeFee.
  function bridgeZen(
    bytes32 bridgeId,
    uint256 amount,
    address destOnBase,
    bytes calldata extraOptions
  ) external payable nonReentrant {
    if (msg.sender != egress) revert ZenOftStationBridge__Unauthorized();
    if (amount == 0) revert ZenOftStationBridge__ZeroAmount();
    if (destOnBase == address(0)) revert ZenOftStationBridge__ZeroAddress();
    if (zen.balanceOf(address(this)) < amount) revert ZenOftStationBridge__InsufficientBalance();

    if (oft.approvalRequired()) {
      zen.forceApprove(address(oft), amount);
    }

    SendParam memory sendParam = _buildSendParam(amount, destOnBase, extraOptions);

    MessagingFee memory fee = oft.quoteSend(sendParam, false);
    if (msg.value < fee.nativeFee) revert ZenOftStationBridge__InsufficientNativeFee();

    // Excess native fee refunds to EgressStation (never the relayer EOA).
    (MessagingReceipt memory receipt, OFTReceipt memory oftReceipt) =
      oft.send{value: msg.value}(sendParam, fee, egress);

    guidOf[bridgeId] = receipt.guid;
    emit BridgeSent(
      bridgeId,
      receipt.guid,
      destOnBase,
      oftReceipt.amountSentLD,
      oftReceipt.amountReceivedLD,
      receipt.fee.nativeFee
    );

    // Source funds left via OFT debit — finalize egress pending in-tx.
    EgressStation(payable(egress)).onBridgeComplete(bridgeId);
  }

  /// @notice Quote native fee for a bridge (relayer UX).
  function quoteBridgeNativeFee(uint256 amount, address destOnBase, bytes calldata extraOptions)
    external
    view
    returns (uint256 nativeFee)
  {
    return oft.quoteSend(_buildSendParam(amount, destOnBase, extraOptions), false).nativeFee;
  }

  /// @dev minAmountLD = amount minus sub-sharedDecimals dust only (rejects future OFT fee haircuts).
  function _buildSendParam(uint256 amount, address destOnBase, bytes calldata extraOptions)
    internal
    view
    returns (SendParam memory)
  {
    uint256 minAmountLD = amount - (amount % decimalConversionRate);
    return SendParam({
      dstEid: dstEid,
      to: bytes32(uint256(uint160(destOnBase))),
      amountLD: amount,
      minAmountLD: minAmountLD,
      extraOptions: extraOptions,
      composeMsg: bytes(""),
      oftCmd: bytes("")
    });
  }

  function sweepNative(address to, uint256 amount) external onlyOwner {
    if (to == address(0)) revert ZenOftStationBridge__ZeroAddress();
    (bool ok,) = to.call{value: amount}("");
    require(ok, "native sweep failed");
    emit NativeSwept(to, amount);
  }

  function sweepToken(address to, uint256 amount) external onlyOwner {
    if (to == address(0)) revert ZenOftStationBridge__ZeroAddress();
    zen.safeTransfer(to, amount);
    emit TokenSwept(to, amount);
  }

  receive() external payable {}
}
