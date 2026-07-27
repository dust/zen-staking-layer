// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @notice Encode/decode of InboundStation compose body (inside OFTComposeMsgCodec.composeMsg).
/// @dev V1 carries an unordered (bitmap) `nonce` so compose can arrive out of order.
library StationComposePayload {
  uint8 internal constant VERSION_V1 = 1;

  error StationComposePayload__InvalidVersion();

  function encodeV1(
    address owner,
    uint256 assets,
    uint256 nonce,
    uint256 deadline,
    bytes memory signature
  ) internal pure returns (bytes memory) {
    return abi.encode(VERSION_V1, owner, assets, nonce, deadline, signature);
  }

  function decodeV1(bytes memory payload)
    internal
    pure
    returns (address owner, uint256 assets, uint256 nonce, uint256 deadline, bytes memory signature)
  {
    uint8 version;
    (version, owner, assets, nonce, deadline, signature) =
      abi.decode(payload, (uint8, address, uint256, uint256, uint256, bytes));
    if (version != VERSION_V1) revert StationComposePayload__InvalidVersion();
  }
}
