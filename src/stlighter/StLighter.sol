// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {Staker} from "../Staker.sol";
import {ZenStaker} from "../ZenStaker.sol";
import {ILtZEN} from "./ILtZEN.sol";

/// @title StLighter
/// @notice Pooled liquid-staking protocol for ZEN, built on the audited ZenStaker. User deposits
/// aggregate into a SINGLE ZenStaker deposit owned & claimed by this contract. Users receive ltZEN
/// shares (ERC4626-style accounting lives HERE). Rewards (ZEN) auto-compound into the same
/// deposit, lifting the share<->ZEN exchange rate.
///
/// @dev See docs/stLighter-PRD.md. Horizen-only state-changing entry points (ZenStaker is on
/// Horizen). The exchange-rate denominator is `issuedShares` (NOT ltZEN.totalSupply()), which is
/// invariant under cross-chain ltZEN transfers — see PRD §4.2.
contract StLighter is Ownable2Step, Pausable, ReentrancyGuard, EIP712, Nonces {
  using SafeERC20 for IERC20;

  // -------------------------------------------------------------------------
  // Immutables / constants
  // -------------------------------------------------------------------------

  IERC20 public immutable ZEN;
  ZenStaker public immutable STAKER;
  ILtZEN public immutable LT_ZEN;

  /// @notice Hard upper bound on the protocol fee (basis points). 2000 = 20%.
  uint256 public constant MAX_FEE_BPS = 2000;
  uint256 private constant BPS_DENOMINATOR = 10_000;

  /// @notice Virtual-offset for inflation-attack protection (OZ ERC4626 style).
  uint8 public constant DECIMALS_OFFSET = 3;

  /// @notice EIP-712 type hash for gasless deposit.
  bytes32 public constant DEPOSIT_WITH_SIG_TYPEHASH = keccak256(
    "DepositWithSig(uint256 assets,address receiver,uint256 maxFeeZen,address user,uint256 nonce,uint256 deadline)"
  );

  /// @notice EIP-712 type hash for gasless redeem.
  bytes32 public constant REDEEM_WITH_SIG_TYPEHASH = keccak256(
    "RedeemWithSig(uint256 shares,address receiver,uint256 maxFeeZen,address user,uint256 nonce,uint256 deadline)"
  );

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------

  /// @notice The single aggregate deposit identifier in ZenStaker. Set on first deposit.
  Staker.DepositIdentifier public depositId;

  /// @notice Whether the aggregate deposit has been initialized.
  bool public initialized;

  /// @notice Global issued share count — the cross-chain-invariant exchange-rate denominator.
  /// Incremented on deposit, decremented on redeem; DELIBERATELY independent of
  /// LT_ZEN.totalSupply() (which shrinks when shares bridge out). See PRD §4.2 (方案 X).
  uint256 public issuedShares;

  /// @notice Protocol fee in basis points, taken from harvested rewards. Starts at 0.
  uint256 public feeBps;

  /// @notice Recipient of protocol fees. Ignored while feeBps == 0.
  address public feeRecipient;

  // -------------------------------------------------------------------------
  // Events / errors
  // -------------------------------------------------------------------------

  event Deposited(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
  event Redeemed(address indexed caller, address indexed receiver, uint256 shares, uint256 assets);
  event Harvested(uint256 rewardClaimed, uint256 feeTaken, uint256 restaked);
  event FeeParametersSet(uint256 feeBps, address feeRecipient);
  /// @notice Emitted when a relayer is paid a ZEN gas fee for a gasless operation.
  event GaslessFeePaid(address indexed user, address indexed relayer, uint256 feeZen);

  error StLighter__FeeTooHigh();
  error StLighter__ZeroAmount();
  error StLighter__ZeroAddress();
  error StLighter__ZeroShares();
  error StLighter__ExpiredDeadline();
  error StLighter__InvalidSignature();
  error StLighter__GasFeeExceedsMax();

  /// @param _zen ZEN token.
  /// @param _staker Deployed ZenStaker.
  /// @param _ltZen Deployed ltZEN (this contract must be its minter).
  /// @param _owner Governance owner (multisig + timelock).
  constructor(IERC20 _zen, ZenStaker _staker, ILtZEN _ltZen, address _owner)
    Ownable(_owner)
    EIP712("stLighter", "1")
  {
    if (
      address(_zen) == address(0) || address(_staker) == address(0)
        || address(_ltZen) == address(0)
    ) revert StLighter__ZeroAddress();
    ZEN = _zen;
    STAKER = _staker;
    LT_ZEN = _ltZen;
    // Approve the staker to pull ZEN for stake/stakeMore (max once).
    _zen.forceApprove(address(_staker), type(uint256).max);
  }

  /// @notice The delegatee for the aggregate deposit. Fixed to this contract — non-voting
  /// surrogate in Phase 1, so it's purely a bucket key (PRD §5.1).
  function delegatee() public view returns (address) {
    return address(this);
  }

  // -------------------------------------------------------------------------
  // ERC4626-style views
  // -------------------------------------------------------------------------

  /// @notice Total ZEN backing all shares = aggregate deposit balance + unclaimed rewards.
  function totalAssets() public view returns (uint256) {
    if (!initialized) return 0;
    (uint96 balance,,,,, uint256 unclaimed) = STAKER.getDepositInfo(depositId);
    return uint256(balance) + unclaimed;
  }

  /// @notice Global outstanding shares across all chains (the rate denominator).
  function totalShares() public view returns (uint256) {
    return issuedShares;
  }

  /// @dev Shares for a given asset amount, rounding DOWN (favor protocol). Virtual offset guards
  /// the first-deposit inflation attack.
  function convertToShares(uint256 _assets) public view returns (uint256) {
    return Math.mulDiv(
      _assets, issuedShares + 10 ** DECIMALS_OFFSET, totalAssets() + 1, Math.Rounding.Floor
    );
  }

  /// @dev Assets for a given share amount, rounding DOWN (favor protocol — PRD §9-8).
  function convertToAssets(uint256 _shares) public view returns (uint256) {
    return Math.mulDiv(
      _shares, totalAssets() + 1, issuedShares + 10 ** DECIMALS_OFFSET, Math.Rounding.Floor
    );
  }

  function previewDeposit(uint256 _assets) external view returns (uint256) {
    return convertToShares(_assets);
  }

  /// @notice Preview ZEN returned for redeeming `_shares`. Mirrors redeem()'s last-exit rule:
  /// the final redeemer (burning all issued shares) sweeps the entire backing, leaving no dust.
  function previewRedeem(uint256 _shares) external view returns (uint256) {
    if (_shares != 0 && _shares == issuedShares) return totalAssets();
    return convertToAssets(_shares);
  }

  // -------------------------------------------------------------------------
  // User entry points (Horizen-only)
  // -------------------------------------------------------------------------

  /// @notice Deposit ZEN, receive ltZEN. Auto-harvests first so the rate is current.
  function deposit(uint256 _assets, address _receiver)
    external
    nonReentrant
    whenNotPaused
    returns (uint256 shares)
  {
    return _deposit(msg.sender, _assets, _receiver, 0, address(0));
  }

  /// @notice Gasless deposit. A relayer submits the user's EIP-712 signature and pays ETH gas; the
  /// protocol reimburses the relayer up to `_maxFeeZen` ZEN, taken from the deposited assets. The
  /// fee is deducted BEFORE staking/minting so it never dilutes other holders.
  /// @param _assets Total ZEN the user commits (fee + staked portion).
  /// @param _receiver Recipient of minted ltZEN.
  /// @param _maxFeeZen Max ZEN the user authorizes as gas reimbursement (signed).
  /// @param _feeZen Actual fee the relayer claims; must be <= _maxFeeZen.
  /// @param _user Signer / depositor.
  /// @param _deadline Signature expiry.
  /// @param _signature EIP-712 signature by `_user`.
  function depositWithSig(
    uint256 _assets,
    address _receiver,
    uint256 _maxFeeZen,
    uint256 _feeZen,
    address _user,
    uint256 _deadline,
    bytes calldata _signature
  ) external nonReentrant whenNotPaused returns (uint256 shares) {
    _revertIfPastDeadline(_deadline);
    if (_feeZen > _maxFeeZen) revert StLighter__GasFeeExceedsMax();
    _revertIfSignatureInvalid(
      _user,
      _hashTypedDataV4(
        keccak256(
          abi.encode(
            DEPOSIT_WITH_SIG_TYPEHASH,
            _assets,
            _receiver,
            _maxFeeZen,
            _user,
            _useNonce(_user),
            _deadline
          )
        )
      ),
      _signature
    );
    return _deposit(_user, _assets, _receiver, _feeZen, msg.sender);
  }

  /// @dev Core deposit. Pulls `_assets` ZEN from `_payer`; if `_gasFee > 0`, pays it to `_relayer`
  /// and stakes only the remainder. Shares are computed on the NET staked amount.
  function _deposit(
    address _payer,
    uint256 _assets,
    address _receiver,
    uint256 _gasFee,
    address _relayer
  ) internal returns (uint256 shares) {
    if (_assets == 0) revert StLighter__ZeroAmount();
    if (_gasFee >= _assets) revert StLighter__GasFeeExceedsMax();
    _harvest();

    ZEN.safeTransferFrom(_payer, address(this), _assets);

    if (_gasFee != 0) {
      ZEN.safeTransfer(_relayer, _gasFee);
      emit GaslessFeePaid(_payer, _relayer, _gasFee);
    }

    uint256 netAssets = _assets - _gasFee;
    shares = convertToShares(netAssets);
    if (shares == 0) revert StLighter__ZeroShares();

    _stakeIntoStaker(netAssets);

    issuedShares += shares;
    LT_ZEN.mint(_receiver, shares);

    emit Deposited(_payer, _receiver, netAssets, shares);
  }

  /// @notice Redeem ltZEN for ZEN. Auto-harvests first (forces claim+restake so the aggregate
  /// deposit balance covers the withdrawal — PRD §5.6). Available even while paused.
  function redeem(uint256 _shares, address _receiver) external nonReentrant returns (uint256 assets) {
    return _redeem(msg.sender, _shares, _receiver, 0, address(0));
  }

  /// @notice Gasless redeem. Relayer submits the user's signature and pays ETH gas; fee is taken
  /// from the ZEN PRODUCED by the redemption, so the user needs no ZEN up front.
  /// @param _shares ltZEN to burn (from `_user`).
  /// @param _receiver Recipient of the net ZEN.
  /// @param _maxFeeZen Max ZEN the user authorizes as gas reimbursement (signed).
  /// @param _feeZen Actual fee the relayer claims; must be <= _maxFeeZen and < produced assets.
  /// @param _user Signer / share owner.
  /// @param _deadline Signature expiry.
  /// @param _signature EIP-712 signature by `_user`.
  function redeemWithSig(
    uint256 _shares,
    address _receiver,
    uint256 _maxFeeZen,
    uint256 _feeZen,
    address _user,
    uint256 _deadline,
    bytes calldata _signature
  ) external nonReentrant returns (uint256 assets) {
    _revertIfPastDeadline(_deadline);
    if (_feeZen > _maxFeeZen) revert StLighter__GasFeeExceedsMax();
    _revertIfSignatureInvalid(
      _user,
      _hashTypedDataV4(
        keccak256(
          abi.encode(
            REDEEM_WITH_SIG_TYPEHASH,
            _shares,
            _receiver,
            _maxFeeZen,
            _user,
            _useNonce(_user),
            _deadline
          )
        )
      ),
      _signature
    );
    return _redeem(_user, _shares, _receiver, _feeZen, msg.sender);
  }

  /// @dev Core redeem. Burns `_shares` from `_owner`, withdraws ZEN; if `_gasFee > 0`, pays it to
  /// `_relayer` from the produced ZEN and sends the remainder to `_receiver`.
  function _redeem(
    address _owner,
    uint256 _shares,
    address _receiver,
    uint256 _gasFee,
    address _relayer
  ) internal returns (uint256 assets) {
    if (_shares == 0) revert StLighter__ZeroAmount();
    _harvest();

    // Last-exit sweep: the final redeemer takes the entire backing, leaving no dust (PRD §10-9).
    bool isLastExit = (_shares == issuedShares);
    assets = isLastExit ? totalAssets() : convertToAssets(_shares);
    if (_gasFee >= assets) revert StLighter__GasFeeExceedsMax();

    issuedShares -= _shares;
    LT_ZEN.burn(_owner, _shares);

    if (assets != 0) {
      STAKER.withdraw(depositId, assets);
      if (_gasFee != 0) {
        ZEN.safeTransfer(_relayer, _gasFee);
        emit GaslessFeePaid(_owner, _relayer, _gasFee);
      }
      ZEN.safeTransfer(_receiver, assets - _gasFee);
    }

    emit Redeemed(_owner, _receiver, _shares, assets);
  }

  // -------------------------------------------------------------------------
  // Compounding
  // -------------------------------------------------------------------------

  /// @notice Permissionless harvest: claim ZEN rewards, take protocol fee (0 at launch), restake
  /// the remainder. Callable by anyone/keepers; also invoked at the top of deposit()/redeem().
  /// Allowed while paused (compounding should never be frozen).
  function harvest() external nonReentrant {
    _harvest();
  }

  function _harvest() internal {
    if (!initialized) return;
    uint256 claimed = STAKER.claimReward(depositId);
    if (claimed == 0) return;

    uint256 fee = feeBps == 0 ? 0 : (claimed * feeBps) / BPS_DENOMINATOR;
    if (fee != 0) ZEN.safeTransfer(feeRecipient, fee);

    uint256 restake = claimed - fee;
    if (restake != 0) STAKER.stakeMore(depositId, restake);

    emit Harvested(claimed, fee, restake);
  }

  /// @dev Routes ZEN into the aggregate ZenStaker deposit. First call creates the deposit with
  /// this contract as owner & claimer; later calls use stakeMore.
  function _stakeIntoStaker(uint256 _amount) internal {
    if (!initialized) {
      depositId = STAKER.stake(_amount, delegatee(), address(this));
      initialized = true;
    } else {
      STAKER.stakeMore(depositId, _amount);
    }
  }

  // -------------------------------------------------------------------------
  // Gasless helpers (EIP-712)
  // -------------------------------------------------------------------------

  /// @notice EIP-712 domain separator for off-chain signing.
  function DOMAIN_SEPARATOR() external view returns (bytes32) {
    return _domainSeparatorV4();
  }

  /// @notice Bump the caller's nonce to invalidate any pending signed (gasless) actions.
  function invalidateNonce() external {
    _useNonce(msg.sender);
  }

  function _revertIfPastDeadline(uint256 _deadline) internal view {
    if (block.timestamp > _deadline) revert StLighter__ExpiredDeadline();
  }

  function _revertIfSignatureInvalid(address _signer, bytes32 _hash, bytes calldata _signature)
    internal
    view
  {
    if (!SignatureChecker.isValidSignatureNow(_signer, _hash, _signature)) {
      revert StLighter__InvalidSignature();
    }
  }

  // -------------------------------------------------------------------------
  // Governance
  // -------------------------------------------------------------------------

  /// @notice Set protocol fee parameters. feeBps must be <= MAX_FEE_BPS.
  function setFeeParameters(uint256 _feeBps, address _feeRecipient) external onlyOwner {
    if (_feeBps > MAX_FEE_BPS) revert StLighter__FeeTooHigh();
    if (_feeBps != 0 && _feeRecipient == address(0)) revert StLighter__ZeroAddress();
    feeBps = _feeBps;
    feeRecipient = _feeRecipient;
    emit FeeParametersSet(_feeBps, _feeRecipient);
  }

  /// @notice Pause deposits only. Redeem and harvest remain available (PRD §7).
  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }
}
