// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {
  SetConfigParam
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {
  ILayerZeroEndpointV2
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/// @notice Pins MessageLibs + configures LayerZero ULN (DVN + confirmations) for an OApp
/// (ltZEN or ZEN OFT/adapter).
///
/// Order in one broadcast session (separate txs, not one atomic tx):
///   1. `setSendLibrary` / `setReceiveLibrary` — pin libs so pathway-default migrations cannot
///      silently drop the ULN override written below (`isDefault` → false).
///   2. `setConfig` on send + receive libs — ULN for `PEER_EID`.
///
/// Lib pin is idempotent: skipped when already set to the target address (avoids `LZ_SameValue`).
/// From pathway default → concrete lib, receive grace period must be `0`.
///
/// Copy values from a live Horizen ↔ Base OFT path — see `docs/stLighter-oft-reference.md`
/// and `docs/stLighter-deploy-checklist.md` §1 / §C1.
///
/// Required env vars:
///   OAPP_LOCAL         — OApp to configure (preferred); falls back to `LT_ZEN_LOCAL`
///   LZ_ENDPOINT        — LayerZero EndpointV2 on this chain
///   PEER_EID           — remote chain endpoint id
///   LZ_SEND_LIB        — send library (e.g. SendUln302) — must be THIS chain's lib
///   LZ_RECEIVE_LIB     — receive library (e.g. ReceiveUln302) — must be THIS chain's lib
///   LZ_CONFIRMATIONS   — block confirmations (uint64)
///   DVN_ADDRESSES      — comma-separated required DVN addresses (sorted ascending)
///   PRIVATE_KEY        — Endpoint delegate for the OApp (often deployer EOA; not Ownable owner)
///
/// Optional:
///   DVN_OPTIONAL_ADDRESSES — comma-separated optional DVNs (default empty)
///   DVN_OPTIONAL_THRESHOLD — optional DVN threshold (default 0)
///   LZ_RECEIVE_LIB_GRACE   — blocks of grace when switching between two non-default receive libs
///                            (default 0). Ignored when leaving pathway default (must be 0).
contract ConfigureStLighterOFTDVN is Script {
  uint32 internal constant CONFIG_TYPE_ULN = 2;

  function run() external {
    address oapp = vm.envExists("OAPP_LOCAL")
      ? vm.envAddress("OAPP_LOCAL")
      : vm.envAddress("LT_ZEN_LOCAL");
    address endpointAddr = vm.envAddress("LZ_ENDPOINT");
    uint32 peerEid = uint32(vm.envUint("PEER_EID"));
    address sendLib = vm.envAddress("LZ_SEND_LIB");
    address receiveLib = vm.envAddress("LZ_RECEIVE_LIB");
    uint64 confirmations = uint64(vm.envUint("LZ_CONFIRMATIONS"));
    address[] memory requiredDvns = _parseAddressList(vm.envString("DVN_ADDRESSES"));
    address[] memory optionalDvns =
      _parseAddressList(vm.envOr("DVN_OPTIONAL_ADDRESSES", string("")));
    uint8 optionalThreshold = uint8(vm.envOr("DVN_OPTIONAL_THRESHOLD", uint256(0)));
    uint256 receiveGrace = vm.envOr("LZ_RECEIVE_LIB_GRACE", uint256(0));
    uint256 ownerKey = vm.envUint("PRIVATE_KEY");

    UlnConfig memory ulnConfig = UlnConfig({
      confirmations: confirmations,
      requiredDVNCount: uint8(requiredDvns.length),
      optionalDVNCount: uint8(optionalDvns.length),
      optionalDVNThreshold: optionalThreshold,
      requiredDVNs: requiredDvns,
      optionalDVNs: optionalDvns
    });

    bytes memory encoded = abi.encode(ulnConfig);
    SetConfigParam[] memory sendParams = new SetConfigParam[](1);
    sendParams[0] = SetConfigParam({eid: peerEid, configType: CONFIG_TYPE_ULN, config: encoded});
    SetConfigParam[] memory receiveParams = new SetConfigParam[](1);
    receiveParams[0] = SetConfigParam({eid: peerEid, configType: CONFIG_TYPE_ULN, config: encoded});

    ILayerZeroEndpointV2 endpoint = ILayerZeroEndpointV2(endpointAddr);

    bool pinSend = endpoint.isDefaultSendLibrary(oapp, peerEid)
      || endpoint.getSendLibrary(oapp, peerEid) != sendLib;
    (address currentReceiveLib, bool receiveIsDefault) = endpoint.getReceiveLibrary(oapp, peerEid);
    bool pinReceive = receiveIsDefault || currentReceiveLib != receiveLib;
    // Pathway default → concrete lib: Endpoint requires gracePeriod == 0.
    uint256 grace = receiveIsDefault ? 0 : receiveGrace;

    vm.startBroadcast(ownerKey);
    if (pinSend) {
      endpoint.setSendLibrary(oapp, peerEid, sendLib);
    }
    if (pinReceive) {
      endpoint.setReceiveLibrary(oapp, peerEid, receiveLib, grace);
    }
    endpoint.setConfig(oapp, sendLib, sendParams);
    endpoint.setConfig(oapp, receiveLib, receiveParams);
    vm.stopBroadcast();

    console2.log("Configured OApp:      ", oapp);
    console2.log("Peer eid:             ", peerEid);
    console2.log("Send lib pinned:      ", pinSend);
    console2.log("Receive lib pinned:   ", pinReceive);
    console2.log("Confirmations:        ", confirmations);
    console2.log("Required DVNs:        ", requiredDvns.length);
  }

  function _parseAddressList(string memory _csv) private view returns (address[] memory addrs) {
    bytes memory csv = bytes(_csv);
    if (csv.length == 0) return new address[](0);
    uint256 count = 1;
    for (uint256 i = 0; i < csv.length; i++) {
      if (csv[i] == ",") count++;
    }
    addrs = new address[](count);
    uint256 idx;
    uint256 start;
    for (uint256 i = 0; i <= csv.length; i++) {
      if (i == csv.length || csv[i] == ",") {
        bytes memory token = new bytes(i - start);
        for (uint256 j = start; j < i; j++) {
          token[j - start] = csv[j];
        }
        addrs[idx++] = _parseAddress(string(token));
        start = i + 1;
      }
    }
  }

  function _parseAddress(string memory _s) private view returns (address) {
    bytes memory b = bytes(_s);
    // trim ASCII whitespace
    uint256 start;
    uint256 end = b.length;
    while (start < end && (b[start] == " " || b[start] == "\t")) start++;
    while (end > start && (b[end - 1] == " " || b[end - 1] == "\t")) end--;
    bytes memory trimmed = new bytes(end - start);
    for (uint256 i = start; i < end; i++) {
      trimmed[i - start] = b[i];
    }
    return vm.parseAddress(string(trimmed));
  }
}
