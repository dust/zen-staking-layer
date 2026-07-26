// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @notice Outbound bridge adapter called only by EgressStation.
/// @dev Implementations must set refund recipient to the EgressStation (`egress()`).
interface IStationBridge {
  /// @notice Bridge `amount` ZEN to `destOnBase`. Caller must be `egress()`.
  /// @dev Prefer pulling/holding ZEN already transferred by Egress, or pull via allowance.
  function bridgeZen(
    bytes32 bridgeId,
    uint256 amount,
    address destOnBase,
    bytes calldata extraOptions
  ) external payable;

  function egress() external view returns (address);
}
