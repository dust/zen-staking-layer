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
  /// @notice Trusted destination OFT (`_from` in `lzCompose`), e.g. Horizen ZenTokenOFT.
  address public zenOft;

  event ComposeCallerSet(address indexed composeCaller);
  event ZenOftSet(address indexed zenOft);
  event StLighterSet(address indexed stLighter);
  event ComposeCredited(
    address indexed owner, uint256 assets, uint256 nonce, bytes32 indexed guid
  );
  event WithdrawToHorizen(address indexed owner, address indexed to, uint256 assets);

  error InboundStation__ZeroAddress();
  error InboundStation__ZeroAmount();
  error InboundStation__ExpiredDeadline();
  error InboundStation__InvalidSignature();
  error InboundStation__UnauthorizedComposer();
  error InboundStation__UnauthorizedOft();
  error InboundStation__UnauthorizedStLighter();
  error InboundStation__AmountMismatch();

  constructor(
    IERC20 zen_,
    address stLighter_,
    address composeCaller_,
    address zenOft_,
    address owner_
  ) Ownable(owner_) EIP712("InboundStation", "1") {
    if (stLighter_ == address(0) || composeCaller_ == address(0) || zenOft_ == address(0)) {
      revert InboundStation__ZeroAddress();
    }
    _setZen(zen_);
    stLighter = stLighter_;
    composeCaller = composeCaller_;
    zenOft = zenOft_;
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

    uint256 actualAmount = OFTComposeMsgCodec.amountLD(_message);
    bytes memory payload = OFTComposeMsgCodec.composeMsg(_message);
    (address owner, uint256 assets, uint256 deadline, bytes memory signature) =
      StationComposePayload.decodeV1(payload);

    if (assets != actualAmount) revert InboundStation__AmountMismatch();

    _creditFromCompose(owner, assets, deadline, signature, _guid);
  }

  /// @notice Test / ops helper: same EIP-712 credit without OFT envelope.
  /// @dev Caller must be `composeCaller`. Prefer `lzCompose` in production.
  function creditFromTrustedComposer(
    uint256 assets,
    address owner,
    uint256 deadline,
    bytes calldata signature
  ) external nonReentrant whenNotPaused {
    if (msg.sender != composeCaller) revert InboundStation__UnauthorizedComposer();
    _creditFromCompose(owner, assets, deadline, signature, bytes32(0));
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

  function invalidateNonce() external {
    _useNonce(msg.sender);
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

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  function _creditFromCompose(
    address owner,
    uint256 assets,
    uint256 deadline,
    bytes memory signature,
    bytes32 guid
  ) internal {
    if (assets == 0) revert InboundStation__ZeroAmount();
    if (owner == address(0)) revert InboundStation__ZeroAddress();
    _revertIfPastDeadline(deadline);

    uint256 nonce = _useNonce(owner);
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
