// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title LtZEN
/// @notice The ltZEN pooled liquid-staking share token: a LayerZero V2 OFT (omnichain ERC20) with
/// EIP-2612 permit and a controlled `minter` role. All vault accounting (share<->ZEN rate) lives
/// in the StLighter protocol contract, NOT here — ltZEN is "just shares" that happen to be
/// omnichain.
///
/// @dev Same bytecode deploys on every chain (Horizen hub + Base spoke). The only difference is
/// which address holds `minter`:
///   - hub (Horizen): the StLighter protocol holds `minter`; it mints on deposit, burns on redeem.
///   - spoke (Base): `minter` stays address(0); no local protocol mint/burn. Cross-chain mint/burn
///     still flows through the LayerZero Endpoint via the OFT path (OFT._debit/_credit), which is
///     internal to OFT and NOT gated by `minter`.
///   - `owner`/`delegate` (setPeer, DVN/library config) is governance (multisig + timelock).
///
/// OFT already inherits ERC20 + OApp(Ownable). We additionally inherit ERC20Permit for EIP-2612.
contract LtZEN is OFT, ERC20Permit {
  /// @notice Address authorized to mint/burn for protocol deposit/redeem. Zero on spoke chains.
  address public minter;

  /// @notice Emitted when the minter role is transferred.
  event MinterSet(address indexed oldMinter, address indexed newMinter);

  error LtZEN__NotMinter();

  /// @param _name ERC20 name (e.g. "Lighter Staked ZEN").
  /// @param _symbol ERC20 symbol ("ltZEN").
  /// @param _lzEndpoint LayerZero V2 Endpoint on this chain.
  /// @param _owner Governance owner (multisig + timelock); also the OApp delegate initially.
  /// @param _minter Initial minter; the stLighter protocol on the hub, or address(0) on spokes.
  constructor(
    string memory _name,
    string memory _symbol,
    address _lzEndpoint,
    address _owner,
    address _minter
  ) OFT(_name, _symbol, _lzEndpoint, _owner) Ownable(_owner) ERC20Permit(_name) {
    minter = _minter;
    emit MinterSet(address(0), _minter);
  }

  /// @dev Reverts if caller is not the protocol minter.
  modifier onlyMinter() {
    if (msg.sender != minter) revert LtZEN__NotMinter();
    _;
  }

  /// @notice Mint shares to `_to` (deposit path). Restricted to the protocol minter.
  function mint(address _to, uint256 _amount) external onlyMinter {
    _mint(_to, _amount);
  }

  /// @notice Burn shares from `_from` (redeem path). Restricted to the protocol minter.
  /// @dev The protocol burns the redeemer's shares directly; no ERC20 allowance is required
  /// because the protocol is a trusted controller, not a third-party spender.
  function burn(address _from, uint256 _amount) external onlyMinter {
    _burn(_from, _amount);
  }

  /// @notice Governance updates the minter (e.g. protocol upgrade/migration). onlyOwner.
  function setMinter(address _newMinter) external onlyOwner {
    emit MinterSet(minter, _newMinter);
    minter = _newMinter;
  }
}
