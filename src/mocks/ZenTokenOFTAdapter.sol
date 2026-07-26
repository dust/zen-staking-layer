// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";

/// @notice Thin Ownable wrapper around LayerZero `OFTAdapter` for Base-side ZEN.
/// @dev Base ZEN is a plain ERC20; this adapter locks/unlocks it for cross-chain.
///      Horizen counterpart is native `ZenTokenOFT` (see `ZenTokenOFT.sol`).
contract ZenTokenOFTAdapter is OFTAdapter {
    constructor(
        address _token,
        address _lzEndpoint,
        address _delegate
    ) OFTAdapter(_token, _lzEndpoint, _delegate) Ownable(_delegate) {}
}