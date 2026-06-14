// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ILtZEN
/// @notice Minimal interface for the ltZEN share token as seen by the stLighter protocol.
/// @dev ltZEN is a pure LayerZero V2 OFT share token (OFT + ERC20Permit). It holds NO vault
/// accounting — all share<->asset math lives in the stLighter protocol contract. Only the
/// controlled `minter` (the protocol on Horizen) may mint/burn for deposit/redeem; the LayerZero
/// Endpoint mints/burns along the OFT cross-chain path via the standard OFT mechanism.
interface ILtZEN is IERC20 {
  /// @notice Mint shares to `_to`. Restricted to the protocol minter (Horizen only).
  function mint(address _to, uint256 _amount) external;

  /// @notice Burn shares from `_from`. Restricted to the protocol minter (Horizen only).
  function burn(address _from, uint256 _amount) external;
}
