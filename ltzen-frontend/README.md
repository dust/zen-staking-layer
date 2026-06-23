# ltZEN dApp (ltzen-frontend)

Frontend for **stLighter / ltZEN** liquid staking. Multi-chain, chain-aware:
**Horizen Testnet** (hub — deposit / redeem / exchange-rate / transparency) and
**Base** (spoke — ltZEN OFT circulation + gasless only). See
[`../docs/stLighter-frontend-plan.md`](../docs/stLighter-frontend-plan.md) for the full plan.

Stack: Next.js 16 (App Router) · wagmi v3 / viem · RainbowKit · TanStack Query · Tailwind v4.

## Getting started

```bash
npm install
cp env.local.example .env.local    # then fill in the values (see below)
npm run dev                        # http://localhost:3000
```

### Required env

All vars are `NEXT_PUBLIC_*` and grouped by chain in `.env.local.example`. The app boots with
sensible testnet defaults; two things you actually need to set:

- `NEXT_PUBLIC_WC_PROJECT_ID` — WalletConnect Cloud projectId (https://cloud.reown.com).
  Without it, wallet connect won't initialize (build still passes via a placeholder).
- Contract addresses (`NEXT_PUBLIC_HORIZEN_*_ADDRESS`, `NEXT_PUBLIC_BASE_LTZEN_ADDRESS`) —
  bind to **proxy** addresses. Until filled, the UI shows a "not configured" state rather than
  crashing.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build (M0 acceptance gate)
npm run lint       # eslint
npm run sync-abi   # copy StLighter.json / LtZEN.json from repo-root abi/ into src/abi/
```

## Layout (current — M0)

```
src/
  config/   chains.ts · wagmi.ts · contracts.ts · relayer.ts
  lib/      chainGating.ts   (uiux-spec §6.1 action matrix)
  app/      layout.tsx · providers.tsx · page.tsx
  components/layout/  Header · ChainSwitcher · WalletButton
  abi/      synced from ../abi (do not hand-edit)
```

## Notes

- ABIs are synced from the repo root `abi/` — run `npm run sync-abi` after contracts regenerate.
- `horizenTestnet` (chainId 2651420) ships in viem; we wrap it with `defineChain` to inject the
  env RPC/explorer. Base is fully env-driven and defaults to Base Sepolia until configured.
