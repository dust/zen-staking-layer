// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {ILayerZeroComposer} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroComposer.sol";
import {OFTComposeMsgCodec} from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";

import {IStationDepositPayer} from "./IStationDepositPayer.sol";
import {StationAccounting} from "./StationAccounting.sol";
import {StationComposePayload} from "./libraries/StationComposePayload.sol";

/// @title InboundStation
/// @notice Shared inbound station for cross-chain ZEN (stLighter-specific, non-upgradeable).
/// @dev Implements `ILayerZeroComposer`: compose only credits. Stake via
/// `StLighter.depositWithSig(..., payer=this)` → `payForDeposit`.
/// CreditFromCompose uses an unordered bitmap nonce (Permit2-style) so LZ compose may arrive
/// out of order. WithdrawToHorizen keeps OZ sequential `Nonces` (separate namespace).
contract InboundStation is
  Ownable2Step,
  Pausable,
  ReentrancyGuard,
  EIP712,
  Nonces,
  StationAccounting,
  IStationDepositPayer,
  ILayerZeroComposer
{
  using SafeERC20 for IERC20;

  bytes32 public constant CREDIT_FROM_COMPOSE_TYPEHASH = keccak256(
    "CreditFromCompose(uint256 assets,address owner,uint256 nonce,uint256 deadline)"
  );

  bytes32 public constant WITHDRAW_TO_HORIZEN_TYPEHASH = keccak256(
    "WithdrawToHorizen(uint256 assets,address to,address owner,uint256 nonce,uint256 deadline)"
  );

  bytes32 private constant REASON_COMPOSE = keccak256("COMPOSE");
  bytes32 private constant REASON_STAKE = keccak256("STAKE");
  bytes32 private constant REASON_WITHDRAW = keccak256("WITHDRAW");

  address public stLighter;
  /// @notice LayerZero Endpoint / MessagingComposer that invokes `lzCompose`.
  address public composeCaller;
  /// @notice Trusted destination OFT (`_from` in `lzCompose`) — Horizen native ZenTokenOFT
  /// (Base counterpart is ZenTokenOFTAdapter locking ERC20 ZEN, not a native OFT).
  address public zenOft;
  /// @notice Allowed OFT compose source endpoint id (e.g. Base).
  uint32 public allowedSrcEid;

  /// @notice Permit2-style unordered nonces for CreditFromCompose only.
  mapping(address owner => mapping(uint256 wordPos => uint256 bitmap)) public nonceBitmap;

  event ComposeCallerSet(address indexed composeCaller);
  event ZenOftSet(address indexed zenOft);
  event StLighterSet(address indexed stLighter);
  event AllowedSrcEidSet(uint32 allowedSrcEid);
  event ComposeCredited(
    address indexed owner, uint256 assets, uint256 nonce, bytes32 indexed guid
  );
  event WithdrawToHorizen(address indexed owner, address indexed to, uint256 assets);
  event UnorderedNonceInvalidated(address indexed owner, uint256 wordPos, uint256 mask);
  event NativeSwept(address indexed to, uint256 amount);

  error InboundStation__ZeroAddress();
  error InboundStation__ZeroAmount();
  error InboundStation__ExpiredDeadline();
  error InboundStation__InvalidSignature();
  error InboundStation__UnauthorizedComposer();
  error InboundStation__UnauthorizedOft();
  error InboundStation__UnauthorizedStLighter();
  error InboundStation__AmountMismatch();
  error InboundStation__InvalidSrcEid();
  error InboundStation__InvalidNonce();
  error InboundStation__NativeTransferFailed();

  constructor(
    IERC20 zen_,
    address stLighter_,
    address composeCaller_,
    address zenOft_,
    uint32 allowedSrcEid_,
    address owner_
  ) Ownable(owner_) EIP712("InboundStation", "1") {
    if (stLighter_ == address(0) || composeCaller_ == address(0) || zenOft_ == address(0)) {
      revert InboundStation__ZeroAddress();
    }
    if (allowedSrcEid_ == 0) revert InboundStation__InvalidSrcEid();
    _setZen(zen_);
    stLighter = stLighter_;
    composeCaller = composeCaller_;
    zenOft = zenOft_;
    allowedSrcEid = allowedSrcEid_;
  }

  // -------------------------------------------------------------------------
  // LayerZero compose (production path)
  // -------------------------------------------------------------------------

  /// @inheritdoc ILayerZeroComposer
  /// @dev Tokens must already have been credited to this contract by the OFT receive step.
  function lzCompose(
    address _from,
    bytes32 _guid,
    bytes calldata _message,
    address, /* _executor */
    bytes calldata /* _extraData */
  ) external payable nonReentrant whenNotPaused {
    if (msg.sender != composeCaller) revert InboundStation__UnauthorizedComposer();
    if (_from != zenOft) revert InboundStation__UnauthorizedOft();
    if (OFTComposeMsgCodec.srcEid(_message) != allowedSrcEid) {
      revert InboundStation__InvalidSrcEid();
    }

    uint256 actualAmount = OFTComposeMsgCodec.amountLD(_message);
    bytes memory payload = OFTComposeMsgCodec.composeMsg(_message);
    (address owner, uint256 assets, uint256 nonce, uint256 deadline, bytes memory signature) =
      StationComposePayload.decodeV1(payload);

    if (assets != actualAmount) revert InboundStation__AmountMismatch();

    _creditFromCompose(owner, assets, nonce, deadline, signature, _guid);
  }

  // -------------------------------------------------------------------------
  // Called by StLighter.depositWithSig when payer == this station
  // -------------------------------------------------------------------------

  /// @inheritdoc IStationDepositPayer
  function payForDeposit(address user, uint256 assets) external nonReentrant whenNotPaused {
    if (msg.sender != stLighter) revert InboundStation__UnauthorizedStLighter();
    if (assets == 0) revert InboundStation__ZeroAmount();
    _debit(user, assets, REASON_STAKE);
    _zen.safeTransfer(msg.sender, assets);
  }

  // -------------------------------------------------------------------------
  // Withdraw
  // -------------------------------------------------------------------------

  function withdrawToHorizen(
    uint256 assets,
    address to,
    address owner,
    uint256 deadline,
    bytes calldata signature
  ) external nonReentrant whenNotPaused {
    if (assets == 0) revert InboundStation__ZeroAmount();
    if (to == address(0) || owner == address(0)) revert InboundStation__ZeroAddress();
    _revertIfPastDeadline(deadline);

    _revertIfSignatureInvalid(
      owner,
      _hashTypedDataV4(
        keccak256(
          abi.encode(
            WITHDRAW_TO_HORIZEN_TYPEHASH, assets, to, owner, _useNonce(owner), deadline
          )
        )
      ),
      signature
    );

    _debit(owner, assets, REASON_WITHDRAW);
    _zen.safeTransfer(to, assets);
    emit WithdrawToHorizen(owner, to, assets);
  }

  // -------------------------------------------------------------------------
  // Views / governance
  // -------------------------------------------------------------------------

  function DOMAIN_SEPARATOR() external view returns (bytes32) {
    return _domainSeparatorV4();
  }

  /// @notice Invalidate the next sequential nonce (WithdrawToHorizen namespace only).
  function invalidateNonce() external {
    _useNonce(msg.sender);
  }

  /// @notice Invalidate unordered CreditFromCompose nonces in `wordPos` matching `mask` bits.
  function invalidateUnorderedNonces(uint256 wordPos, uint256 mask) external {
    nonceBitmap[msg.sender][wordPos] |= mask;
    emit UnorderedNonceInvalidated(msg.sender, wordPos, mask);
  }

  function setComposeCaller(address composeCaller_) external onlyOwner {
    if (composeCaller_ == address(0)) revert InboundStation__ZeroAddress();
    composeCaller = composeCaller_;
    emit ComposeCallerSet(composeCaller_);
  }

  function setZenOft(address zenOft_) external onlyOwner {
    if (zenOft_ == address(0)) revert InboundStation__ZeroAddress();
    zenOft = zenOft_;
    emit ZenOftSet(zenOft_);
  }

  function setStLighter(address stLighter_) external onlyOwner {
    if (stLighter_ == address(0)) revert InboundStation__ZeroAddress();
    stLighter = stLighter_;
    emit StLighterSet(stLighter_);
  }

  function setAllowedSrcEid(uint32 allowedSrcEid_) external onlyOwner {
    if (allowedSrcEid_ == 0) revert InboundStation__InvalidSrcEid();
    allowedSrcEid = allowedSrcEid_;
    emit AllowedSrcEidSet(allowedSrcEid_);
  }

  function rescueUnassigned(address to, uint256 amount) external onlyOwner {
    _rescueUnassigned(to, amount);
  }

  function sweepFloatToUnassigned() external onlyOwner {
    uint256 bal = _zen.balanceOf(address(this));
    uint256 accounted = totalCredited + unassigned;
    if (bal > accounted) {
      _addUnassigned(bal - accounted);
    }
  }

  /// @notice Recover native ETH (e.g. LZ airdrops). Does not touch ZEN accounting.
  function sweepNative(address payable to) external onlyOwner nonReentrant {
    if (to == address(0)) revert InboundStation__ZeroAddress();
    uint256 bal = address(this).balance;
    (bool ok,) = to.call{value: bal}("");
    if (!ok) revert InboundStation__NativeTransferFailed();
    emit NativeSwept(to, bal);
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  function _creditFromCompose(
    address owner,
    uint256 assets,
    uint256 nonce,
    uint256 deadline,
    bytes memory signature,
    bytes32 guid
  ) internal {
    if (assets == 0) revert InboundStation__ZeroAmount();
    if (owner == address(0)) revert InboundStation__ZeroAddress();
    _revertIfPastDeadline(deadline);

    _useUnorderedNonce(owner, nonce);
    _revertIfSignatureInvalid(
      owner,
      _hashTypedDataV4(
        keccak256(abi.encode(CREDIT_FROM_COMPOSE_TYPEHASH, assets, owner, nonce, deadline))
      ),
      signature
    );

    _credit(owner, assets, REASON_COMPOSE);
    emit ComposeCredited(owner, assets, nonce, guid);
  }

  /// @dev Permit2-style: `wordPos = nonce >> 8`, `bitPos = nonce & 0xff`.
  function _useUnorderedNonce(address owner, uint256 nonce) internal {
    uint256 wordPos = uint256(nonce) >> 8;
    uint256 bitPos = uint256(uint8(nonce));
    uint256 bit = uint256(1) << bitPos;
    uint256 flipped = nonceBitmap[owner][wordPos] ^= bit;
    if (flipped & bit == 0) revert InboundStation__InvalidNonce();
  }

  function _revertIfPastDeadline(uint256 deadline) internal view {
    if (block.timestamp > deadline) revert InboundStation__ExpiredDeadline();
  }

  function _revertIfSignatureInvalid(address signer, bytes32 hash, bytes memory signature)
    internal
    view
  {
    if (!SignatureChecker.isValidSignatureNow(signer, hash, signature)) {
      revert InboundStation__InvalidSignature();
    }
  }
}
