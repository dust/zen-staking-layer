/** Server-only rrelayer / BFF configuration (never expose secrets via NEXT_PUBLIC_*). */

export function rrelayerConfigured(): boolean {
  const hasId = Boolean(process.env.RRELAYER_RELAYER_ID?.trim());
  const hasServer = Boolean(process.env.RRELAYER_SERVER_URL?.trim());
  const hasAuth =
    Boolean(process.env.RRELAYER_API_KEY?.trim()) ||
    (Boolean(process.env.RRELAYER_AUTH_USERNAME?.trim()) &&
      Boolean(process.env.RRELAYER_AUTH_PASSWORD?.trim()));
  return hasId && hasServer && hasAuth;
}

export function relayerFeeBps(): bigint {
  const raw = process.env.RELAYER_FEE_BPS ?? "50";
  try {
    return BigInt(raw);
  } catch {
    return 50n;
  }
}

export function stLighterAddress(): `0x${string}` | undefined {
  const v = process.env.NEXT_PUBLIC_HORIZEN_STLIGHTER_ADDRESS?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

export function inboundStationAddress(): `0x${string}` | undefined {
  const v = process.env.NEXT_PUBLIC_HORIZEN_INBOUND_STATION_ADDRESS?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

export function egressStationAddress(): `0x${string}` | undefined {
  const v = process.env.NEXT_PUBLIC_HORIZEN_EGRESS_STATION_ADDRESS?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

export function zenOftStationBridgeAddress(): `0x${string}` | undefined {
  const v = process.env.NEXT_PUBLIC_HORIZEN_ZEN_OFT_STATION_BRIDGE_ADDRESS?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

export function ltZenAddress(): `0x${string}` | undefined {
  const v = process.env.NEXT_PUBLIC_HORIZEN_LTZEN_ADDRESS?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}
