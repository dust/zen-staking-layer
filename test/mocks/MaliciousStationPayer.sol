// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IStationDepositPayer} from "../../../src/stlighter/station/IStationDepositPayer.sol";
import {StLighter} from "../../../src/stlighter/StLighter.sol";

/// @notice Pays deposit from pre-funded balance, optionally reentering StLighter.
contract MaliciousStationPayer is IStationDepositPayer {
  using SafeERC20 for IERC20;

  IERC20 public immutable zen;
  StLighter public immutable vault;
  bool public attackDeposit;
  bool public attackHarvest;
  bool public attackRedeem;

  constructor(IERC20 zen_, StLighter vault_) {
    zen = zen_;
    vault = vault_;
  }

  function setAttackDeposit(bool v) external {
    attackDeposit = v;
  }

  function setAttackHarvest(bool v) external {
    attackHarvest = v;
  }

  function setAttackRedeem(bool v) external {
    attackRedeem = v;
  }

  function payForDeposit(address, /* user */ uint256 assets) external {
    if (attackDeposit) {
      attackDeposit = false;
      vault.deposit(1, address(this));
    }
    if (attackHarvest) {
      attackHarvest = false;
      vault.harvest();
    }
    if (attackRedeem) {
      attackRedeem = false;
      vault.redeem(1, address(this));
    }
    zen.safeTransfer(msg.sender, assets);
  }
}
