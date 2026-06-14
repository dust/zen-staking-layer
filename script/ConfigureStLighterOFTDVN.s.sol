// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {SetConfigParam} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {ILayerZeroEndpointV2} from
  "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/// @notice Configures LayerZero ULN (DVN + confirmations) for ltZEN on one chain.
///
/// Copy values from the live Horizen **ZenTokenOFT**
/// (`0x57da2D504bf8b83Ef304759d9f2648522D7a9280`) Horizen ↔ Base path — see
/// `docs/stLighter-oft-reference.md`. StargateOFTUSDC
/// (`0x3a1293Bdb83bBbDd5Ebf4fAc96605aD2021BbC0f`) is a secondary cross-check.
///
/// Required env vars:
///   LT_ZEN_LOCAL       — ltZEN on the chain you are broadcasting to
///   LZ_ENDPOINT        — LayerZero EndpointV2 on this chain
///   PEER_EID           — remote chain endpoint id
///   LZ_SEND_LIB        — send library (e.g. SendUln302)
///   LZ_RECEIVE_LIB     — receive library (e.g. ReceiveUln302)
///   LZ_CONFIRMATIONS   — block confirmations (uint64)
///   DVN_ADDRESSES      — comma-separated required DVN addresses (sorted ascending)
///   PRIVATE_KEY        — OFT owner (timelock executor / governance)
///
/// Optional:
///   DVN_OPTIONAL_ADDRESSES — comma-separated optional DVNs (default empty)
///   DVN_OPTIONAL_THRESHOLD — optional DVN threshold (default 0)
contract ConfigureStLighterOFTDVN is Script {
  uint32 internal constant CONFIG_TYPE_ULN = 2;

  function run() external {
    address ltZen = vm.envAddress("LT_ZEN_LOCAL");
    address endpointAddr = vm.envAddress("LZ_ENDPOINT");
    uint32 peerEid = uint32(vm.envUint("PEER_EID"));
    address sendLib = vm.envAddress("LZ_SEND_LIB");
    address receiveLib = vm.envAddress("LZ_RECEIVE_LIB");
    uint64 confirmations = uint64(vm.envUint("LZ_CONFIRMATIONS"));
    address[] memory requiredDvns = _parseAddressList(vm.envString("DVN_ADDRESSES"));
    address[] memory optionalDvns = _parseAddressList(vm.envOr("DVN_OPTIONAL_ADDRESSES", string("")));
    uint8 optionalThreshold = uint8(vm.envOr("DVN_OPTIONAL_THRESHOLD", uint256(0)));
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

    vm.startBroadcast(ownerKey);
    endpoint.setConfig(ltZen, sendLib, sendParams);
    endpoint.setConfig(ltZen, receiveLib, receiveParams);
    vm.stopBroadcast();

    console2.log("ULN configured for ltZEN:", ltZen);
    console2.log("Peer eid:              ", peerEid);
    console2.log("Confirmations:         ", confirmations);
    console2.log("Required DVNs:         ", requiredDvns.length);
  }

  function _parseAddressList(string memory _csv) private view returns (address[] memory addrs) {
    bytes memory csv = bytes(_csv);
    if (csv.length == 0) {
      return new address[](0);
    }
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
