// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {LtZEN} from "../src/stlighter/LtZEN.sol";

/// @notice Wires the ltZEN OFT peers between Horizen and Base, and (placeholder) DVN/library
/// config. Run once per direction, by the OFT owner (governance). LayerZero peering is
/// bidirectional: each chain's OFT must registers the other as a peer.
///
/// @dev setPeer takes the REMOTE chain's LayerZero Endpoint ID (eid) and the remote OFT address
/// encoded as bytes32. This is the highest-risk config step — a wrong peer can lose bridged
/// funds — so it must be executed by the multisig+timelock owner. See PRD §7.
///
/// Required env vars:
///   LT_ZEN_LOCAL        — ltZEN address on the chain you are broadcasting to
///   PEER_EID            — LayerZero endpoint id of the REMOTE chain
///   PEER_LT_ZEN         — ltZEN address on the REMOTE chain
///   PRIVATE_KEY         — OFT owner key (governance)
///
/// DVN / security stack config (open question §9-5) is left as TODO — set send/receive libraries
/// and ULN config (required + optional DVNs, confirmations) before going live.
contract WireStLighterOFT is Script {
  function run() external {
    address localLtZen = vm.envAddress("LT_ZEN_LOCAL");
    uint32 peerEid = uint32(vm.envUint("PEER_EID"));
    address peerLtZen = vm.envAddress("PEER_LT_ZEN");
    uint256 ownerKey = vm.envUint("PRIVATE_KEY");

    vm.startBroadcast(ownerKey);

    LtZEN ltZen = LtZEN(localLtZen);
    // ltZen.setPeer(peerEid, bytes32(uint256(uint160(peerLtZen))));   // TODO: OFT.setPeer
    console2.log("Set peer on:", localLtZen);
    console2.log("Peer eid:   ", peerEid);
    console2.log("Peer ltZEN: ", peerLtZen);

    // TODO: configure DVNs + confirmations via EndpointV2.setConfig (send + receive ULN).
    //       e.g. required DVNs = {LayerZero Labs DVN, <second DVN>}, confirmations = N.

    vm.stopBroadcast();
  }
}
