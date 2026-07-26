// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InboundStation} from "../src/stlighter/station/InboundStation.sol";
import {StLighterGovernanceLib} from "./StLighterGovernanceLib.sol";

/// @notice Deploys Horizen `InboundStation` for cross-chain stake (Wave A).
///
/// Required env:
///   ZEN_TOKEN_ADDRESS       — Horizen ZenTokenOFT (also Station `zen` + `zenOft`)
///   STLIGHTER_PROXY_ADDRESS — StLighter ERC1967 proxy
///   LZ_ENDPOINT_HORIZEN     — composeCaller (Endpoint / MessagingComposer)
///   PRIVATE_KEY             — deployer
///
/// Owner: `TIMELOCK_ADDRESS` or `GOVERNANCE_ADDRESS` (testnet: deployer EOA).
contract DeployInboundStation is Script {
  function run() external returns (InboundStation station) {
    address zenOft = vm.envAddress("ZEN_TOKEN_ADDRESS");
    address stLighter = vm.envAddress("STLIGHTER_PROXY_ADDRESS");
    address composeCaller = vm.envAddress("LZ_ENDPOINT_HORIZEN");
    address owner_ = StLighterGovernanceLib.timelockAddress();
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");

    vm.startBroadcast(deployerKey);
    station = new InboundStation(
      IERC20(zenOft), stLighter, composeCaller, zenOft, owner_
    );
    vm.stopBroadcast();

    console2.log("InboundStation: ", address(station));
    console2.log("zen / zenOft:   ", zenOft);
    console2.log("stLighter:      ", stLighter);
    console2.log("composeCaller:  ", composeCaller);
    console2.log("owner:          ", owner_);
  }
}
