import type { Abi, Address } from "viem";
import StLighterJson from "@/abi/StLighter.json";
import LtZENJson from "@/abi/LtZEN.json";
import InboundStationJson from "@/abi/InboundStation.json";
import EgressStationJson from "@/abi/EgressStation.json";
import ZenOftStationBridgeJson from "@/abi/ZenOftStationBridge.json";
import { base, horizen } from "./chains";

/**
 * Contract registry (frontend-plan §1 / §2 config/contracts.ts).
 *
 * Every address is env-injected (`NEXT_PUBLIC_*`), grouped by chain, and bound to the
 * PROXY address where applicable (abi/README). Nothing is hardcoded. Missing values
 * resolve to `undefined` so the UI can show a clear "not configured" state
 * instead of crashing (frontend-plan §7).
 */

const StLighterAbi = StLighterJson as Abi;
const LtZENAbi = LtZENJson as Abi;
const InboundStationAbi = InboundStationJson as Abi;
const EgressStationAbi = EgressStationJson as Abi;
const ZenOftStationBridgeAbi = ZenOftStationBridgeJson as Abi;

/** Minimal inline ABIs for contracts we only touch lightly (frontend-plan §1). */
export const MockZenAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "eip712Domain",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "fields", type: "bytes1" },
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
      { name: "salt", type: "bytes32" },
      { name: "extensions", type: "uint256[]" },
    ],
  },
] as const satisfies Abi;

export const ZenStakerAbi = [
  {
    type: "function",
    name: "rewardPerTokenAccumulated",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

function envAddress(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? (trimmed as Address) : undefined;
}

function envUint32(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const n = Number(value.trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Per-chain contract addresses, read from env at module load. */
export const addresses = {
  [horizen.id]: {
    stLighter: envAddress(process.env.NEXT_PUBLIC_HORIZEN_STLIGHTER_ADDRESS),
    ltZEN: envAddress(process.env.NEXT_PUBLIC_HORIZEN_LTZEN_ADDRESS),
    zen: envAddress(process.env.NEXT_PUBLIC_HORIZEN_ZEN_ADDRESS),
    zenStaker: envAddress(process.env.NEXT_PUBLIC_HORIZEN_ZENSTAKER_ADDRESS),
    inboundStation: envAddress(process.env.NEXT_PUBLIC_HORIZEN_INBOUND_STATION_ADDRESS),
    egressStation: envAddress(process.env.NEXT_PUBLIC_HORIZEN_EGRESS_STATION_ADDRESS),
    zenOftStationBridge: envAddress(
      process.env.NEXT_PUBLIC_HORIZEN_ZEN_OFT_STATION_BRIDGE_ADDRESS,
    ),
    /** Horizen ZenTokenOFT; defaults to `zen` when unset (native OFT = token). */
    zenOft:
      envAddress(process.env.NEXT_PUBLIC_HORIZEN_ZEN_OFT_ADDRESS) ??
      envAddress(process.env.NEXT_PUBLIC_HORIZEN_ZEN_ADDRESS),
  },
  [base.id]: {
    ltZEN: envAddress(process.env.NEXT_PUBLIC_BASE_LTZEN_ADDRESS),
    /**
     * Base ZEN is a plain ERC20 (not an OFT). Required for cross-chain stake balance/approve.
     */
    zen: envAddress(process.env.NEXT_PUBLIC_BASE_ZEN_ADDRESS),
    /**
     * Existing ZenTokenOFTAdapter on Base (`OFTAdapter`). Prefer
     * NEXT_PUBLIC_BASE_ZEN_OFT_ADAPTER_ADDRESS; legacy NEXT_PUBLIC_BASE_ZEN_OFT_ADDRESS still works.
     */
    zenOftAdapter:
      envAddress(process.env.NEXT_PUBLIC_BASE_ZEN_OFT_ADAPTER_ADDRESS) ??
      envAddress(process.env.NEXT_PUBLIC_BASE_ZEN_OFT_ADDRESS),
  },
} as const;

/** LayerZero endpoint IDs for OFT SendParam.dstEid. */
export const layerZeroEids = {
  horizen: envUint32(process.env.NEXT_PUBLIC_HORIZEN_EID),
  base: envUint32(process.env.NEXT_PUBLIC_BASE_EID),
} as const;

/** ABIs grouped by logical contract name. */
export const abis = {
  stLighter: StLighterAbi,
  ltZEN: LtZENAbi,
  /**
   * IOFT surface (`quoteSend` / `send`) — used for Horizen ZenTokenOFT and Base ZenTokenOFTAdapter.
   * Do not use for Base ZEN balances (use `zen` ERC20 ABI).
   */
  zenOft: LtZENAbi,
  inboundStation: InboundStationAbi,
  egressStation: EgressStationAbi,
  zenOftStationBridge: ZenOftStationBridgeAbi,
  zen: MockZenAbi,
  zenStaker: ZenStakerAbi,
} as const;

export type HorizenContract = keyof (typeof addresses)[typeof horizen.id];
export type BaseContract = keyof (typeof addresses)[typeof base.id];

/** Resolve a Horizen contract's address; `undefined` when not configured. */
export function horizenAddress(name: HorizenContract): Address | undefined {
  return addresses[horizen.id][name];
}

/** Resolve a Base contract's address; `undefined` when not configured. */
export function baseAddress(name: BaseContract): Address | undefined {
  return addresses[base.id][name];
}

/**
 * True when Cross-chain Stake env surface is complete enough to run the wizard.
 * Requires Base ERC20 ZEN + OFTAdapter (distinct), Horizen Station/StLighter, and Horizen eid.
 */
export function crossChainStakeConfigured(): boolean {
  return Boolean(
    horizenAddress("inboundStation") &&
      horizenAddress("stLighter") &&
      baseAddress("zen") &&
      baseAddress("zenOftAdapter") &&
      layerZeroEids.horizen,
  );
}

/**
 * True when Redeem-to-Base env surface is complete.
 * Requires Egress + Bridge + StLighter + Base ZEN (receipt check) + Base eid.
 */
export function redeemToBaseConfigured(): boolean {
  return Boolean(
    horizenAddress("egressStation") &&
      horizenAddress("zenOftStationBridge") &&
      horizenAddress("stLighter") &&
      horizenAddress("ltZEN") &&
      baseAddress("zen") &&
      layerZeroEids.base,
  );
}
