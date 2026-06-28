# stLighter Gasless Relayer — 架构与校验设计

> **用途**: relayer 分层职责、rrelayer 能力边界、BFF 广播前校验规格。实现前以本文 + [`stLighter-rrelayer-setup.md`](./stLighter-rrelayer-setup.md) 为准。
> **关联**: [`stLighter-PRD.md`](./stLighter-PRD.md) §6、`todo-list.md` §P0-B、`ltzen-frontend/src/server/relay/`
> **最后更新**: 2026-06-27

---

## 1. 结论摘要

| 问题 | 结论 |
|------|------|
| rrelayer 是否支持自定义 payload 校验回调 / 插件？ | **不支持**。无 middleware、无「校验通过才广播」的 webhook gate。 |
| EIP-712 gasless 业务校验应放在哪？ | **Next.js BFF**（`POST /api/relay` → `queueRelay`），在调用 rrelayer **之前**。 |
| rrelayer 提供什么安全能力？ | allowlist（`to` 地址）、权限开关、API key、rate limit；webhooks 为**事后**通知。 |
| 合约是否仍要校验？ | **是**。BFF 校验用于省 relayer gas、改善 UX；链上 `StLighter` 仍是最终权威。 |

**原则**: 所有生产流量必须经 BFF；rrelayer API key 仅服务端持有；禁止浏览器直连 rrelayer。

---

## 2. 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│ 浏览器                                                           │
│  useDeposit / useRedeem → EIP-712 (+ ZEN permit) 签名            │
│  HttpRelayer → POST /api/relay                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ BFF（ltzen-frontend/src/server/relay/）  ← 业务校验层              │
│  1. assertRequest（chainId / verifyingContract / 格式）           │
│  2. validateRelayRequest（EIP-712、nonce、deadline、余额）  【待实现】│
│  3. computeFeeZen + encodeMetaTx                                 │
│  4. simulateContract（可选但推荐）                         【待实现】│
│  5. broadcastContractCall → rrelayer                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ rrelayer（基础设施）                                              │
│  代付原生 gas · nonce 管理 · allowlist(to) · 限流 · 交易队列       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ StLighter（链上最终约束）                                         │
│  签名 / nonce / deadline / fee ≤ maxFeeZen / 余额与会计           │
└─────────────────────────────────────────────────────────────────┘
```

前端仍只依赖 `RelayRequest` / `RelayResult`（`src/relayer/types.ts`）；rrelayer 与校验细节不泄漏到 UI。

---

## 3. rrelayer 能力边界（官方模型）

基于 [rrelayer 文档](https://rrelayer.xyz) 与 `rrelayer.yaml` 配置模型：

| 能力 | 校验粒度 | 对 stLighter 的作用 |
|------|----------|---------------------|
| **allowlist** | 交易 `to` 必须在列表内 | 仅允许调用 StLighter **proxy**；无法区分 calldata / 函数 |
| **permissions** | `disable_transactions` / `disable_native_transfer` / `disable_typed_data_sign` 等 | 防止 relayer 被滥用转原生币或乱签名 |
| **rate_limits** | 按 relayer / 全局 QPS | 防 spam、保护 gas 钱包 |
| **API keys** | 鉴权 + 权限范围 | 密钥仅 BFF 持有 |
| **webhooks** | `transaction_queued` / `sent` / `failed` 等 POST 通知 | **监控与告警**，非广播前 gate |

**明确不支持**:

- 自定义 WASM / 脚本 / HTTP 回调在广播前拦截交易
- 按 function selector、EIP-712 字段、签名恢复地址做配置化规则
- 同步「webhook 返回 403 则拒绝广播」语义（webhook 为异步、事后）

因此 **StLighter 的 EIP-712 语义校验必须在 BFF 自研**（viem + 链上 `readContract` / `simulateContract`）。

---

## 4. BFF 广播前校验规格

实现文件: `ltzen-frontend/src/server/relay/validate.ts`，由 `submit.ts` 的 `queueRelay` 在 `encodeMetaTx` 之前调用（校验通过后再 encode + 异步 broadcast）。

### 4.1 请求级（已有 + 扩展）

| 检查项 | 说明 | 现状 |
|--------|------|------|
| `chainId` | 必须等于 Horizen hub（`2651420`） | ✅ `assertRequest` |
| `verifyingContract` | 必须等于 env 配置的 StLighter proxy | ✅ `assertRequest` |
| `kind` | 仅 `depositWithSigAndPermit` \| `redeemWithSig` | 部分（encode 抛错） |
| `signature` | `0x` 前缀、长度合法 | ✅ 浅检查 |
| `amount` / `maxFeeZen` | 正整数字符串、可解析为 `bigint` | ✅ |
| `deadline` | `deadline >= block.timestamp`（链上时间） | ✅ |
| `permit` | deposit 路径必填；`v/r/s/deadline` 合法 | ✅ |

### 4.2 EIP-712 签名校验

与 `StLighter.sol` typehash 对齐:

```
DepositWithSig(uint256 assets,address receiver,uint256 maxFeeZen,address user,uint256 nonce,uint256 deadline)
RedeemWithSig(uint256 shares,address receiver,uint256 maxFeeZen,address user,uint256 nonce,uint256 deadline)
```

Domain: `{ name: "stLighter", version: "1", chainId, verifyingContract }`

| 检查项 | 说明 |
|--------|------|
| `verifyTypedData` | 恢复地址 === `req.user` |
| message 字段 | 与 `req` 中 `amount`、`receiver`、`maxFeeZen`、`user`、`deadline` 一致 |
| **nonce** | message 内 nonce === 链上 `nonces(user)`（`readContract`） |

> nonce 在签名时由前端读取；BFF 必须再次核对，防止重放或签名与请求体不一致。

### 4.3 Relayer 侧参数（BFF 选定、不在用户签名内）

| 检查项 | 说明 |
|--------|------|
| `feeZen` | `computeFeeZen` 结果 ≤ `maxFeeZen`；≤ `MAX_GAS_FEE_ZEN`（链上常量，可选 read） |
| `feeZen < basis` | deposit: `feeZen < assets`；redeem: `feeZen < previewRedeem(shares)` |
| calldata 一致性 | `encodeMetaTx(req, feeZen)` 的参数与已验证的 EIP-712 message + 选定 `feeZen` 一致 |

### 4.4 链上状态（可选但建议）

| 路径 | 检查 |
|------|------|
| deposit | ZEN `balanceOf(user) >= assets`（permit 路径可依赖 simulate） |
| redeem | ltZEN `balanceOf(user) >= shares` |
| 协议 | `paused()` 为 false（deposit 路径） |

### 4.5 模拟执行（强烈推荐）

```typescript
await publicClient.simulateContract({
  address: verifyingContract,
  abi: StLighterAbi,
  functionName: kind === "redeemWithSig" ? "redeemWithSig" : "depositWithSigAndPermit",
  args: /* encodeMetaTx 同款 args */,
  account: relayerAddress, // rrelayer 钱包地址
});
```

模拟失败 → HTTP 400，**不**调用 rrelayer，避免浪费 relayer 原生 gas。

rrelayer 官方 viem 集成亦推荐 **simulate → write** 模式；simulate 属于应用层，不在 rrelayer 进程内。

### 4.6 错误响应约定

| 场景 | HTTP | 前端行为 |
|------|------|----------|
| 校验失败 | 400 + `{ error: "..." }` | 展示错误，不进入 relaying |
| rrelayer 未配置 | 503 | 提示运维 |
| 模拟 revert | 400（附 revert reason 若可读） | 同校验失败 |

---

## 5. 防御纵深（rrelayer 配置）

与 BFF 校验互补，在 `rrelayer.yaml` 中:

- **allowlist**: 仅 StLighter proxy 地址
- **`disable_native_transfer: true`**: relayer 不可被用来转原生 gas 给他人
- **rate_limits**: 按 BFF 出口或 per-key 限流
- **webhooks**（可选）: 低余额告警、`transaction_failed` 监控；**不**替代 BFF 校验

---

## 6. 实现计划

| 步骤 | 任务 | 状态 |
|------|------|------|
| 1 | `validate.ts` — EIP-712 + nonce + deadline + fee + simulate | ✅ |
| 2 | 接入 `queueRelay` | ✅ |
| 3 | 负向用例验收 | ⏳ 浏览器 / curl |
| 4 | rrelayer 实例联调 + allowlist 复核 | ⏳ |
| 5 | 更新 `gasless-acceptance.md` P0-B | ⏳ |

**P0-B 完成标准**（更新）:

1. P0-A 测试网签字通过（DirectContractRelayer）
2. rrelayer 代发且用户零 gas
3. **BFF 校验 + simulate 上线**；负向请求不消耗 relayer gas
4. deposit + redeem 双路径闭环

---

## 7. 与 PRD / 无许可 relayer 的关系

PRD §6.1 约定 **无许可 relayer**：任何人可凭有效用户签名代发。本设计 **不** 在链上绑定单一 relayer，而是:

- **运营 relayer**（rrelayer + BFF）: 我们控制的 BFF 做完整校验后再广播
- **第三方 relayer**: 仍可直连合约调用 `*WithSig`（用户签名有效即可）；合约约束不变
- **用户自办**: `DirectContractRelayer` 或自行发 tx

BFF 校验保护的是 **我们运营的 rrelayer 钱包 gas**，不改变协议的无许可性质。

---

## 8. 文件索引

```
ltzen-frontend/src/
  app/api/relay/route.ts       # POST 入口
  server/relay/
    submit.ts                  # queueRelay 编排
    encode.ts                  # calldata
    validate.ts                # 广播前校验（EIP-712 / simulate）
    rrelayer.ts                # broadcastContractCall
    config.ts / fee.ts / jobs.ts
  relayer/types.ts             # RelayRequest（前端 ↔ BFF 契约）
docs/
  stLighter-relayer-design.md  # 本文件
  stLighter-rrelayer-setup.md  # 部署与 env
  gasless-acceptance.md        # 验收步骤
  todo-list.md                 # P0-B 任务跟踪
```
