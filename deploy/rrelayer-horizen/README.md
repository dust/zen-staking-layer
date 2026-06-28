# rrelayer — Horizen Testnet CUSTOM gas provider

Horizen RPC rejects EIP-1559 txs with `max_priority_fee_per_gas = 0`. rrelayer **FALLBACK** gas often returns zero tip on chain `2651420`.

Official fix: `gas_provider: CUSTOM` in `rrelayer.yaml` pointing at a static JSON endpoint (see [rrelayer gas provider docs](https://rrelayer.xyz)).

This folder is a **copy-paste reference** for your rrelayer deployment project — not used by ltzen-frontend at runtime.

## Files

| File | Purpose |
|------|---------|
| `horizen-gas.json` | Gas tiers (values in **Gwei**, rrelayer format) |
| `nginx.conf` | Serves JSON at `GET /2651420` |
| `docker-compose.gas-stub.yaml` | nginx sidecar on port 8787 |
| `rrelayer.yaml.snippet.yaml` | Merge into your `rrelayer.yaml` |

## Setup

### 1. Copy into rrelayer project

```bash
RRELAYER_PROJECT=/path/to/your/rrelayer-project   # from `rrelayer new`

cp deploy/rrelayer-horizen/horizen-gas.json "$RRELAYER_PROJECT/"
cp deploy/rrelayer-horizen/nginx.conf "$RRELAYER_PROJECT/"
cp deploy/rrelayer-horizen/docker-compose.gas-stub.yaml "$RRELAYER_PROJECT/"
```

(Path above is relative to zen-staking-layer repo root.)

### 2. Start gas sidecar

**Standalone (rrelayer runs via `rrelayer start` on host):**

```bash
cd "$RRELAYER_PROJECT"
docker compose -f docker-compose.gas-stub.yaml up -d
curl -s http://localhost:8787/2651420 | jq .
```

**Merged with existing rrelayer compose** — add `gas-stub` service to your main `docker-compose.yml` (copy from `docker-compose.gas-stub.yaml`) and attach rrelayer to the same network.

### 3. Patch `rrelayer.yaml`

Merge `rrelayer.yaml.snippet.yaml`:

- Set `gas_provider: CUSTOM` on the Horizen network (`chain_id: 2651420`)
- Add `gas_providers.custom` with:
  - `http://localhost:8787` — if rrelayer runs on **host**
  - `http://gas-stub:8787` — if rrelayer runs in **Docker** on the same compose network

Keep your existing StLighter proxy **allowlist** and `disable_native_transfer: true`.

### 4. Restart rrelayer & clear stuck txs

```bash
rrelayer start   # or docker compose restart rrelayer
```

Cancel any **PENDING** txs queued before this change (CLI/API), or nonce may block new sends.

### 5. Verify

rrelayer logs should show:

```text
Final gas price ... max_priority_fee: <non-zero>
```

Then a successful `MINED` / `CONFIRMED` after BFF gasless redeem/deposit.

Quick check:

```bash
curl -s http://localhost:8787/2651420 | jq '.fast'
curl -s -u "$RRELAYER_AUTH_USERNAME:$RRELAYER_AUTH_PASSWORD" \
  http://localhost:8000/relayers/<RELAYER_ID>
```

## Tuning

Edit `horizen-gas.json` only — no code changes. Values are Gwei strings. Testnet defaults (`fast`: 5 Gwei priority) are conservative; lower only if you confirm the chain accepts it.
