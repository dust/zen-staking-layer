# stLighter Station — Compose / Bridge ADR (S5)

> **Status**: S5a + S5b implemented. Companion to [`stLighter-station-design.md`](./stLighter-station-design.md).  
> **Updated**: 2026-07-22

## 1. Inbound (Base ZEN → Horizen InboundStation)

### Token path

- Asset: **ZenTokenOFT** (native LZ OFT), not Stargate.
- Source: Base OFT `send` with `to = bytes32(InboundStation)`, `composeMsg` set, compose gas in options.
- Destination OFT `_lzReceive` credits ZEN to InboundStation, then `endpoint.sendCompose(InboundStation, guid, message)`.
- InboundStation implements `ILayerZeroComposer.lzCompose`.

### Auth

| Check | Value |
|-------|--------|
| `msg.sender` | LayerZero Endpoint / MessagingComposer (`composeCaller`) |
| `_from` | Horizen ZenTokenOFT address (`zenOft`) |
| Business auth | Owner EIP-712 `CreditFromCompose` + Station Nonces |

### Compose message body (`OFTComposeMsgCodec.composeMsg`)

```text
abi.encode(
  uint8 version,          // = 1
  address owner,
  uint256 assets,         // must equal amountLD (actual delivered)
  uint256 deadline,
  bytes signature         // EIP-712 CreditFromCompose over (assets, owner, nonce, deadline)
)
```

`amountLD` from the outer OFT compose envelope is the **authoritative** delivered amount; payload `assets` must match or the call reverts.

### Idempotency

Station Nonces (not `usedGuids[guid]`). `guid` is emitted for indexing only.

### Non-goals in compose

No stake, no `StLighter` call, no ETH refuel.

---

## 2. Egress (Horizen → Base)

### S2 Mock

`MockStationBridge`: holds ZEN; `mockComplete` / `mockFailAndRefund` drive `onBridgeComplete` / `onBridgeRefund`.

### S5b production: `ZenOftStationBridge`

| Item | Behaviour |
|------|-----------|
| Contract | `src/stlighter/station/ZenOftStationBridge.sol` |
| Caller | **Only** `EgressStation` (`msg.sender == egress`) |
| Token | `oft.token()` must equal `EgressStation.zen()` |
| `dstEid` | Immutable Base endpoint id |
| `oft.send` | `refundAddress = egress` (excess **native** fee → Egress `receive()`; never relayer EOA) |
| `extraOptions` | Relayer-supplied LZ executor options |
| Native fee | Relayer `msg.value`; adapter `quoteSend` then requires `msg.value >= nativeFee` |
| Success | OFT debits/burns on source → adapter calls `onBridgeComplete` **same tx** (clears pending) |
| Pre-send failure | Entire `bridgeToBase` reverts → credit/debit rolled back (no `onBridgeRefund` needed) |
| Post-send LZ failure | Out of MVP scope (tokens already burned/locked by OFT); ops/ADR escalation if needed |

`EgressStation.onBridgeComplete` / `onBridgeRefund` are **not** `nonReentrant` so the adapter can finalize in the same `bridgeToBase` call without clashing with Egress’s guard.

### Relayer UX

1. `quoteBridgeNativeFee(amount, dest, extraOptions)`
2. `bridgeToBase{value: fee}(..., extraOptions)`

---

## 3. Source-chain UX (Base)

User (or relayer) must supply a pre-signed `CreditFromCompose` for the **expected** Horizen Station nonce before bridging. Frontend / BFF reads `InboundStation.nonces(owner)` on Horizen and includes the signature in `composeMsg`.
