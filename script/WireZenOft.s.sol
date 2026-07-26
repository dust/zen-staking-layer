// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";

/// @dev Minimal OApp peer surface shared by ZenTokenOFT and ZenTokenOFTAdapter.
interface IOAppSetPeer {
  function setPeer(uint32 _eid, bytes32 _peer) external;
  function peers(uint32 _eid) external view returns (bytes32);
}

/// @notice Wires ZEN OFT peers: Base `ZenTokenOFTAdapter` ↔ Horizen `ZenTokenOFT`.
/// Run once per direction (broadcast to the chain that owns `ZEN_OFT_LOCAL`).
///
/// Required env:
///   ZEN_OFT_LOCAL  — adapter (Base) or ZenTokenOFT (Horizen) on the chain you broadcast to
///   PEER_EID       — LayerZero eid of the REMOTE chain
///   PEER_ZEN_OFT   — remote OFT/adapter address
///   PRIVATE_KEY    — OApp owner
contract WireZenOft is Script {
  function run() external {
    address local = vm.envAddress("ZEN_OFT_LOCAL");
    uint32 peerEid = uint32(vm.envUint("PEER_EID"));
    address peer = vm.envAddress("PEER_ZEN_OFT");
    uint256 ownerKey = vm.envUint("PRIVATE_KEY");

    vm.startBroadcast(ownerKey);
    IOAppSetPeer(local).setPeer(peerEid, bytes32(uint256(uint160(peer))));
    vm.stopBroadcast();

    console2.log("Set ZEN OFT peer on:", local);
    console2.log("Peer eid:          ", peerEid);
    console2.log("Peer OFT/adapter:  ", peer);
    console2.log("NOTE: run ConfigureStLighterOFTDVN with OAPP_LOCAL=this address per chain.");
  }
}
