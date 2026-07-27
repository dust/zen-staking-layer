# Horizen CUSTOM gas provider (EIP-1559)

Tiny Go HTTP service used by rrelayer as `gas_provider: CUSTOM`.

```text
GET /{chainId}  → Infura-style slow|medium|fast|superFast (Gwei strings)
GET /health     → ok
```

Sources: `eth_getBlockByNumber(latest)` + `eth_maxPriorityFeePerGas` on the
configured RPC. See `../README.md` (CUSTOM gas provider) and compose env
`GAS_RPC_*` / `GAS_FLOOR_*`.
