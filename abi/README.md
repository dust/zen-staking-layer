# stLighter ABIs

Stable contract ABIs for the frontend and the Goldsky indexer. Generated from the
production build (`via_ir`, the only build that matches deployed bytecode).

| File | Contract | Notes |
|------|----------|-------|
| `StLighter.json` | `src/stlighter/StLighter.sol` | Protocol vault. **Bind to the proxy address**, not the implementation. UUPS-upgradeable, so the ABI may gain functions across upgrades — regenerate after each upgrade. |
| `LtZEN.json` | `src/stlighter/LtZEN.sol` | ltZEN OFT share token. Same bytecode on Horizen (hub) and Base (spoke); only `minter` differs (proxy on hub, `address(0)` on spoke). |
| `InboundStation.json` | `src/stlighter/station/InboundStation.sol` | Cross-chain stake credit (Wave A). |
| `EgressStation.json` | `src/stlighter/station/EgressStation.sol` | Redeem to Base credit / bridge (Wave B). |
| `ZenOftStationBridge.json` | `src/stlighter/station/ZenOftStationBridge.sol` | Egress OFT bridge adapter (quote + send). |

## Indexer-relevant events

`StLighter`: `Deposited`, `Redeemed`, `Harvested`, `FeeParametersSet`, `Paused`/`Unpaused`,
`Upgraded`, `OwnershipTransferred`.
`LtZEN`: ERC20 `Transfer`/`Approval`, `MinterSet`, and the LayerZero OFT send/receive events.

## Exchange rate / global state

Read from the **proxy**: `convertToAssets(shares)`, `convertToShares(assets)`,
`previewRedeem(shares)`, `totalAssets()`, `issuedShares()`. `issuedShares` is the
cross-chain-invariant share denominator; `totalAssets` reads the live ZenStaker position.

## Regenerate

```bash
forge inspect src/stlighter/StLighter.sol:StLighter abi --json | jq -S . > abi/StLighter.json
forge inspect src/stlighter/LtZEN.sol:LtZEN abi --json     | jq -S . > abi/LtZEN.json
forge inspect src/stlighter/station/InboundStation.sol:InboundStation abi --json | jq -S . > abi/InboundStation.json
forge inspect src/stlighter/station/EgressStation.sol:EgressStation abi --json | jq -S . > abi/EgressStation.json
forge inspect src/stlighter/station/ZenOftStationBridge.sol:ZenOftStationBridge abi --json | jq -S . > abi/ZenOftStationBridge.json
```

Keys are sorted (`jq -S`) so regenerated files diff cleanly. Do not hand-edit.
