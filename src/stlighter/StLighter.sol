// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
  Ownable2StepUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {
  PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {
  ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {
  EIP712Upgradeable
} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {NoncesUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/NoncesUpgradeable.sol";

import {Staker} from "../Staker.sol";
import {ZenStaker} from "../ZenStaker.sol";
import {ILtZEN} from "./ILtZEN.sol";

/// @title StLighter
/// @notice Pooled liquid-staking protocol for ZEN, built on the audited ZenStaker. User deposits
/// aggregate into a SINGLE ZenStaker deposit owned & claimed by this contract. Users receive ltZEN
/// shares (ERC4626-style accounting lives HERE). Rewards (ZEN) auto-compound into the same
/// deposit, lifting the share<->ZEN exchange rate.
///
/// @dev UUPS-upgradeable (PRD §2 / §7). Deploy via `StLighterProxyDeploy` / ERC1967Proxy +
/// `initialize`. Proxy address is the ltZEN minter and ZenStaker deposit owner.
contract StLighter is
  Initializable,
  Ownable2StepUpgradeable,
  PausableUpgradeable,
  ReentrancyGuardUpgradeable,
  EIP712Upgradeable,
  NoncesUpgradeable,
  UUPSUpgradeable
{
  using SafeERC20 for IERC20;

  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------

  /// @notice Hard upper bound on the protocol fee (basis points). 2000 = 20%.
  uint256 public constant MAX_FEE_BPS = 2000;
  /// @notice Per-tx absolute cap on gasless relayer fees (ZEN wei). PRD §6.5 fallback independent
  /// of the user-signed `maxFeeZen`.
  uint256 public constant MAX_GAS_FEE_ZEN = 10e18;
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
  // Storage (upgradeable — no immutables)
  // -------------------------------------------------------------------------

  IERC20 private _zen;
  ZenStaker private _staker;
  ILtZEN private _ltZen;

  /// @notice The single aggregate deposit identifier in ZenStaker. Set on first deposit.
  Staker.DepositIdentifier public depositId;

  /// @notice Whether the aggregate deposit has been initialized.
  bool public initialized;

  /// @notice Global issued share count — the cross-chain-invariant exchange-rate denominator.
  uint256 public issuedShares;

  /// @notice Protocol fee in basis points, taken from harvested rewards. Starts at 0.
  uint256 public feeBps;

  /// @notice Recipient of protocol fees. Ignored while feeBps == 0.
  address public feeRecipient;

  /// @dev Reserved storage gap for future upgrades.
  uint256[40] private __gap;

  // -------------------------------------------------------------------------
  // Events / errors
  // -------------------------------------------------------------------------

  event Deposited(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
  event Redeemed(address indexed caller, address indexed receiver, uint256 shares, uint256 assets);
  event Harvested(uint256 rewardClaimed, uint256 feeTaken, uint256 restaked);
  event FeeParametersSet(uint256 feeBps, address feeRecipient);
  event GaslessFeePaid(address indexed user, address indexed relayer, uint256 feeZen);

  error StLighter__FeeTooHigh();
  error StLighter__ZeroAmount();
  error StLighter__ZeroAddress();
  error StLighter__ZeroShares();
  error StLighter__ExpiredDeadline();
  error StLighter__InvalidSignature();
  error StLighter__GasFeeExceedsMax();

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /// @notice One-time initializer called via proxy constructor data or post-deploy.
  function initialize(IERC20 zen_, ZenStaker staker_, ILtZEN ltZen_, address owner_)
    external
    initializer
  {
    if (
      address(zen_) == address(0) || address(staker_) == address(0) || address(ltZen_) == address(0)
        || owner_ == address(0)
    ) revert StLighter__ZeroAddress();

    __Ownable_init(owner_);
    __Ownable2Step_init();
    __Pausable_init();
    __ReentrancyGuard_init();
    __EIP712_init("stLighter", "1");
    __Nonces_init();

    _zen = zen_;
    _staker = staker_;
    _ltZen = ltZen_;
    zen_.forceApprove(address(staker_), type(uint256).max);
  }

  function ZEN() external view returns (IERC20) {
    return _zen;
  }

  function STAKER() external view returns (ZenStaker) {
    return _staker;
  }

  function LT_ZEN() external view returns (ILtZEN) {
    return _ltZen;
  }

  /// @notice The delegatee for the aggregate deposit. Fixed to this contract — non-voting
  /// surrogate in Phase 1, so it's purely a bucket key (PRD §5.1).
  function delegatee() public view returns (address) {
    return address(this);
  }

  // -------------------------------------------------------------------------
  // ERC4626-style views
  // -------------------------------------------------------------------------

  function totalAssets() public view returns (uint256) {
    if (!initialized) return 0;
    (uint96 balance,,,,, uint256 unclaimed) = _staker.getDepositInfo(depositId);
    return uint256(balance) + unclaimed;
  }

  function totalShares() public view returns (uint256) {
    return issuedShares;
  }

  function convertToShares(uint256 _assets) public view returns (uint256) {
    return Math.mulDiv(
      _assets, issuedShares + 10 ** DECIMALS_OFFSET, totalAssets() + 1, Math.Rounding.Floor
    );
  }

  function convertToAssets(uint256 _shares) public view returns (uint256) {
    return Math.mulDiv(
      _shares, totalAssets() + 1, issuedShares + 10 ** DECIMALS_OFFSET, Math.Rounding.Floor
    );
  }

  function previewDeposit(uint256 _assets) external view returns (uint256) {
    return convertToShares(_assets);
  }

  function previewRedeem(uint256 _shares) external view returns (uint256) {
    if (_shares != 0 && _shares == issuedShares) return totalAssets();
    return convertToAssets(_shares);
  }

  // -------------------------------------------------------------------------
  // User entry points (Horizen-only)
  // -------------------------------------------------------------------------

  function deposit(uint256 _assets, address _receiver)
    external
    nonReentrant
    whenNotPaused
    returns (uint256 shares)
  {
    return _deposit(msg.sender, _assets, _receiver, 0, address(0));
  }

  /// @notice Deposit in one tx via ZEN EIP-2612 permit (no prior `approve`). Mirrors ZenStaker
  /// `permitAndStake` UX (PRD §5.3).
  function depositWithPermit(
    uint256 _assets,
    address _receiver,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external nonReentrant whenNotPaused returns (uint256 shares) {
    try IERC20Permit(address(_zen))
      .permit(msg.sender, address(this), _assets, _deadline, _v, _r, _s) {}
      catch {}
    return _deposit(msg.sender, _assets, _receiver, 0, address(0));
  }

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
    _enforceGaslessFeeLimits(_feeZen, _maxFeeZen);
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

  /// @notice Gasless deposit with EIP-712 authorization plus ZEN permit — no on-chain `approve`
  /// (PRD §6.4).
  function depositWithSigAndPermit(
    uint256 _assets,
    address _receiver,
    uint256 _maxFeeZen,
    uint256 _feeZen,
    address _user,
    uint256 _deadline,
    bytes calldata _signature,
    uint256 _permitDeadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external nonReentrant whenNotPaused returns (uint256 shares) {
    _revertIfPastDeadline(_deadline);
    _enforceGaslessFeeLimits(_feeZen, _maxFeeZen);
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
    try IERC20Permit(address(_zen))
      .permit(_user, address(this), _assets, _permitDeadline, _v, _r, _s) {}
      catch {}
    return _deposit(_user, _assets, _receiver, _feeZen, msg.sender);
  }

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

    _zen.safeTransferFrom(_payer, address(this), _assets);

    if (_gasFee != 0) {
      _zen.safeTransfer(_relayer, _gasFee);
      emit GaslessFeePaid(_payer, _relayer, _gasFee);
    }

    uint256 netAssets = _assets - _gasFee;
    shares = convertToShares(netAssets);
    if (shares == 0) revert StLighter__ZeroShares();

    _stakeIntoStaker(netAssets);

    issuedShares += shares;
    _ltZen.mint(_receiver, shares);

    emit Deposited(_payer, _receiver, netAssets, shares);
  }

  function redeem(uint256 _shares, address _receiver)
    external
    nonReentrant
    returns (uint256 assets)
  {
    return _redeem(msg.sender, _shares, _receiver, 0, address(0));
  }

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
    _enforceGaslessFeeLimits(_feeZen, _maxFeeZen);
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

  function _redeem(
    address _owner,
    uint256 _shares,
    address _receiver,
    uint256 _gasFee,
    address _relayer
  ) internal returns (uint256 assets) {
    if (_shares == 0) revert StLighter__ZeroAmount();
    _harvest();

    bool isLastExit = (_shares == issuedShares);
    assets = isLastExit ? totalAssets() : convertToAssets(_shares);
    if (_gasFee >= assets) revert StLighter__GasFeeExceedsMax();

    issuedShares -= _shares;
    _ltZen.burn(_owner, _shares);

    if (assets != 0) {
      _staker.withdraw(depositId, assets);
      if (_gasFee != 0) {
        _zen.safeTransfer(_relayer, _gasFee);
        emit GaslessFeePaid(_owner, _relayer, _gasFee);
      }
      _zen.safeTransfer(_receiver, assets - _gasFee);
    }

    emit Redeemed(_owner, _receiver, _shares, assets);
  }

  // -------------------------------------------------------------------------
  // Compounding
  // -------------------------------------------------------------------------

  function harvest() external nonReentrant {
    _harvest();
  }

  function _harvest() internal {
    if (!initialized) return;
    uint256 claimed = _staker.claimReward(depositId);
    if (claimed == 0) return;

    uint256 fee = feeBps == 0 ? 0 : (claimed * feeBps) / BPS_DENOMINATOR;
    if (fee != 0) _zen.safeTransfer(feeRecipient, fee);

    uint256 restake = claimed - fee;
    if (restake != 0) _staker.stakeMore(depositId, restake);

    emit Harvested(claimed, fee, restake);
  }

  function _stakeIntoStaker(uint256 _amount) internal {
    if (!initialized) {
      depositId = _staker.stake(_amount, delegatee(), address(this));
      initialized = true;
    } else {
      _staker.stakeMore(depositId, _amount);
    }
  }

  // -------------------------------------------------------------------------
  // Gasless helpers (EIP-712)
  // -------------------------------------------------------------------------

  function DOMAIN_SEPARATOR() external view returns (bytes32) {
    return _domainSeparatorV4();
  }

  function invalidateNonce() external {
    _useNonce(msg.sender);
  }

  function _revertIfPastDeadline(uint256 _deadline) internal view {
    if (block.timestamp > _deadline) revert StLighter__ExpiredDeadline();
  }

  function _enforceGaslessFeeLimits(uint256 _feeZen, uint256 _maxFeeZen) internal pure {
    if (_feeZen > _maxFeeZen) revert StLighter__GasFeeExceedsMax();
    if (_feeZen > MAX_GAS_FEE_ZEN || _maxFeeZen > MAX_GAS_FEE_ZEN) {
      revert StLighter__GasFeeExceedsMax();
    }
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

  function setFeeParameters(uint256 _feeBps, address _feeRecipient) external onlyOwner {
    if (_feeBps > MAX_FEE_BPS) revert StLighter__FeeTooHigh();
    if (_feeBps != 0 && _feeRecipient == address(0)) revert StLighter__ZeroAddress();
    feeBps = _feeBps;
    feeRecipient = _feeRecipient;
    emit FeeParametersSet(_feeBps, _feeRecipient);
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  function _authorizeUpgrade(address) internal view override onlyOwner {}
}
