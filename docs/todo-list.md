# stLighter / ltZEN — 待办与优先级

> **用途**:可执行待办、合理偏差、优先级排序。状态快照见各专项计划,本文不重复里程碑明细。
> **最后更新**:2026-06-27
>
> | 文档 | 内容 |
> |------|------|
> | [`stLighter-execution-plan.md`](./stLighter-execution-plan.md) | 合约/测试/部署阶段 |
> | [`stLighter-frontend-plan.md`](./stLighter-frontend-plan.md) | 前端 M0–M5 里程碑 |
> | [`stLighter-frontend-design-uplift-plan.md`](./stLighter-frontend-design-uplift-plan.md) | 视觉 D1–D4 |
| [`stLighter-relayer-design.md`](./stLighter-relayer-design.md) | Relayer 分层、rrelayer 边界、BFF 校验规格 |

---

## 已完成（摘要）

- **合约**: StLighter / LtZEN、gasless(`depositWithSigAndPermit` / `redeemWithSig`)、UUPS + Timelock、OFT 脚本；**81** 单测通过。
- **前端**: `ltzen-frontend` **M0–M4**（Horizen 四页）；**Design D1–D4** 品牌 uplift。
- **Gasless 前端**: `useDeposit` / `useRedeem` + BFF `/api/relay`（P0-B encode/rrelayer 已落地；**BFF 校验 + rrelayer 联调**待完成）
- **Relayer 设计文档**: [`stLighter-relayer-design.md`](./stLighter-relayer-design.md)（rrelayer 无校验回调 → 校验在 BFF）

---

## 合理偏差（相对初版计划,可接受）

| 项 | 计划 | 实际 |
|----|------|------|
| UI 组件库 | shadcn/ui | Tailwind + `theme.ts` 自研（Design Uplift 亦禁止重型 UI 库） |
| Gasless 编排 | 独立 `useRelayer` hook | 内聚于 `useDeposit` / `useRedeem` + `createRelayer()` |
| 目录结构 | `forms/`、`bridge/` | `components/stake|redeem|transparency/` |
| M2/M3 gasless 测试网 | 纯 MockRelayer | 默认 `DirectContractRelayer`（用户钱包代发一笔 tx,验证 EIP-712） |
| 导航 | M5 完成后出现 Bridge | 导航已含 `/bridge`,页面未实现（见 P1） |

---

## 待办（按优先级）

### P0 — Gasless Redeem + Relayer 全链路（当前最高优先级）

**业务目标**: Redeem 支持 gasless meta-tx（用户只签名,relayer 代发 `redeemWithSig`,手续费从赎回 ZEN 扣除）。

**技术路线**（两阶段,须顺序完成）:

#### P0-A — 跑通 `redeemWithSig`（现有架构,测试网验收） ✅

> 2026-06-22 浏览器手动验收通过（标准 redeem + gasless redeem/deposit）。步骤见 [`gasless-acceptance.md`](./gasless-acceptance.md)。

- [x] **测试网联调**: Horizen 上 gasless redeem 全流程（`DirectContractRelayer`）
- [x] **与 deposit gasless 对称**: 费用透明 UI、toast、超时兜底
- [x] **文档**: [`gasless-acceptance.md`](./gasless-acceptance.md)
- [ ] **边界态**（可选复测）: 拒签、份额不足、`maxFeeZen` 超限、末位全额赎回

#### P0-B — 接入 [rrelayer](https://github.com/joshstevens19/rrelayer)（直至生产级 gasless 完成） 🔄 进行中

> 部署与 env 见 [`stLighter-rrelayer-setup.md`](./stLighter-rrelayer-setup.md)。  
> **架构结论**: rrelayer **不支持**自定义 payload 校验回调；EIP-712 校验在 BFF 实现 — 见 [`stLighter-relayer-design.md`](./stLighter-relayer-design.md)。

- [x] **PoC 部署**: Horizen Testnet 上 rrelayer + StLighter proxy allowlist + `disable_native_transfer`（本地已启动）
- [x] **BFF 适配层**: Next.js `POST/GET /api/relay` + `src/server/relay/*`（encode + rrelayer `sendTransaction`）
- [x] **前端切换**: `NEXT_PUBLIC_USE_RELAYER_BFF=1` → `HttpRelayer` 走同源 `/api`
- [x] **BFF 广播前校验**:
  - [x] `validate.ts`: EIP-712 `verifyTypedData` + 链上 `nonces(user)` + `deadline`
  - [x] calldata 与已验证 message / `feeZen` 一致（`metaTxContractCall` 共享 encode/simulate）
  - [x] `simulateContract` 通过后再 `broadcastContractCall`
  - [ ] 负向用例验收（见 [`gasless-acceptance.md`](./gasless-acceptance.md) P0-B）
- [x] **Horizen gas sidecar**: `deploy/rrelayer-horizen/` compose + `gas_provider: CUSTOM`（解决 `max_priority_fee: 0`）
- [x] **联调验收（redeem）**: 2026-06-27 浏览器 E2E — 用户零 gas；relayer 为 `tx.from`；[explorer tx](https://horizen-testnet.explorer.caldera.xyz/tx/0x556979f05cb88dad15e7db6ff75df3bc001e7a1321777f5e110323a2260f6acb)
- [ ] **deposit E2E** ⏸ **暂缓**：ZEN gasless 存入不纯粹（至少一次链上 `approve`）；permit/allowance 策略待与 Horizen 官方沟通；BFF encode 已就绪
- [ ] **运维**: gas 监控、API key 轮换、webhook 低余额（可选）、smoke 脚本

**P0 完成标准（当前）**: P0-A 测试网签字通过 + P0-B **redeem** rrelayer 代发闭环 + BFF 校验/simulate 上线。Deposit 真 relayer 验收随 Horizen 对齐后补。

---

### P1 — Bridge / 跨链与其它上线项

- [ ] **M5 Bridge 页**: `app/bridge/page.tsx`、`useBridge`、`BridgeForm`（`quoteSend` → `send`、自定义接收地址）
- [ ] **Bridge 导航**: 完成 M5 前,从 `nav.ts` / `BottomTabBar` 移除 `/bridge`,或加占位页避免 404
- [ ] **`depositWithPermit`**: 非 gasless 一笔存入
- [ ] **双链测试网**: Base ltZEN + `WireStLighterOFT` / DVN;Hub⇄Spoke smoke（见 [`stLighter-deploy-checklist.md`](./stLighter-deploy-checklist.md)）

### P2 — 数据与打磨

- [ ] **Goldsky 子图**: 替换 `useRateHistory` 会话采样;`HarvestHistory` 真实数据
- [ ] **M5 Base gasless 跨链**: OFT send 走 relayer 抽象（依赖 P0-B + P1）
- [ ] **ltZEN 完整 name 字符串**（产品待定）
- [ ] **安全评审定稿**: OFT peer/DVN、proxy 升级、relayer allowlist、审计 scope

### 暂缓 / 明确不做（Phase 1）

- Base 端 deposit/redeem（产品锚定 Horizen）
- Harvest keeper 链上激励（PRD Phase 1 无）

---

## 建议接续顺序

```
P0-B  负向用例 → 运维 smoke；deposit gasless E2E 待 Horizen 对齐  ← 当前
  → P1    Bridge / 双链测试网
  → P2    Goldsky / 安全评审
```

重启开发时:读 [`stLighter-relayer-design.md`](./stLighter-relayer-design.md) → [`deploy/rrelayer-horizen/`](../deploy/rrelayer-horizen/) gas 配置 → [`stLighter-rrelayer-setup.md`](./stLighter-rrelayer-setup.md) 联调。
