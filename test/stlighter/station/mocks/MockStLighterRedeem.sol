// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IStLighterRedeem} from "../../../../src/stlighter/station/IStLighterRedeem.sol";

/// @notice Minimal redeem sink for EgressStation unit tests (1:1 shares→assets).
contract MockStLighterRedeem is IStLighterRedeem {
  using SafeERC20 for IERC20;

  IERC20 public immutable zen;

  error MockStLighterRedeem__ZeroAmount();
  error MockStLighterRedeem__ZeroAddress();

  constructor(IERC20 zen_) {
    zen = zen_;
  }

  /// @dev Pre-fund this mock with ZEN. Pays `feeZen` to `relayer`, net to `receiver`.
  function redeemWithSig(
    uint256 shares,
    address receiver,
    uint256, /* maxFeeZen */
    uint256 feeZen,
    address relayer,
    address user,
    uint256, /* deadline */
    bytes calldata /* signature */
  ) external returns (uint256 assets) {
    if (shares == 0) revert MockStLighterRedeem__ZeroAmount();
    if (receiver == address(0) || relayer == address(0) || user == address(0)) {
      revert MockStLighterRedeem__ZeroAddress();
    }
    assets = shares; // 1:1 for tests
    if (feeZen >= assets) revert MockStLighterRedeem__ZeroAmount();

    if (feeZen != 0) {
      zen.safeTransfer(relayer, feeZen);
    }
    zen.safeTransfer(receiver, assets - feeZen);
  }
}
