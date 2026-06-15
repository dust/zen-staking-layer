// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {LtZEN} from "../src/stlighter/LtZEN.sol";
import {StLighterGovernanceLib} from "./StLighterGovernanceLib.sol";

/// @notice Deploys the ltZEN OFT on the SPOKE chain (Base). Identical token contract to Horizen,
/// but with NO minter (minter = address(0)) — there is no StLighter vault on Base, so local
/// mint/burn is disabled. Cross-chain mint/burn still works via the LayerZero OFT path.
///
/// Required env vars:
///   LZ_ENDPOINT_BASE — LayerZero V2 Endpoint on Base
///   PRIVATE_KEY      — deployer key
///   TIMELOCK_ADDRESS (or GOVERNANCE_ADDRESS alias) — timelock owns OFT config on Base
///
/// After deploying on BOTH chains, run WireStLighterOFT to set peers + DVN config.
contract DeployStLighterBase is Script {
  function run() external returns (LtZEN ltZen) {
    address lzEndpoint = vm.envAddress("LZ_ENDPOINT_BASE");
    address governance = StLighterGovernanceLib.timelockAddress();
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");
    address deployer = vm.addr(deployerKey);

    vm.startBroadcast(deployerKey);

    // Spoke ltZEN: no protocol, minter stays address(0). Deployer = temp owner for wiring.
    ltZen = new LtZEN("ltZEN", "ltZEN", lzEndpoint, deployer, address(0));
    console2.log("LtZEN (Base spoke):", address(ltZen));

    ltZen.transferOwnership(governance);

    vm.stopBroadcast();

    console2.log("Timelock:  ", governance);
    console2.log("NOTE: run WireStLighterOFT to connect Horizen <-> Base peers and DVN config.");
  }
}
