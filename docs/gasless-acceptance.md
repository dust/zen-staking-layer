# Gasless 手动验收记录（Horizen Testnet）

> **P0-A** — `redeemWithSig` / `depositWithSigAndPermit` 经 `DirectContractRelayer`（用户钱包代发一笔 tx）。  
> **P0-B** — 真 relayer（rrelayer + BFF）；校验规格见 [`stLighter-relayer-design.md`](./stLighter-relayer-design.md)。
> **产品策略（2026-07-18）**: 同链 vs 跨链 gasless 定义、禁止「完美 ZEN deposit gasless」宣传、跨链 Receiver 路径见 [`stLighter-crosschain-gasless-spec.md`](./stLighter-crosschain-gasless-spec.md)。下文「Gasless deposit P0-B 暂缓」仅适用于**同链**（钱包持 ZEN + approve）；**不**否定跨链 stake 经共享接收合约的 meaningful gasless deposit（规范 §2.2 / §7）。

## 状态

| 项 | 状态 | 备注 |
|----|------|------|
| 标准 redeem | ✅ | 2026-06-22 浏览器手动验收 |
| Gasless redeem | ✅ | 签名 → `DirectContractRelayer` → `redeemWithSig` |
| Gasless deposit | ✅ | 双签 → `depositWithSigAndPermit` |
| 真 relayer（零 gas） | ✅ redeem | P0-B redeem E2E ✅（2026-06-27）；deposit **暂缓**（见下） |
| BFF 广播前校验 | ✅ | `validate.ts` — EIP-712 / nonce / simulate |

## P0-A 快速路径（复测）

1. `cd ltzen-frontend && npm run dev`，连接 Horizen Testnet，`.env.local` 合约地址已填。
2. **Stake**: 领 test ZEN → 勾选 Gasless → 两次签名 + 一笔确认 tx → 见 ltZEN。
3. **Redeem**: 勾选 Gasless redeem → 一次签名 + 一笔确认 tx → ZEN 到账、ltZEN 减少。
4. Explorer 核对 tx 调用 `redeemWithSig` / `depositWithSigAndPermit`。

未配置 `NEXT_PUBLIC_RELAYER_ENDPOINTS` / `NEXT_PUBLIC_USE_RELAYER_BFF` 时，默认 `DirectContractRelayer`（用户付该笔 tx 的 gas，无单独 approve）。

## P0-B 验收（BFF + rrelayer）

### 正向

1. `.env.local` 配置 `NEXT_PUBLIC_USE_RELAYER_BFF=1` 与服务端 `RRELAYER_*`（见 setup 文档）。
2. **Gasless redeem**：仅 EIP-712 签名，无 StLighter 写入 tx 确认。
3. Explorer：`tx.from` = relayer 地址；用户 ZEN / ltZEN 与 preview 一致；`feeZen ≤ maxFeeZen`。

**已验收（2026-06-27）**

| 路径 | 结果 | Explorer |
|------|------|----------|
| Gasless redeem | ✅ | [0x5569…0f6acb](https://horizen-testnet.explorer.caldera.xyz/tx/0x556979f05cb88dad15e7db6ff75df3bc001e7a1321777f5e110323a2260f6acb) — `from` = relayer `0x696e…06a6`，`to` = StLighter proxy |

Gas sidecar：`deploy/rrelayer-horizen/` + `gas_provider: CUSTOM`（解决 Horizen `max_priority_fee: 0`）。

### Gasless deposit（P0-B 暂缓 — 同链路径）

**暂缓原因（同链）**：ZEN 无 EIP-2612，gasless **不纯粹**——即使用 `depositWithSigAndPermit`，用户仍可能至少需要 **一次链上 `approve`**（ZEN token 对 StLighter 的 allowance）。产品上不得宣传为完美 gasless；策略见 [`stLighter-crosschain-gasless-spec.md`](./stLighter-crosschain-gasless-spec.md) §2.1 / §6。

**跨链路径不在本暂缓范围内**：Base→Horizen 入金打入共享 Receiver 后再 `depositWithSig*`（强制 relayer）是规范选定的绕过方式；验收用例待 M1/M2 落地后另增章节。

| 路径 | P0-B 状态 | 备注 |
|------|-----------|------|
| Gasless redeem | ✅ E2E | 用户零 gas，relayer 代发 |
| Gasless deposit | ⏸ 暂缓 | BFF encode 已实现；浏览器 E2E 与产品策略待定 |

P0-A 下 gasless deposit（`DirectContractRelayer`，用户代发一笔 tx）仍可复测；真 relayer 路径验收等 Horizen 对齐后恢复。

### 负向（BFF 校验实现后必测）

以下请求应对 `POST /api/relay` 返回 **400**，且 relayer 地址**无**对应 revert tx（未消耗 relayer gas）：

| 用例 | 操作 |
|------|------|
| 错误签名 | 篡改 `signature` 或 `amount` 与签名不一致 |
| 过期 deadline | `deadline` 早于当前区块时间 |
| 错误 nonce | 使用已消耗或过期的 nonce |
| 错误合约 | `verifyingContract` 非配置的 StLighter proxy |
| 份额/余额不足 | redeem 份额大于 ltZEN 余额 |
| 错误 chainId | `chainId` ≠ Horizen hub |

可选复测（P0-A 同样适用）：拒签、末位全额赎回、`maxFeeZen` 过低导致 fee 为 0 等边界。

## 成本导向费用（`stLighter-gasless-fee-spec.md`）

前置：`.env.local` 配置 `ZEN_PER_ETH_FLOOR=450e18`、`PRICE_PROVIDER=aerodrome`；BFF 开启。  
离线复测成本量级：`npx tsx scripts/calibrate-fee.ts`（期望 bridge `feeZen` ≈ 0.01–0.02 ZEN，L3-only ≪ 0.001 ZEN）。

| 用例 | 期望 | 状态 |
|------|------|------|
| 签名前展示 | Redeem / Cross-chain stake / Redeem-to-Base 显示 est + max / 净值 | [x] 主网 E2E 2026-07-29 |
| `GET /api/relay/fee-quote` | 返回 breakdown；`rateSource` live 或 floor | [x] 引擎 + 主网 bridge quote |
| 小额 | `amount_too_small` / UI 禁用提交 | [ ] 可选 |
| quote stale | 签名后费用上涨 → `409 fee_quote_stale`，可重签 | [x] 单测 `assertSignedMaxCoversFee`；浏览器故意抬价可选 |
| floor | 断价源或拔 RPC 时 `rateSource=floor` + UI 提示 | [ ] 可选 |
| `FEE_PROFIT_BPS>0` | fee ≥ max(cost, basis×bps)；UI「含服务费」 | [x] 单测 |
| withdraw* | max/fee 为 0 | [x] 单测 |
| bridge 腿 | `feeZen` 含 LZ；relayer 付 `msg.value`；dusty amount 可过 | [x] 主网 E2E |

### 主网 E2E（2026-07-29）— Wave B `bridgeToBase`（成本导向 fee）

| 项 | 值 |
|----|-----|
| Tx | [`0x3973…beb2`](https://horizen.calderaexplorer.xyz/tx/0x3973e302afe96c27f11b429f0980045cc1d64aa08380c19a448fe753bdb9beb2) |
| `from`（relayer） | `0x250b24259C714B681616f13a23014914e5bD8A83` |
| `to` | EgressStation `0xc849…45D9` |
| Method | `bridgeToBase`（selector `0xdf572015`） |
| `assets` | ≈ 20.002 ZEN（含 OFT dust 余数） |
| `feeZen` / `maxFeeZen` | ≈ **0.0150 / 0.0173 ZEN**（成本导向，≪ 10 硬顶） |
| `msg.value` | ≈ **2.97e-5 ETH**（LZ native） |
| Status | success；`gasUsed` ≈ 519k |
