import type { Abi, Address } from "viem";
import StLighterJson from "@/abi/StLighter.json";
import LtZENJson from "@/abi/LtZEN.json";
import { base, horizen } from "./chains";

/**
 * Contract registry (frontend-plan §1 / §2 config/contracts.ts).
 *
 * Every address is env-injected (`NEXT_PUBLIC_*`), grouped by chain, and bound to the
 * PROXY address where applicable (abi/README). Nothing is hardcoded. Missing values
 * resolve to `undefined` so the UI can show a clear "未配置 / not configured" state
 * instead of crashing (frontend-plan §7).
 */

const StLighterAbi = StLighterJson as Abi;
const LtZENAbi = LtZENJson as Abi;

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

/** Per-chain contract addresses, read from env at module load. */
export const addresses = {
  [horizen.id]: {
    stLighter: envAddress(process.env.NEXT_PUBLIC_HORIZEN_STLIGHTER_ADDRESS),
    ltZEN: envAddress(process.env.NEXT_PUBLIC_HORIZEN_LTZEN_ADDRESS),
    zen: envAddress(process.env.NEXT_PUBLIC_HORIZEN_ZEN_ADDRESS),
    zenStaker: envAddress(process.env.NEXT_PUBLIC_HORIZEN_ZENSTAKER_ADDRESS),
  },
  [base.id]: {
    ltZEN: envAddress(process.env.NEXT_PUBLIC_BASE_LTZEN_ADDRESS),
  },
} as const;

/** ABIs grouped by logical contract name. */
export const abis = {
  stLighter: StLighterAbi,
  ltZEN: LtZENAbi,
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
