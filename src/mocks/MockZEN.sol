// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {
  ERC20,
  ERC20Permit,
  IERC20Permit
} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Staking} from "../interfaces/IERC20Staking.sol";
import {IMintable} from "../interfaces/IMintable.sol";

/// @title MockZEN
/// @notice A faucet-style ERC20 used as a drop-in stand-in for the real ZEN token on testnets.
/// Anyone can mint, but each `mint` call is capped at 256 ZEN so a single caller cannot drain
/// arbitrary balances. Supports EIP-2612 permit so it works with ZenStaker's `permitAndStake`.
///
/// @dev Same shape as `test/mocks/MockERC20Votes.sol` (delegation methods are mocked, no real
/// checkpointing), but lives under `src/mocks/` so deploy scripts can reference it without
/// reaching into the test tree, and adds the per-call mint cap. NOT for production: real ZEN
/// replaces this at mainnet.
contract MockZEN is IERC20Staking, IMintable, ERC20Permit {
  /// @notice Maximum tokens that can be minted in a single `mint` call (256 ZEN, 18 decimals).
  uint256 public constant MAX_MINT_PER_CALL = 256e18;

  /// @dev Tracks delegations for the mocked delegation methods (no voting weight is computed).
  mapping(address account => address delegate) private delegations;

  /// @notice Thrown when a `mint` call requests more than `MAX_MINT_PER_CALL`.
  error MockZEN__MintAmountExceedsCap(uint256 requested, uint256 cap);

  constructor() ERC20("Mock ZEN", "ZEN") ERC20Permit("Mock ZEN") {}

  /// @notice Mint up to `MAX_MINT_PER_CALL` tokens to `_account`. Open to anyone (testnet faucet).
  /// @param _account Recipient of the minted tokens.
  /// @param _value Amount to mint; reverts if greater than `MAX_MINT_PER_CALL`.
  function mint(address _account, uint256 _value) public {
    if (_value > MAX_MINT_PER_CALL) revert MockZEN__MintAmountExceedsCap(_value, MAX_MINT_PER_CALL);
    _mint(_account, _value);
  }

  /// @notice Convenience faucet: mint the full per-call cap (256 ZEN) to the caller.
  function mint() external {
    _mint(msg.sender, MAX_MINT_PER_CALL);
  }

  /// @dev Mock delegation method — records the delegatee, computes no voting weight.
  function delegate(address _delegatee) external {
    delegations[msg.sender] = _delegatee;
  }

  /// @dev Mock method returning the address `_account` last delegated to via `delegate`.
  function delegates(address _account) external view returns (address) {
    return delegations[_account];
  }

  //---------------------------------------------------------------------------------------------//
  // The methods below are overridden solely to disambiguate identical signatures inherited from //
  // both IERC20Staking and ERC20. No behavior is added; all calls forward to OpenZeppelin's     //
  // ERC20 / ERC20Permit implementations.                                                        //
  //---------------------------------------------------------------------------------------------//

  function allowance(address account, address spender)
    public
    view
    override(IERC20, ERC20)
    returns (uint256)
  {
    return ERC20.allowance(account, spender);
  }

  function balanceOf(address account) public view override(IERC20, ERC20) returns (uint256) {
    return ERC20.balanceOf(account);
  }

  function approve(address spender, uint256 rawAmount)
    public
    override(IERC20, ERC20)
    returns (bool)
  {
    return ERC20.approve(spender, rawAmount);
  }

  function totalSupply() public view override(IERC20, ERC20) returns (uint256) {
    return ERC20.totalSupply();
  }

  function transfer(address dst, uint256 rawAmount) public override(IERC20, ERC20) returns (bool) {
    return ERC20.transfer(dst, rawAmount);
  }

  function transferFrom(address src, address dst, uint256 rawAmount)
    public
    override(IERC20, ERC20)
    returns (bool)
  {
    return ERC20.transferFrom(src, dst, rawAmount);
  }

  function nonces(address owner)
    public
    view
    virtual
    override(ERC20Permit, IERC20Permit)
    returns (uint256)
  {
    return ERC20Permit.nonces(owner);
  }
}
