// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Minimal stub so TestHelperOz5 / DVNMock compile without the full lz-evm-v1 npm package.
interface ILayerZeroUltraLightNodeV2 {
  function withdrawNative(address _to, uint256 _amount) external;

  function updateHash(uint16 _type, bytes32 _hash, uint64 _confirmations) external;
}
