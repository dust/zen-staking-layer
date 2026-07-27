/**
 * Station compose payload + LayerZero executor options for OFT send+compose.
 * Matches `StationComposePayload.sol` v1 and OptionsBuilder / ExecutorOptions encoding.
 *
 * Type-3 options layout (per OptionsBuilder.addExecutorOption):
 *   uint16 TYPE_3 (=3)
 *   repeated:
 *     uint8  workerId (=1 executor)
 *     uint16 optionSize  // = 1 (optionType) + len(optionPayload)
 *     uint8  optionType
 *     bytes  optionPayload
 *
 * LzReceive payload (value==0): uint128 gas only
 * LzCompose payload (value==0): uint16 index + uint128 gas
 */

import { encodeAbiParameters, type Address, type Hex } from "viem";

export const STATION_COMPOSE_PAYLOAD_VERSION = 1;

/** Encode InboundStation compose body (inside OFTComposeMsgCodec.composeMsg). */
export function encodeStationComposePayloadV1(params: {
  owner: Address;
  assets: bigint;
  nonce: bigint;
  deadline: bigint;
  signature: Hex;
}): Hex {
  return encodeAbiParameters(
    [
      { type: "uint8" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes" },
    ],
    [
      STATION_COMPOSE_PAYLOAD_VERSION,
      params.owner,
      params.assets,
      params.nonce,
      params.deadline,
      params.signature,
    ],
  );
}

/**
 * OptionsBuilder.newOptions()
 *   .addExecutorLzReceiveOption(lzReceiveGas, 0)
 *   .addExecutorLzComposeOption(0, lzComposeGas, 0)
 */
export function buildOftSendComposeOptions(params?: {
  lzReceiveGas?: number;
  lzComposeGas?: number;
}): Hex {
  const lzReceiveGas = params?.lzReceiveGas ?? 200_000;
  const lzComposeGas = params?.lzComposeGas ?? 400_000;
  const receive = encodeExecutorOption(
    OPTION_TYPE_LZRECEIVE,
    encodeLzReceiveOption(BigInt(lzReceiveGas), 0n),
  );
  const compose = encodeExecutorOption(
    OPTION_TYPE_LZCOMPOSE,
    encodeLzComposeOption(0, BigInt(lzComposeGas), 0n),
  );
  return `0x0003${receive}${compose}` as Hex;
}

/**
 * OptionsBuilder.newOptions().addExecutorLzReceiveOption(lzReceiveGas, 0)
 * — outbound ZEN OFT send without compose (Redeem to Base / Egress bridge).
 */
export function buildOftSendLzReceiveOptions(params?: { lzReceiveGas?: number }): Hex {
  const lzReceiveGas = params?.lzReceiveGas ?? 200_000;
  const receive = encodeExecutorOption(
    OPTION_TYPE_LZRECEIVE,
    encodeLzReceiveOption(BigInt(lzReceiveGas), 0n),
  );
  return `0x0003${receive}` as Hex;
}

const WORKER_ID_EXECUTOR = 1;
const OPTION_TYPE_LZRECEIVE = 1;
const OPTION_TYPE_LZCOMPOSE = 3;

/** Matches ExecutorOptions.encodeLzReceiveOption (omit value when 0). */
function encodeLzReceiveOption(gas: bigint, value: bigint): string {
  return value === 0n ? u128(gas) : `${u128(gas)}${u128(value)}`;
}

/** Matches ExecutorOptions.encodeLzComposeOption (omit value when 0). */
function encodeLzComposeOption(index: number, gas: bigint, value: bigint): string {
  const payload = `${u16(index)}${u128(gas)}`;
  return value === 0n ? payload : `${payload}${u128(value)}`;
}

/**
 * Matches OptionsBuilder.addExecutorOption packing:
 * workerId | uint16(optionPayload.length + 1) | optionType | optionPayload
 */
function encodeExecutorOption(optionType: number, optionPayloadHex: string): string {
  const payloadBytes = optionPayloadHex.length / 2;
  const size = payloadBytes + 1; // +1 for optionType
  return `${u8(WORKER_ID_EXECUTOR)}${u16(size)}${u8(optionType)}${optionPayloadHex}`;
}

function u8(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function u16(n: number): string {
  return n.toString(16).padStart(4, "0");
}

function u128(n: bigint): string {
  return n.toString(16).padStart(32, "0");
}

/** bytes32 recipient for OFT SendParam.to */
export function addressToBytes32(addr: Address): Hex {
  return `0x${addr.slice(2).toLowerCase().padStart(64, "0")}` as Hex;
}
