// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @notice Minimal StLighter surface used by EgressStation.redeemAndCredit.
interface IStLighterRedeem {
  function redeemWithSig(
    uint256 shares,
    address receiver,
    uint256 maxFeeZen,
    uint256 feeZen,
    address relayer,
    address user,
    uint256 deadline,
    bytes calldata signature
  ) external returns (uint256 assets);
}
