// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MessagingReceipt, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppSender.sol";
import {
  IOFT,
  SendParam,
  OFTLimit,
  OFTFeeDetail,
  OFTReceipt
} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";

/// @notice Minimal native-style OFT mock: `token() == this`, `send` burns from caller.
contract MockNativeOft is ERC20, IOFT {
  uint32 public immutable dstEid;
  uint256 public nativeFeeQuote = 0.01 ether;
  bool public forceRevert;

  uint256 public sendCount;
  address public lastRefundAddress;
  address public lastTo;
  uint256 public lastAmount;

  error MockNativeOft__ForcedRevert();
  error MockNativeOft__BadDst();

  constructor(uint32 dstEid_) ERC20("Mock ZEN OFT", "mZEN") {
    dstEid = dstEid_;
  }

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }

  function setNativeFeeQuote(uint256 fee) external {
    nativeFeeQuote = fee;
  }

  function setForceRevert(bool v) external {
    forceRevert = v;
  }

  function oftVersion() external pure returns (bytes4 interfaceId, uint64 version) {
    return (0x02e49c2c, 1);
  }

  function token() external view returns (address) {
    return address(this);
  }

  function approvalRequired() external pure returns (bool) {
    return false;
  }

  function sharedDecimals() external pure returns (uint8) {
    return 6;
  }

  function quoteOFT(SendParam calldata _sendParam)
    external
    pure
    returns (OFTLimit memory, OFTFeeDetail[] memory, OFTReceipt memory)
  {
    OFTLimit memory limit = OFTLimit(0, type(uint256).max);
    OFTFeeDetail[] memory fees = new OFTFeeDetail[](0);
    OFTReceipt memory receipt = OFTReceipt(_sendParam.amountLD, _sendParam.amountLD);
    return (limit, fees, receipt);
  }

  function quoteSend(SendParam calldata, bool) external view returns (MessagingFee memory) {
    return MessagingFee(nativeFeeQuote, 0);
  }

  function send(SendParam calldata _sendParam, MessagingFee calldata _fee, address _refundAddress)
    external
    payable
    returns (MessagingReceipt memory, OFTReceipt memory)
  {
    if (forceRevert) revert MockNativeOft__ForcedRevert();
    if (_sendParam.dstEid != dstEid) revert MockNativeOft__BadDst();

    _burn(msg.sender, _sendParam.amountLD);

    // Refund excess native to refundAddress (mirrors LZ excess fee behaviour).
    if (msg.value > _fee.nativeFee) {
      (bool ok,) = _refundAddress.call{value: msg.value - _fee.nativeFee}("");
      require(ok, "refund failed");
    }

    sendCount++;
    lastRefundAddress = _refundAddress;
    lastTo = address(uint160(uint256(_sendParam.to)));
    lastAmount = _sendParam.amountLD;

    bytes32 guid = keccak256(abi.encode(sendCount, _sendParam.to, _sendParam.amountLD));
    MessagingReceipt memory receipt = MessagingReceipt(guid, uint64(sendCount), _fee);
    OFTReceipt memory oftReceipt = OFTReceipt(_sendParam.amountLD, _sendParam.amountLD);
    return (receipt, oftReceipt);
  }
}
