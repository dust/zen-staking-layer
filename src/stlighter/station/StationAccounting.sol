// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StationAccounting
/// @notice Shared credited / unassigned bookkeeping for InboundStation and EgressStation.
/// @dev Tokens must already sit on the station before `_credit`. Invariant after every mutation:
/// `zen.balanceOf(this) >= totalCredited + unassigned` (plus pending locks on Egress).
abstract contract StationAccounting {
  using SafeERC20 for IERC20;

  IERC20 internal _zen;

  /// @notice Spendable ZEN credited to each owner.
  mapping(address owner => uint256 amount) public credited;

  /// @notice ZEN held by the station but not assigned to any user credit.
  uint256 public unassigned;

  /// @notice Sum of all `credited` balances.
  uint256 public totalCredited;

  /// @dev Reserved for accounting layout upgrades if a station later becomes upgradeable.
  uint256[45] private __gap;

  event Credited(address indexed owner, uint256 amount, bytes32 indexed reason);
  event Debited(address indexed owner, uint256 amount, bytes32 indexed reason);
  event UnassignedIncreased(uint256 amount);
  event UnassignedRescued(address indexed to, uint256 amount);

  error StationAccounting__ZeroAmount();
  error StationAccounting__ZeroAddress();
  error StationAccounting__InsufficientCredit();
  error StationAccounting__InsufficientUnassigned();
  error StationAccounting__InvariantBroken();

  function zen() public view returns (IERC20) {
    return _zen;
  }

  function _setZen(IERC20 zen_) internal {
    if (address(zen_) == address(0)) revert StationAccounting__ZeroAddress();
    _zen = zen_;
  }

  /// @dev Assign already-held ZEN to `owner`. Reverts if the station balance cannot cover credits.
  function _credit(address owner, uint256 amount, bytes32 reason) internal {
    if (owner == address(0)) revert StationAccounting__ZeroAddress();
    if (amount == 0) revert StationAccounting__ZeroAmount();

    credited[owner] += amount;
    totalCredited += amount;
    _assertSolvency();

    emit Credited(owner, amount, reason);
  }

  function _debit(address owner, uint256 amount, bytes32 reason) internal {
    if (amount == 0) revert StationAccounting__ZeroAmount();
    uint256 bal = credited[owner];
    if (bal < amount) revert StationAccounting__InsufficientCredit();

    unchecked {
      credited[owner] = bal - amount;
      totalCredited -= amount;
    }

    emit Debited(owner, amount, reason);
  }

  function _addUnassigned(uint256 amount) internal {
    if (amount == 0) revert StationAccounting__ZeroAmount();
    unassigned += amount;
    _assertSolvency();
    emit UnassignedIncreased(amount);
  }

  /// @dev Moves ZEN out of `unassigned` to `to`. Caller must enforce access control.
  function _rescueUnassigned(address to, uint256 amount) internal {
    if (to == address(0)) revert StationAccounting__ZeroAddress();
    if (amount == 0) revert StationAccounting__ZeroAmount();
    if (unassigned < amount) revert StationAccounting__InsufficientUnassigned();

    unchecked {
      unassigned -= amount;
    }
    _zen.safeTransfer(to, amount);
    emit UnassignedRescued(to, amount);
  }

  function _assertSolvency() internal view {
    if (_zen.balanceOf(address(this)) < totalCredited + unassigned) {
      revert StationAccounting__InvariantBroken();
    }
  }
}
