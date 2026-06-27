# stLighter Gasless — rrelayer 接入指南（P0-B）

> [rrelayer](https://github.com/joshstevens19/rrelayer) 须在**服务端**调用（API key / basic auth），不可暴露给浏览器。  
> 本仓库采用 **Next.js BFF**（`ltzen-frontend/src/app/api/relay`）转发 meta-tx → rrelayer 代发链上交易。

## 架构

```
浏览器 (useDeposit / useRedeem)
  → EIP-712 签名
  → HttpRelayer → POST /api/relay
       → encode depositWithSigAndPermit | redeemWithSig
       → rrelayer walletClient.writeContract (relayer 付 gas)
       → 从存入/赎回额扣 feeZen (≤ maxFeeZen)
  → GET /api/relay/{id} 轮询状态
```

前端仍只依赖 `RelayRequest` / `RelayResult` 抽象；rrelayer 细节仅在 BFF + `src/server/relay/`。

## 1. 部署 rrelayer（Horizen Testnet）

```bash
curl -L https://rrelayer.xyz/install.sh | bash
cd /path/to/relayer-project
rrelayer new   # 交互创建项目
```

在 `rrelayer.yaml` 中：

- 添加 Horizen Testnet RPC（chain id `2651420`）
- 创建 relayer 钱包并充值原生 gas
- **allowlist** StLighter **proxy** 地址（`depositWithSigAndPermit` / `redeemWithSig`）
- 配置 API key 或 basic auth

启动：

```bash
rrelayer start
# 默认 http://localhost:8000 — 见项目 .env
```

文档：[rrelayer.xyz/getting-started](https://rrelayer.xyz/getting-started/installation) · [Node SDK](https://rrelayer.xyz/integration/sdk/installation/node)

## 2. 配置 ltzen-frontend

`.env.local`（服务端变量**不要**加 `NEXT_PUBLIC_`）：

```bash
# 启用 BFF（浏览器走 /api/relay，不直连 rrelayer）
NEXT_PUBLIC_USE_RELAYER_BFF=1

# rrelayer（仅服务端）
RRELAYER_SERVER_URL=http://localhost:8000
RRELAYER_RELAYER_ID=<uuid-from-rrelayer-list>
RRELAYER_API_KEY=<api-key>          # 或 RRELAYER_AUTH_USERNAME + RRELAYER_AUTH_PASSWORD

# 可选：relayer 收取的 ZEN 手续费（bps，默认 50 = 0.5%）
RELAYER_FEE_BPS=50
```

Horizen 合约地址继续用现有 `NEXT_PUBLIC_HORIZEN_*`（BFF 读取 StLighter proxy）。

## 3. 验收（真 gasless）

1. `npm run dev`，**不要**再让用户确认 StLighter 写入 tx（仅钱包签名 EIP-712）。
2. Gasless redeem / deposit 成功，relayer 地址在 explorer 上为 `tx.from`。
3. 用户 ZEN / ltZEN 余额与 preview 一致；`feeZen` ≤ 签名内 `maxFeeZen`。

## 4. 运维备忘

- 监控 relayer 钱包原生 gas 余额
- 轮换 `RRELAYER_API_KEY`
- 生产：BFF 与 rrelayer 分网络部署；Horizen RPC 与 allowlist 复核
