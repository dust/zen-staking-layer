// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";

/// @notice Shared env helpers for stLighter governance scripts.
library StLighterGovernanceLib {
  Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

  /// @dev Reads `TIMELOCK_ADDRESS` when set; otherwise falls back to `GOVERNANCE_ADDRESS`.
  function timelockAddress() internal view returns (address) {
    return VM.envOr("TIMELOCK_ADDRESS", VM.envAddress("GOVERNANCE_ADDRESS"));
  }
}
