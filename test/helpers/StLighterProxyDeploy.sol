// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ZenStaker} from "../../src/ZenStaker.sol";
import {StLighter} from "../../src/stlighter/StLighter.sol";
import {ILtZEN} from "../../src/stlighter/ILtZEN.sol";

/// @notice Deploy StLighter behind an ERC1967 UUPS proxy for tests and scripts.
library StLighterProxyDeploy {
  /// @return implementation Fresh implementation (initializers disabled).
  /// @return proxy UUPS proxy with `initialize` already called.
  function deploy(IERC20 _zen, ZenStaker _staker, ILtZEN _ltZen, address _owner)
    internal
    returns (StLighter implementation, StLighter proxy)
  {
    implementation = new StLighter();
    bytes memory initData = abi.encodeCall(StLighter.initialize, (_zen, _staker, _ltZen, _owner));
    proxy = StLighter(payable(address(new ERC1967Proxy(address(implementation), initData))));
  }
}
