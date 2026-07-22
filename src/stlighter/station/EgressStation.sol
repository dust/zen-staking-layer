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

import {IStationBridge} from "./IStationBridge.sol";
import {StationAccounting} from "./StationAccounting.sol";

/// @title EgressStation
/// @notice Shared egress station for Redeem-to-Base (stLighter-specific, non-upgradeable).
/// @dev Relayer: same-tx `redeemWithSig(receiver=this)` then `creditFromRedeem`; later
/// `bridgeToBase`. Only this contract calls `IStationBridge`; refunds re-credit the owner.
contract EgressStation is Ownable2Step, Pausable, ReentrancyGuard, EIP712, Nonces, StationAccounting {
  using SafeERC20 for IERC20;

  /// @notice Aligns with StLighter gasless fee cap.
  uint256 public constant MAX_GAS_FEE_ZEN = 10e18;

  bytes32 public constant CREDIT_FROM_REDEEM_TYPEHASH = keccak256(
    "CreditFromRedeem(uint256 assets,address owner,uint256 nonce,uint256 deadline)"
  );

  bytes32 public constant BRIDGE_TO_BASE_TYPEHASH = keccak256(
    "BridgeToBase(uint256 assets,address dest,uint256 maxFeeZen,address owner,uint256 nonce,uint256 deadline)"
  );

  bytes32 public constant WITHDRAW_TO_HORIZEN_TYPEHASH = keccak256(
    "WithdrawToHorizen(uint256 assets,address to,address owner,uint256 nonce,uint256 deadline)"
  );

  bytes32 private constant REASON_REDEEM = keccak256("REDEEM");
  bytes32 private constant REASON_BRIDGE = keccak256("BRIDGE");
  bytes32 private constant REASON_REFUND = keccak256("REFUND");
  bytes32 private constant REASON_WITHDRAW = keccak256("WITHDRAW");

  struct BridgePending {
    address owner;
    uint256 amount;
    address dest;
    bool active;
  }

  IStationBridge public bridge;

  /// @notice In-flight bridge principal (debited, not yet complete/refunded). Tokens may sit on the
  /// adapter; this is ownership tracking, not a station balance lock.
  uint256 public pendingTotal;

  mapping(bytes32 bridgeId => BridgePending) public pending;

  event BridgeSet(address indexed bridge);
  event RedeemCredited(address indexed owner, uint256 assets, uint256 nonce);
  event BridgeInitiated(
    bytes32 indexed bridgeId,
    address indexed owner,
    address indexed dest,
    uint256 bridgeAmount,
    uint256 feeZen
  );
  event BridgeRefunded(bytes32 indexed bridgeId, address indexed owner, uint256 amount);
  event BridgeCompleted(bytes32 indexed bridgeId, address indexed owner, uint256 amount);
  event WithdrawToHorizen(address indexed owner, address indexed to, uint256 assets);

  error EgressStation__ZeroAddress();
  error EgressStation__ZeroAmount();
  error EgressStation__ExpiredDeadline();
  error EgressStation__InvalidSignature();
  error EgressStation__InsufficientFloat();
  error EgressStation__GasFeeExceedsMax();
  error EgressStation__UnauthorizedBridge();
  error EgressStation__UnknownBridgeId();
  error EgressStation__BridgeNotActive();

  constructor(IERC20 zen_, address bridge_, address owner_) Ownable(owner_) EIP712("EgressStation", "1") {
    if (bridge_ == address(0)) revert EgressStation__ZeroAddress();
    _setZen(zen_);
    bridge = IStationBridge(bridge_);
  }

  // -------------------------------------------------------------------------
  // Credit after redeem (float + EIP-712; anti-snatch)
  // -------------------------------------------------------------------------

  /// @notice Assign uncredited ZEN already held by this station to `owner`.
  /// @dev Relayer should call in the same tx after `StLighter.redeemWithSig(receiver=this)`.
  function creditFromRedeem(
    uint256 assets,
    address owner,
    uint256 deadline,
    bytes calldata signature
  ) external nonReentrant whenNotPaused {
    if (assets == 0) revert EgressStation__ZeroAmount();
    if (owner == address(0)) revert EgressStation__ZeroAddress();
    _revertIfPastDeadline(deadline);

    uint256 nonce = _useNonce(owner);
    _revertIfSignatureInvalid(
      owner,
      _hashTypedDataV4(
        keccak256(abi.encode(CREDIT_FROM_REDEEM_TYPEHASH, assets, owner, nonce, deadline))
      ),
      signature
    );

    if (assets > float()) revert EgressStation__InsufficientFloat();
    _credit(owner, assets, REASON_REDEEM);
    emit RedeemCredited(owner, assets, nonce);
  }

  // -------------------------------------------------------------------------
  // Bridge to Base (same typehash used for retries)
  // -------------------------------------------------------------------------

  /// @notice Debit credited ZEN and initiate outbound bridge. Retry = new signature + new nonce.
  function bridgeToBase(
    uint256 assets,
    address dest,
    uint256 maxFeeZen,
    uint256 feeZen,
    address owner,
    uint256 deadline,
    bytes calldata signature,
    bytes calldata extraOptions
  ) external payable nonReentrant whenNotPaused {
    if (assets == 0) revert EgressStation__ZeroAmount();
    if (dest == address(0) || owner == address(0)) revert EgressStation__ZeroAddress();
    _revertIfPastDeadline(deadline);
    _enforceGaslessFeeLimits(feeZen, maxFeeZen);
    if (feeZen >= assets) revert EgressStation__GasFeeExceedsMax();

    uint256 nonce = _useNonce(owner);
    _revertIfSignatureInvalid(
      owner,
      _hashTypedDataV4(
        keccak256(
          abi.encode(BRIDGE_TO_BASE_TYPEHASH, assets, dest, maxFeeZen, owner, nonce, deadline)
        )
      ),
      signature
    );

    _debit(owner, assets, REASON_BRIDGE);

    uint256 bridgeAmount = assets - feeZen;
    if (feeZen != 0) {
      _zen.safeTransfer(msg.sender, feeZen);
    }

    bytes32 bridgeId = keccak256(
      abi.encode(address(this), owner, nonce, dest, bridgeAmount, block.number)
    );
    if (pending[bridgeId].active) revert EgressStation__BridgeNotActive();

    pending[bridgeId] =
      BridgePending({owner: owner, amount: bridgeAmount, dest: dest, active: true});
    pendingTotal += bridgeAmount;

    _zen.safeTransfer(address(bridge), bridgeAmount);
    bridge.bridgeZen{value: msg.value}(bridgeId, bridgeAmount, dest, extraOptions);

    emit BridgeInitiated(bridgeId, owner, dest, bridgeAmount, feeZen);
  }

  // -------------------------------------------------------------------------
  // Bridge callbacks (adapter only)
  // -------------------------------------------------------------------------

  function onBridgeRefund(bytes32 bridgeId, uint256 amount) external {
    if (msg.sender != address(bridge)) revert EgressStation__UnauthorizedBridge();
    BridgePending storage p = pending[bridgeId];
    if (!p.active) revert EgressStation__UnknownBridgeId();
    // MVP: full refund only (partial refund deferred to S5 ADR).
    if (amount == 0 || amount != p.amount) revert EgressStation__ZeroAmount();

    address owner = p.owner;
    delete pending[bridgeId];
    pendingTotal -= amount;

    // Adapter must have transferred ZEN back to this station before calling.
    _credit(owner, amount, REASON_REFUND);
    emit BridgeRefunded(bridgeId, owner, amount);
  }

  function onBridgeComplete(bytes32 bridgeId) external {
    if (msg.sender != address(bridge)) revert EgressStation__UnauthorizedBridge();
    BridgePending storage p = pending[bridgeId];
    if (!p.active) revert EgressStation__UnknownBridgeId();

    address owner = p.owner;
    uint256 amount = p.amount;
    delete pending[bridgeId];
    pendingTotal -= amount;

    emit BridgeCompleted(bridgeId, owner, amount);
  }

  // -------------------------------------------------------------------------
  // Withdraw to Horizen
  // -------------------------------------------------------------------------

  function withdrawToHorizen(
    uint256 assets,
    address to,
    address owner,
    uint256 deadline,
    bytes calldata signature
  ) external nonReentrant whenNotPaused {
    if (assets == 0) revert EgressStation__ZeroAmount();
    if (to == address(0) || owner == address(0)) revert EgressStation__ZeroAddress();
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

  /// @notice ZEN held here that is not yet credited or marked unassigned.
  /// @dev Pending bridge principal lives on the adapter, so it is not subtracted from balance.
  function float() public view returns (uint256) {
    uint256 bal = _zen.balanceOf(address(this));
    uint256 accounted = totalCredited + unassigned;
    return bal > accounted ? bal - accounted : 0;
  }

  function DOMAIN_SEPARATOR() external view returns (bytes32) {
    return _domainSeparatorV4();
  }

  function invalidateNonce() external {
    _useNonce(msg.sender);
  }

  function setBridge(address bridge_) external onlyOwner {
    if (bridge_ == address(0)) revert EgressStation__ZeroAddress();
    bridge = IStationBridge(bridge_);
    emit BridgeSet(bridge_);
  }

  function rescueUnassigned(address to, uint256 amount) external onlyOwner {
    _rescueUnassigned(to, amount);
  }

  function sweepFloatToUnassigned() external onlyOwner {
    uint256 f = float();
    if (f != 0) {
      _addUnassigned(f);
    }
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  /// @dev Accepts excess LayerZero native fee refunds from `ZenOftStationBridge` / OFT `send`.
  receive() external payable {}

  function _enforceGaslessFeeLimits(uint256 feeZen, uint256 maxFeeZen) internal pure {
    if (feeZen > maxFeeZen || maxFeeZen > MAX_GAS_FEE_ZEN) {
      revert EgressStation__GasFeeExceedsMax();
    }
  }

  function _revertIfPastDeadline(uint256 deadline) internal view {
    if (block.timestamp > deadline) revert EgressStation__ExpiredDeadline();
  }

  function _revertIfSignatureInvalid(address signer, bytes32 hash, bytes calldata signature)
    internal
    view
  {
    if (!SignatureChecker.isValidSignatureNow(signer, hash, signature)) {
      revert EgressStation__InvalidSignature();
    }
  }
}
