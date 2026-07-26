// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";

/// @notice Thin Ownable wrapper around LayerZero native `OFT` for Horizen-side ZEN.
/// @dev On Base, ZEN is ERC20 + `ZenTokenOFTAdapter`; do not treat Base ZEN as native OFT.
contract ZenTokenOFT is OFT {
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate
    ) OFT(_name, _symbol, _lzEndpoint, _delegate) Ownable(_delegate) {}
}
