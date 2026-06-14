// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @dev Minimal EIP-1271 wallet for gasless tests: accepts ECDSA signatures from a fixed owner EOA.
contract MockERC1271Wallet {
  address public immutable owner;

  constructor(address _owner) {
    owner = _owner;
  }

  function isValidSignature(bytes32 _hash, bytes memory _signature)
    external
    view
    returns (bytes4 magicValue)
  {
    address recovered = ECDSA.recover(_hash, _signature);
    if (recovered == owner) return IERC1271.isValidSignature.selector;
    return bytes4(0xffffffff);
  }
}
