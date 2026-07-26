# stLighter Station — Compose / Bridge ADR (S5)

> **Status**: S5a + S5b implemented. Companion to [`stLighter-station-design.md`](./stLighter-station-design.md).  
> **Updated**: 2026-07-25 — Base ZEN = ERC20 + `ZenTokenOFTAdapter`; Horizen ZEN = native `ZenTokenOFT`.

## 0. ZEN / LayerZero topology (authoritative)

| Chain | ZEN token | LZ role |
|-------|-----------|---------|
| **Base** | Ordinary ERC20 (e.g. OZ `ERC20Capped`) — **not** an OFT | Existing **`ZenTokenOFTAdapter`** (`OFTAdapter`): `send` **locks** underlying ZEN |
| **Horizen** | **`ZenTokenOFT`** (native LZ `OFT`) — token **is** the OFT | `InboundStation.zenOft` / credited asset; Egress bridge source |

**Inbound path**: Base user `approve(adapter)` → `adapter.send(to=InboundStation, composeMsg)` → LZ → Horizen OFT credits Station → `lzCompose` accounting only.

Do **not** document Base ZEN as a native OFT.

---

## 1. Inbound (Base ZEN → Horizen InboundStation)

### Token path

- **Source (Base)**: `ZenTokenOFTAdapter.send` with `to = bytes32(InboundStation)`, `composeMsg` set, compose gas in options. Underlying ERC20 must be approved to the adapter first.
- **Destination (Horizen)**: native `ZenTokenOFT` `_lzReceive` credits ZEN to InboundStation, then `endpoint.sendCompose(InboundStation, guid, message)`.
- InboundStation implements `ILayerZeroComposer.lzCompose`.
- Not Stargate.

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
| Token | `oft.token()` must equal `EgressStation.zen()` (Horizen native OFT) |
| `dstEid` | Immutable Base endpoint id |
| `oft.send` | `refundAddress = egress` (excess **native** fee → Egress `receive()`; never relayer EOA) |
| Destination effect | Base **adapter unlocks** ERC20 ZEN to `dest` (B1) |
| `extraOptions` | Relayer-supplied LZ executor options |
| Native fee | Relayer `msg.value`; `quoteSend` then requires `msg.value >= nativeFee` |
| Success | OFT debits on Horizen → adapter calls `onBridgeComplete` **same tx** (clears pending) |
| Pre-send failure | Entire `bridgeToBase` reverts → credit/debit rolled back (no `onBridgeRefund` needed) |
| Post-send LZ failure | Out of MVP scope; ops/ADR escalation if needed |

`EgressStation.onBridgeComplete` / `onBridgeRefund` are **not** `nonReentrant` so the adapter can finalize in the same `bridgeToBase` call without clashing with Egress’s guard.

### Relayer UX

1. `quoteBridgeNativeFee(amount, dest, extraOptions)`
2. `bridgeToBase{value: fee}(..., extraOptions)`

---

## 3. Source-chain UX (Base)

1. Sign `CreditFromCompose` on **Horizen** InboundStation domain (read `nonces(owner)` via Horizen RPC; wallet may stay on Base).
2. If `ZEN.allowance(user, adapter) < amount`: user tx **`ZEN.approve(adapter, amount)`** (Base ZEN has no reliable permit story — do not claim gasless approve).
3. User tx **`ZenTokenOFTAdapter.send`** with compose payload + LZ `nativeFee` (user pays Base gas + fee).
4. Poll `InboundStation.credited(user)` on Horizen; then `DepositWithSig(payer=Station)` via relayer.

Frontend / BFF must treat **Base ERC20** and **Base OFTAdapter** as distinct addresses.
