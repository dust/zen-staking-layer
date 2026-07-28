# stLighter Gasless — rrelayer 接入指南（P0-B）

> [rrelayer](https://github.com/joshstevens19/rrelayer) 须在**服务端**调用（API key / basic auth），不可暴露给浏览器。  
> 本仓库采用 **Next.js BFF**（`ltzen-frontend/src/app/api/relay`）转发 meta-tx → rrelayer 代发链上交易。
>
> **架构与校验设计**（rrelayer 能力边界、BFF 广播前校验清单）见 **[`stLighter-relayer-design.md`](./stLighter-relayer-design.md)**。

## 架构

```
浏览器 (useDeposit / useRedeem)
  → EIP-712 签名 (+ ZEN permit for deposit)
  → HttpRelayer → POST /api/relay
       → validateRelayRequest   ← BFF 业务校验（EIP-712 / nonce / simulate）
       → encode depositWithSigAndPermit | redeemWithSig
       → rrelayer transaction.send (relayer 付 gas)
       → 从存入/赎回额扣 feeZen (≤ maxFeeZen)
  → GET /api/relay/{id} 轮询状态
```

**要点**: rrelayer **不提供**自定义 payload 校验回调；allowlist 仅限制 `to` 地址。EIP-712 语义校验在 BFF 完成，详见设计文档 §3–§4。

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
- 建议 **`disable_native_transfer: true`**（防 relayer 被滥用转原生币）
- 配置 API key 或 basic auth；可选 rate_limits、webhooks（低余额 / tx 失败监控）

启动：

```bash
rrelayer start
# 默认 http://localhost:8000 — 见项目 .env
```

文档：[rrelayer.xyz/getting-started](https://rrelayer.xyz/getting-started/installation) · [Node SDK](https://rrelayer.xyz/integration/sdk/installation/node)

## 2. 配置 ltzen-frontend

### 生产（推荐）：统一 Docker 编排

见 **[`deploy/README.md`](../deploy/README.md)**。`ltzen-frontend` 与 `rrelayer` 同 compose；BFF 经内网访问 `http://rrelayer:8000`，**不**再使用 Vercel，也**不**对外暴露 rrelayer。

```bash
cd deploy
cp .env.example .env   # 填入 NEXT_PUBLIC_*、RRELAYER_*、mnemonic 等
make release
```

### 本地开发 `.env.local`

服务端变量（**不要**加 `NEXT_PUBLIC_`，API key 勿进浏览器）：

```bash
# 启用 BFF（浏览器走 /api/relay，不直连 rrelayer）
NEXT_PUBLIC_USE_RELAYER_BFF=1

# rrelayer（仅服务端）
# 本地直连: http://localhost:8000
# compose 内: http://rrelayer:8000（由 deploy/docker-compose.yml 注入）
RRELAYER_SERVER_URL=http://localhost:8000
RRELAYER_RELAYER_ID=<uuid-from-rrelayer-list>
RRELAYER_API_KEY=<api-key>

# 可选：成本导向 gasless 费用（见 docs/stLighter-gasless-fee-spec.md）
# RELAYER_FEE_BPS 已废弃（勿作主定价）
PRICE_PROVIDER=aerodrome
BASE_PRICE_RPC_URL=https://mainnet.base.org
ZEN_PER_ETH_FLOOR=
FEE_BUFFER_BPS=1500
FEE_MARGIN_BPS=0
FEE_PROFIT_BPS=0
```

Horizen 合约地址继续用现有 `NEXT_PUBLIC_HORIZEN_*`（BFF 读取 StLighter proxy）。

## 3. 验收（真 gasless）

1. `npm run dev`，**不要**再让用户确认 StLighter 写入 tx（仅钱包签名 EIP-712）。
2. **Gasless redeem** 成功，relayer 地址在 explorer 上为 `tx.from`。
3. 用户 ZEN / ltZEN 余额与 preview 一致；`feeZen` ≤ 签名内 `maxFeeZen`。
4. **Gasless deposit**（P0-B）：**暂缓** — ZEN 存入即使用 permit 路径，用户仍可能需至少一次链上 `approve`；与 Horizen 官方对齐 allowance/permit 策略后再做 E2E。BFF 已编码 `depositWithSigAndPermit`，redeem 路径已验收。
5. **负向用例**（BFF 校验）: 篡改 `amount`/错误签名/过期 `deadline` → 400，relayer 无 revert tx。见 [`gasless-acceptance.md`](./gasless-acceptance.md)。

## 4. 运维备忘

- 监控 relayer 钱包原生 gas 余额（webhook `low_balance` 可选）
- 轮换 `RRELAYER_API_KEY`
- 生产：统一 `deploy/` compose；外层 nginx（`staking.lighter.im`）→ frontend BFF → 内网 rrelayer；勿公网暴露 `:8000`
- **禁止**将 rrelayer API key 暴露给浏览器；所有 meta-tx 须经 BFF 校验层
- basic auth 仅用于 VPS/CLI 管理；BFF 使用 scoped API key

## 5. 调试日志（联调）

开发模式（`npm run dev`）默认在 **Next.js 终端**输出 `[relay-bff]` 日志；浏览器 Console 输出 `[relay-client]`。

| 变量 | 作用 |
|------|------|
| `RELAY_DEBUG=1` | 服务端详细日志（含每次 `GET /api/relay/{id}` 轮询） |
| `NEXT_PUBLIC_RELAY_DEBUG=1` | 浏览器端 `[relay-client]`（生产也可开） |

**定位 rrelayer 无 tx 日志时**，按 Next 终端顺序核对：

1. `POST /api/relay received` — 浏览器是否打到 BFF
2. `validate: simulate ok` — 校验是否通过（此前 `GET /relayers/{id}` 可能仅来自 init/simulate）
3. `broadcastContractCall: relayer.transaction.send` — 应出现 rrelayer 侧 `POST .../transactions/relayers/.../send`
4. `broadcastContractCall: rrelayer accepted` — 返回 `rrelayerTxId` + `hash`
5. `job updated status: failed` — 若失败，看 `error`（旧版 SDK + basic auth 曾误报 `User rejected`，因 `getRelayerClient()` 硬编码 `providerUrl: "TODO"`；BFF 已改用 `relayer.transaction.send` 直连 API）

浏览器 Console 同时看 `[relay-client] poll tick` 的 `serverStatus` / `error`。

## 6. Horizen Gas 配置（必读）

### 症状

rrelayer 日志循环报错：

```text
Send transaction error: ... gas tip cap 0, minimum needed 1
Final gas price ... max_fee: 302, max_priority_fee: 0
```

BFF 已收到 `rrelayer accepted`，但 tx **永远不会上链**；`waitForRrelayerTx` 最终会失败（不再无限 hang）。

### 原因

Horizen Testnet RPC **拒绝** `max_priority_fee_per_gas = 0` 的 EIP-1559 交易。rrelayer 默认 **FALLBACK** gas 估算对该链常返回 `priority fee = 0`。

### 修复：CUSTOM gas provider（compose + 静态 JSON）

**推荐**：统一 `deploy/` compose 里由 `gas-stub` 提供静态 gas JSON（`:8787` 仅内网）。公网 TLS 由内网另一台 nginx 终结 `https://staking.lighter.im`，再反代到本栈宿主机 `:6000`（容器内 frontend 仍为 `:3000`）。

本仓库参考文件：**[`deploy/`](../deploy/)**（`docker-compose.yml`、`nginx/gas.conf`、`rrelayer/`）。

```bash
cd deploy && make release
# rrelayer.yaml: gas_providers.custom.endpoint = http://gas-stub:8787
```

若有卡在 PENDING 的 tx，在 rrelayer CLI/API 中 cancel，避免 nonce 阻塞。

验证：rrelayer 日志应显示 `max_priority_fee` **> 0**，且出现 `MINED` / `CONFIRMED`。