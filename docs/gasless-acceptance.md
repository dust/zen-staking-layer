# Gasless 手动验收记录（Horizen Testnet）

> **P0-A** — `redeemWithSig` / `depositWithSigAndPermit` 经 `DirectContractRelayer`（用户钱包代发一笔 tx）。

## 状态

| 项 | 状态 | 备注 |
|----|------|------|
| 标准 redeem | ✅ | 2026-06-22 浏览器手动验收 |
| Gasless redeem | ✅ | 签名 → `DirectContractRelayer` → `redeemWithSig` |
| Gasless deposit | ✅ | 双签 → `depositWithSigAndPermit` |
| 真 relayer（零 gas） | ⏳ | P0-B — [`stLighter-rrelayer-setup.md`](./stLighter-rrelayer-setup.md) |

## 快速路径（复测）

1. `cd ltzen-frontend && npm run dev`，连接 Horizen Testnet，`.env.local` 合约地址已填。
2. **Stake**: 领 test ZEN → 勾选 Gasless → 两次签名 + 一笔确认 tx → 见 ltZEN。
3. **Redeem**: 勾选 Gasless redeem → 一次签名 + 一笔确认 tx → ZEN 到账、ltZEN 减少。
4. Explorer 核对 tx 调用 `redeemWithSig` / `depositWithSigAndPermit`。

未配置 `NEXT_PUBLIC_RELAYER_ENDPOINTS` / `NEXT_PUBLIC_USE_RELAYER_BFF` 时，默认 `DirectContractRelayer`（用户付该笔 tx 的 gas，无单独 approve）。
