// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

/// @notice Station callback used by `StLighter.depositWithSig` when `payer != user`.
/// @dev Implementations must debit the user's credited balance and transfer `assets` of ZEN
/// to `msg.sender` (StLighter).
interface IStationDepositPayer {
  function payForDeposit(address user, uint256 assets) external;
}
