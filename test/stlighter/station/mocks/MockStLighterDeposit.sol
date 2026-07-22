// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IStationDepositPayer} from "../../../../src/stlighter/station/IStationDepositPayer.sol";

/// @notice Minimal deposit sink for InboundStation unit tests (1:1 shares, no Staker).
/// @dev Mirrors StLighter's payer pull: `payer == user` → transferFrom; else `payForDeposit`.
contract MockStLighterDeposit is ERC20 {
  using SafeERC20 for IERC20;

  IERC20 public immutable zen;

  error MockStLighterDeposit__ZeroAmount();
  error MockStLighterDeposit__ZeroAddress();

  constructor(IERC20 zen_) ERC20("Mock ltZEN", "mltZEN") {
    zen = zen_;
  }

  function depositWithSig(
    uint256 assets,
    address receiver,
    uint256, /* maxFeeZen */
    uint256 feeZen,
    address payer,
    address user,
    uint256, /* deadline */
    bytes calldata /* signature */
  ) external returns (uint256 shares) {
    if (assets == 0) revert MockStLighterDeposit__ZeroAmount();
    if (receiver == address(0) || user == address(0) || payer == address(0)) {
      revert MockStLighterDeposit__ZeroAddress();
    }
    if (feeZen >= assets) revert MockStLighterDeposit__ZeroAmount();

    if (payer == user) {
      zen.safeTransferFrom(user, address(this), assets);
    } else {
      IStationDepositPayer(payer).payForDeposit(user, assets);
    }

    if (feeZen != 0) {
      zen.safeTransfer(msg.sender, feeZen);
    }

    shares = assets - feeZen;
    _mint(receiver, shares);
  }
}
