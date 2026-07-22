// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @notice Encode/decode of InboundStation compose body (inside OFTComposeMsgCodec.composeMsg).
library StationComposePayload {
  uint8 internal constant VERSION_V1 = 1;

  error StationComposePayload__InvalidVersion();

  function encodeV1(address owner, uint256 assets, uint256 deadline, bytes memory signature)
    internal
    pure
    returns (bytes memory)
  {
    return abi.encode(VERSION_V1, owner, assets, deadline, signature);
  }

  function decodeV1(bytes memory payload)
    internal
    pure
    returns (address owner, uint256 assets, uint256 deadline, bytes memory signature)
  {
    uint8 version;
    (version, owner, assets, deadline, signature) =
      abi.decode(payload, (uint8, address, uint256, uint256, bytes));
    if (version != VERSION_V1) revert StationComposePayload__InvalidVersion();
  }
}
