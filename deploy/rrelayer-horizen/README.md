# DEPRECATED (production)

Prefer the unified stack in the parent folder: [`../README.md`](../README.md).

## Local docker (this folder)

HTTP-only: postgres + dynamic gas-stub + rrelayer (no TLS / nginx).

```bash
cd deploy/rrelayer-horizen
docker compose up -d --build
curl -sS http://127.0.0.1:8787/2651420   # gas ~0.001 Gwei
# rrelayer API: http://127.0.0.1:8000
```

`rrelayer.yaml` CUSTOM gas → `http://gas-stub:8787`.
