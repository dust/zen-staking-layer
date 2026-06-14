// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ZenStaker} from "../src/ZenStaker.sol";
import {StLighter} from "../src/stlighter/StLighter.sol";
import {LtZEN} from "../src/stlighter/LtZEN.sol";
import {ILtZEN} from "../src/stlighter/ILtZEN.sol";

/// @notice Deploys the stLighter protocol on the HUB chain (Horizen): the ltZEN OFT share token
/// plus the StLighter vault-accounting contract, then wires the minter role.
///
/// @dev DEPLOY ORDER MATTERS — there is a circular dependency:
///   StLighter.LT_ZEN is immutable (needs ltZEN address), and LtZEN.minter must be StLighter.
/// Resolution:
///   1. Deploy LtZEN with minter = address(0) (no minting possible yet).
///   2. Deploy StLighter, passing the LtZEN address.
///   3. LtZEN.setMinter(StLighter)  ← owner-only; only now can the protocol mint/burn.
///   4. Transfer LtZEN + StLighter ownership to governance (multisig + timelock).
///
/// Required env vars:
///   ZEN_TOKEN_ADDRESS    — ZEN ERC20 on Horizen
///   ZEN_STAKER_ADDRESS   — deployed ZenStaker on Horizen
///   LZ_ENDPOINT_HORIZEN  — LayerZero V2 Endpoint on Horizen
///   GOVERNANCE_ADDRESS   — final owner (multisig + timelock)
///   PRIVATE_KEY          — deployer key
contract DeployStLighterHorizen is Script {
  function run() external returns (LtZEN ltZen, StLighter protocol) {
    address zen = vm.envAddress("ZEN_TOKEN_ADDRESS");
    address staker = vm.envAddress("ZEN_STAKER_ADDRESS");
    address lzEndpoint = vm.envAddress("LZ_ENDPOINT_HORIZEN");
    address governance = vm.envAddress("GOVERNANCE_ADDRESS");
    uint256 deployerKey = vm.envUint("PRIVATE_KEY");
    address deployer = vm.addr(deployerKey);

    vm.startBroadcast(deployerKey);

    // 1. ltZEN OFT — deployer is temporary owner so it can call setMinter; minter starts unset.
    ltZen = new LtZEN("Lighter Staked ZEN", "ltZEN", lzEndpoint, deployer, address(0));
    console2.log("LtZEN:    ", address(ltZen));

    // 2. Vault-accounting protocol (immutable ltZEN reference).
    protocol = new StLighter(IERC20(zen), ZenStaker(staker), ILtZEN(address(ltZen)), governance);
    console2.log("StLighter:", address(protocol));

    // 3. Wire minter: only the protocol may mint/burn on Horizen.
    ltZen.setMinter(address(protocol));

    // 4. Hand ltZEN ownership (OFT config: setPeer, DVN, libraries) to governance.
    //    StLighter ownership was set to governance in its constructor.
    // ltZen.transferOwnership(governance);   // TODO: Ownable2Step accept on governance side

    vm.stopBroadcast();

    console2.log("ZEN:      ", zen);
    console2.log("ZenStaker:", staker);
    console2.log("Governance:", governance);
    console2.log("NOTE: configure OFT peers/DVN and accept ownership from governance separately.");
  }
}
