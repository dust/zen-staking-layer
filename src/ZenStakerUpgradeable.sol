// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Staker} from "./Staker.sol";
import {StakerPermitAndStake} from "./extensions/StakerPermitAndStake.sol";
import {DelegationSurrogate} from "./DelegationSurrogate.sol";
import {IEarningPowerCalculator} from "./interfaces/IEarningPowerCalculator.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/// @notice Non-voting delegation surrogate used by ZenStakerUpgradeable.
/// Identical to ZenDelegationSurrogate in ZenStaker.sol.
contract ZenDelegationSurrogate is DelegationSurrogate {
  constructor(IERC20 _token) DelegationSurrogate(_token) {}
}

/// @title ZenStakerUpgradeable
/// @notice UUPS-upgradeable variant of ZenStaker. All staking logic is
/// inherited unchanged from the audited Staker and StakerPermitAndStake base
/// contracts. The only differences from ZenStaker are:
///   1. A proxy-safe constructor that sets immutables and locks initializers.
///   2. An `initialize()` function that replaces the constructor for state setup.
///   3. A `_authorizeUpgrade()` hook gating upgrades behind the admin role.
///
/// The write-path logic, storage layout, and view helpers are identical to
/// ZenStaker. Deploy behind an ERC-1967 proxy (e.g. OZ ERC1967Proxy).
contract ZenStakerUpgradeable is Staker, StakerPermitAndStake, Initializable, UUPSUpgradeable {
  /// @notice Maps each delegatee address to its non-voting delegation surrogate.
  mapping(address delegatee => DelegationSurrogate surrogate) private _surrogates;

  /// @notice Deploys the implementation contract. Sets immutables baked into
  /// bytecode and permanently locks the implementation so it cannot be
  /// initialized directly.
  ///
  /// @dev `address(1)` is passed as placeholders for admin and
  /// earningPowerCalculator to satisfy the non-zero checks in Staker's
  /// constructor. These values are written to the *implementation* contract's
  /// own storage, which is never read through a proxy. The proxy's storage is
  /// populated exclusively by `initialize()`.
  ///
  /// @param _token ZEN token address (both reward and stake token).
  constructor(IERC20 _token)
    Staker(_token, _token, IEarningPowerCalculator(address(1)), 0, address(1))
    StakerPermitAndStake(IERC20Permit(address(_token)))
  {
    MAX_CLAIM_FEE = 0;
    _disableInitializers();
  }

  /// @notice Initializes the proxy state. Replaces the constructor for
  /// post-proxy-deployment setup. Can only be called once.
  /// @param _admin Horizen multisig address (becomes staker admin).
  /// @param _earningPowerCalculator Earning power calculator contract.
  /// @param _maxBumpTip Maximum tip a bumper may request (0 in Phase 1).
  function initialize(
    address _admin,
    IEarningPowerCalculator _earningPowerCalculator,
    uint256 _maxBumpTip
  ) external initializer {
    _setAdmin(_admin);
    _setEarningPowerCalculator(address(_earningPowerCalculator));
    _setMaxBumpTip(_maxBumpTip);
    _setClaimFeeParameters(ClaimFeeParameters({feeAmount: 0, feeCollector: address(0)}));
  }

  /// @inheritdoc UUPSUpgradeable
  /// @dev Only the staker admin (Horizen multisig) may authorize an upgrade.
  function _authorizeUpgrade(address) internal view override {
    _revertIfNotAdmin();
  }

  /// @inheritdoc Staker
  function surrogates(address _delegatee) public view override returns (DelegationSurrogate) {
    return _surrogates[_delegatee];
  }

  /// @inheritdoc Staker
  function _fetchOrDeploySurrogate(address _delegatee)
    internal
    override
    returns (DelegationSurrogate _surrogate)
  {
    _surrogate = _surrogates[_delegatee];
    if (address(_surrogate) == address(0)) {
      _surrogate = new ZenDelegationSurrogate(STAKE_TOKEN);
      _surrogates[_delegatee] = _surrogate;
    }
  }

  // ---------------------------------------------------------------------------
  // View helpers — identical to ZenStaker; no state changes
  // ---------------------------------------------------------------------------

  /// @notice Returns all useful deposit data for a single deposit in one call.
  /// @param _depositId The deposit to query.
  function getDepositInfo(DepositIdentifier _depositId)
    external
    view
    returns (
      uint96 balance,
      address owner,
      uint96 earningPower,
      address delegatee,
      address claimer,
      uint256 unclaimedRewards
    )
  {
    Deposit storage d = deposits[_depositId];
    balance = d.balance;
    owner = d.owner;
    earningPower = d.earningPower;
    delegatee = d.delegatee;
    claimer = d.claimer;
    unclaimedRewards = _scaledUnclaimedReward(d) / SCALE_FACTOR;
  }

  /// @notice Batch version of getDepositInfo. Caller supplies deposit IDs
  /// sourced from the off-chain indexer (Goldsky). Returns parallel arrays.
  /// @param _depositIds List of deposit identifiers to query.
  function getDepositsInfo(DepositIdentifier[] calldata _depositIds)
    external
    view
    returns (
      uint96[] memory balances,
      address[] memory owners,
      uint96[] memory earningPowers,
      uint256[] memory unclaimedRewards
    )
  {
    uint256 len = _depositIds.length;
    balances = new uint96[](len);
    owners = new address[](len);
    earningPowers = new uint96[](len);
    unclaimedRewards = new uint256[](len);
    for (uint256 i = 0; i < len; i++) {
      Deposit storage d = deposits[_depositIds[i]];
      balances[i] = d.balance;
      owners[i] = d.owner;
      earningPowers[i] = d.earningPower;
      unclaimedRewards[i] = _scaledUnclaimedReward(d) / SCALE_FACTOR;
    }
  }

  /// @notice Returns all global state the frontend dashboard needs in one call.
  function getGlobalState()
    external
    view
    returns (
      uint256 totalStaked_,
      uint256 totalEarningPower_,
      uint256 rewardRate_,
      uint256 rewardEndTime_,
      uint256 lastCheckpointTime_,
      uint256 rewardPerTokenAccumulated_
    )
  {
    totalStaked_ = totalStaked;
    totalEarningPower_ = totalEarningPower;
    rewardRate_ = scaledRewardRate / SCALE_FACTOR;
    rewardEndTime_ = rewardEndTime;
    lastCheckpointTime_ = lastCheckpointTime;
    rewardPerTokenAccumulated_ = rewardPerTokenAccumulated();
  }

  /// @notice Returns aggregated staking totals for a single depositor address.
  /// @dev Does not aggregate unclaimed rewards across deposits — deposit IDs
  /// are tracked by the indexer, not on-chain.
  /// @param _depositor The address to query.
  function getDepositorSummary(address _depositor)
    external
    view
    returns (uint256 totalStaked_, uint256 totalEarningPower_)
  {
    totalStaked_ = depositorTotalStaked[_depositor];
    totalEarningPower_ = depositorTotalEarningPower[_depositor];
  }

  /// @notice Returns aggregated staking totals plus total unclaimed rewards
  /// for a depositor in one call. Deposit IDs must be supplied by the caller
  /// (sourced from the Goldsky indexer via StakeDeposited events filtered on
  /// the indexed owner field).
  /// @param _depositor The address to query.
  /// @param _depositIds All deposit IDs belonging to this depositor.
  function getDepositorFullSummary(address _depositor, DepositIdentifier[] calldata _depositIds)
    external
    view
    returns (uint256 totalStaked_, uint256 totalEarningPower_, uint256 totalUnclaimedRewards_)
  {
    totalStaked_ = depositorTotalStaked[_depositor];
    totalEarningPower_ = depositorTotalEarningPower[_depositor];
    uint256 len = _depositIds.length;
    for (uint256 i = 0; i < len; i++) {
      // Skip duplicate IDs to avoid double-counting rewards.
      bool duplicate = false;
      for (uint256 j = 0; j < i; j++) {
        if (DepositIdentifier.unwrap(_depositIds[j]) == DepositIdentifier.unwrap(_depositIds[i])) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) continue;
      Deposit storage d = deposits[_depositIds[i]];
      if (d.owner == _depositor) {
        totalUnclaimedRewards_ += _scaledUnclaimedReward(d) / SCALE_FACTOR;
      }
    }
  }
}
