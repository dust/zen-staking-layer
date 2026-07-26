# ltZEN self-hosted stack

Single `docker-compose.yml` runs **ltzen-frontend** (Next.js + BFF) and **rrelayer** (Postgres + CUSTOM gas).

TLS for **https://staking.lighter.im** is terminated by a **separate** nginx on the LAN (not in this compose). That edge proxies to this stack’s frontend port.

```text
Browser
  → https://staking.lighter.im     (other nginx — TLS)
      → http://127.0.0.1:6000      (or LAN host:FRONTEND_PORT → ltzen-frontend)
          → http://rrelayer:8000   (compose network only — not public)
              → postgresql:5432
              → http://gas-stub:8787  (Horizen gas JSON)
```

This compose does **not** listen on `:80` / `:443`.

Legacy notes under [`rrelayer-horizen/`](./rrelayer-horizen/) are deprecated.

## Layout

| Path | Role |
|------|------|
| `docker-compose.yml` | postgresql, gas-stub, rrelayer, frontend |
| `Makefile` | `build` / `up` / `release` / `force-recreate` / … |
| `.env.example` | Secrets + `NEXT_PUBLIC_*` build args |
| `nginx/gas.conf` | Internal CUSTOM gas `:8787` only |
| `nginx/staking.lighter.im.example.conf` | Snippet for the *external* edge nginx |
| `rrelayer/` | `rrelayer.yaml` + `horizen-gas.json` |

## Quick start

```bash
cd deploy
cp .env.example .env && chmod 600 .env
# fill mnemonic, postgres, WC project id, contract addresses, API key, etc.

make release
curl -sS http://127.0.0.1:6000/   # frontend (before edge nginx)
```

Point the LAN edge nginx at `http://127.0.0.1:6000` (same host) or `http://<host>:6000` (set `FRONTEND_BIND=0.0.0.0`). See `nginx/staking.lighter.im.example.conf`.

## Make targets

| Target | What it does |
|--------|----------------|
| `make env` | Create `.env` from example if missing |
| `make build` | `docker compose build frontend` |
| `make pull` | Pull upstream images (postgres/nginx/rrelayer) |
| `make up` | `docker compose up -d` |
| `make release` | **Ship**: `build` then `up -d --force-recreate` |
| `make force-recreate` | Recreate containers (`BUILD=1` to also rebuild) |
| `make down` | Stop and remove containers |
| `make logs` / `logs-frontend` / `logs-rrelayer` | Tail logs |
| `make gen-api-key` | `rrelayer auth gen-api-key` via Docker |
| `make ps` | Compose status |

Examples:

```bash
make release                 # normal deploy after config/code change
make force-recreate          # recreate only (config/env change, same image)
make force-recreate BUILD=1  # rebuild + recreate
make logs-rrelayer
```

## API key (rrelayer)

1. Create relayer (admin basic auth) on the compose network:

```bash
docker run --rm --network ltzen_default curlimages/curl:8.5.0 \
  -u "$RRELAYER_AUTH_USERNAME:$RRELAYER_AUTH_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"name":"relayer_horizen"}' \
  http://rrelayer:8000/relayers/2651420/new
```

2. `make gen-api-key` → paste into `.env` as `RRELAYER_API_KEY`
3. Set `RRELAYER_EOA_ADDRESS` (0x from create) and `RRELAYER_RELAYER_ID` (uuid)
4. `make force-recreate` so rrelayer reloads yaml/env

BFF uses `RRELAYER_SERVER_URL=http://rrelayer:8000` (default in compose).

## Security

- This stack should not publish `:80` / `:443` / `:8000` / Postgres / `:8787`
- Frontend publish defaults to `127.0.0.1:6000` (same-host edge only); use `FRONTEND_BIND=0.0.0.0` only on a trusted LAN
- Keep mnemonic + API key in `.env` (`chmod 600`); never in the browser
- `NEXT_PUBLIC_*` are baked at **image build** — change them → `make release`

## Local frontend without Docker

Still supported: `cd ltzen-frontend && npm run dev` with `.env.local`. Point `RRELAYER_SERVER_URL` at a reachable rrelayer, or rely on DirectContractRelayer when BFF is off.
