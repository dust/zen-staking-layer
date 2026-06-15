// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ZenStaker} from "../src/ZenStaker.sol";
import {StLighter} from "../src/stlighter/StLighter.sol";
import {LtZEN} from "../src/stlighter/LtZEN.sol";
import {ILtZEN} from "../src/stlighter/ILtZEN.sol";
import {StLighterGovernanceLib} from "./StLighterGovernanceLib.sol";

/// @notice Deploys the stLighter protocol on the HUB chain (Horizen): ltZEN OFT + UUPS proxy.
///
/// @dev DEPLOY ORDER:
///   0. Run `DeployStLighterTimelock`; set `TIMELOCK_ADDRESS` to the deployed timelock.
///   1. LtZEN with minter = 0 (deployer = temp owner).
///   2. StLighter implementation + ERC1967Proxy(implementation, initialize(...)).
///   3. LtZEN.setMinter(proxy) — minter is the PROXY address (stable across upgrades).
///   4. LtZEN.transferOwnership(timelock) — immediate (plain Ownable, not two-step).
///
/// Governance model (PRD §7):
///   - StLighter `owner` = timelock — controls pause, fees, UUPS upgrades.
///   - UUPS upgrades: multisig schedules, then executes `upgradeToAndCall` via timelock
///     (`UpgradeStLighterViaTimelock.s.sol`).
///   - ltZEN minter stays the proxy address; no setMinter needed for routine impl upgrades.
///
/// Required env vars:
///   ZEN_TOKEN_ADDRESS, ZEN_STAKER_ADDRESS, LZ_ENDPOINT_HORIZEN, PRIVATE_KEY
///   TIMELOCK_ADDRESS (or GOVERNANCE_ADDRESS alias)
contract DeployStLighterHorizen is Script {
  function run() external returns (LtZEN ltZen, StLighter protocol, StLighter implementation) {
    address zen = vm.envAddress("ZEN_TOKEN_ADDRESS");
    address staker = vm.envAddress("ZEN_STAKER_ADDRESS");
    address lzEndpoint = vm.envAddress("LZ_ENDPOINT_HORIZEN");
    address governance = StLighterGovernanceLib.timelockAddress();
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");
    address deployer = vm.addr(deployerKey);

    vm.startBroadcast(deployerKey);

    ltZen = new LtZEN("ltZEN", "ltZEN", lzEndpoint, deployer, address(0));
    console2.log("LtZEN:         ", address(ltZen));

    implementation = new StLighter();
    bytes memory initData = abi.encodeCall(
      StLighter.initialize, (IERC20(zen), ZenStaker(staker), ILtZEN(address(ltZen)), governance)
    );
    protocol = StLighter(payable(address(new ERC1967Proxy(address(implementation), initData))));
    console2.log("Implementation:", address(implementation));
    console2.log("StLighter proxy:", address(protocol));

    ltZen.setMinter(address(protocol));
    ltZen.transferOwnership(governance);

    vm.stopBroadcast();

    console2.log("ZEN:           ", zen);
    console2.log("ZenStaker:     ", staker);
    console2.log("Timelock:      ", governance);
    console2.log("NOTE: wire OFT peers/DVN (WireStLighterOFT) before mainnet launch.");
  }
}
