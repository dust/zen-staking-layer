# DEPRECATED

This directory is **no longer the supported deploy path**.

The self-hosted stack (frontend + rrelayer + postgres + nginx) now lives in the parent folder:

- **[`../README.md`](../README.md)** — architecture + Make targets  
- **[`../docker-compose.yml`](../docker-compose.yml)** — unified compose  
- **[`../rrelayer/`](../rrelayer/)** — `rrelayer.yaml` + gas JSON  

Previous model (Vercel BFF → public `https://rrelayer.lighter.im` on a separate VPS) is abandoned. Do not start the compose files in this folder for new deployments.
