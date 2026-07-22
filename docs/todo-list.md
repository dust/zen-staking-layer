# stLighter / ltZEN — 待办与优先级

> **用途**:可执行待办、合理偏差、优先级排序。状态快照见各专项计划,本文不重复里程碑明细。
> **最后更新**:2026-07-22
>
> | 文档 | 内容 |
> |------|------|
> | [`stLighter-execution-plan.md`](./stLighter-execution-plan.md) | 合约/测试/部署阶段 |
> | [`stLighter-frontend-plan.md`](./stLighter-frontend-plan.md) | 前端 M0–M5 里程碑 |
> | [`stLighter-frontend-design-uplift-plan.md`](./stLighter-frontend-design-uplift-plan.md) | 视觉 D1–D4 |
> | [`stLighter-relayer-design.md`](./stLighter-relayer-design.md) | Relayer 分层、rrelayer 边界、BFF 校验规格 |
> | [`stLighter-crosschain-gasless-spec.md`](./stLighter-crosschain-gasless-spec.md) | 跨链 + gasless 产品权威 |
> | [`stLighter-station-design.md`](./stLighter-station-design.md) | Inbound/Egress Station 需求 |
> | [`stLighter-station-compose-adr.md`](./stLighter-station-compose-adr.md) | S5 compose / bridge ADR（payload、auth） |

---

## 当前工作进度快照（2026-07-22）

### 跨链 Station — P0 / S1–S2 ✅ 合约落地

产品与实现已锁定并编码（详见 station-design / impl-plan）：

| 锁定项 | 结论 |
|--------|------|
| Station 升级 | **非 UUPS**；Ownable2Step + Pausable + ReentrancyGuard + EIP712 + Nonces |
| Compose | **`lzCompose`**（`ILayerZeroComposer`）仅 credit；payload v1 + owner EIP-712；`composeCaller` + `zenOft` |
| Stake | **`StLighter.depositWithSig(..., payer=InboundStation)`** → `payForDeposit`；**无** `forceApprove` / `stakeToStLighter` |
| Nonce | Station（credit/withdraw）与 StLighter（deposit）**分离** |
| `depositWithSig` | **Breaking typehash**：增加 `payer`；`AndPermit` 要求 `payer == user` |
| Egress | `creditFromRedeem`（float 防抢）→ 另 tx `bridgeToBase`；仅 Station 调 `IStationBridge`；refund → 原 owner `credited` |

**已提交代码路径**:

- `src/stlighter/station/{InboundStation,EgressStation,ZenOftStationBridge,StationAccounting,IStationDepositPayer,IStationBridge}.sol`
- `src/stlighter/station/libraries/StationComposePayload.sol`
- `docs/stLighter-station-compose-adr.md`
- `src/stlighter/StLighter.sol`（`payer`）
- `test/stlighter/station/*`（**30** passed）+ Gasless（9 passed）
- 前端 EIP-712 / encode / validate / ABI sync（同链 `payer = user`）
- `AUDIT_DELTA.md` 已记 Station + `payer`；合并冲突已解

**未做（下一棒）**:

- [x] **S2 / P1**: `EgressStation`（`creditFromRedeem` + `bridgeToBase` + Mock refund/complete）
- [x] **S5a**: `ILayerZeroComposer.lzCompose` + payload ADR（[`stLighter-station-compose-adr.md`](./stLighter-station-compose-adr.md)）
- [x] **S5b**: `ZenOftStationBridge`（替换生产路径上的 Mock；Mock 仍保留单测）
- [ ] BFF / 前端半编排向导（跨链 stake + Redeem to Base）

### 与既有 Composer 的关系（备忘）

`chain-tools` 的 `BusStop` / `RefuelComposer` 实现同一 LZ 接口 `ILayerZeroComposer`；ZEN Base→Horizen 走 **ZenTokenOFT（原生 OFT）**，不是 Stargate 池，但 **compose 握手相同**。业务上 **BusStop（credit → 另步放行）** 最接近 InboundStation；S5 接线时复用其 `composeCaller` / `_from` / `OFTComposeMsgCodec` 模式，payload 与鉴权按 Station EIP-712 定稿。详见下文对话结论或 station-design §5.1。

---

## 已完成（摘要）

- **合约**: StLighter / LtZEN、gasless(`depositWithSigAndPermit` / `redeemWithSig`)、UUPS + Timelock、OFT 脚本；单测主路径通过。
- **Station P0–S5**: Inbound + Egress + `lzCompose` + `ZenOftStationBridge` + `payer`（单测 **30** passed）
- **前端**: `ltzen-frontend` **M0–M4**（Horizen 四页）；**Design D1–D4** 品牌 uplift。
- **Gasless 前端**: `useDeposit` / `useRedeem` + BFF `/api/relay`（P0-B encode/rrelayer 已落地；deposit E2E 仍暂缓）
- **Relayer 设计文档**: [`stLighter-relayer-design.md`](./stLighter-relayer-design.md)（rrelayer 无校验回调 → 校验在 BFF）

---

## 合理偏差（相对初版计划,可接受）

| 项 | 计划 | 实际 |
|----|------|------|
| UI 组件库 | shadcn/ui | Tailwind + `theme.ts` 自研（Design Uplift 亦禁止重型 UI 库） |
| Gasless 编排 | 独立 `useRelayer` hook | 内聚于 `useDeposit` / `useRedeem` + `createRelayer()` |
| 目录结构 | `forms/`、`bridge/` | `components/stake\|redeem\|transparency/` |
| M2/M3 gasless 测试网 | 纯 MockRelayer | 默认 `DirectContractRelayer`（用户钱包代发一笔 tx,验证 EIP-712） |
| 导航 | M5 完成后出现 Bridge | 导航已含 `/bridge`,页面未实现（见 P1） |
| 入站 stake | 曾议 Station 调 `deposit` / `forceApprove` | **修订**: `depositWithSig` + `payer`（2026-07-22） |
| Station UUPS | 曾对齐 StLighter UUPS | **修订**: Station **非**升级；可重部署 |

---

## 待办（按优先级）

### P0 — Gasless Redeem + Relayer 全链路

**业务目标**: Redeem 支持 gasless meta-tx（用户只签名,relayer 代发 `redeemWithSig`,手续费从赎回 ZEN 扣除）。

#### P0-A — 跑通 `redeemWithSig`（现有架构,测试网验收） ✅

> 2026-06-22 浏览器手动验收通过。步骤见 [`gasless-acceptance.md`](./gasless-acceptance.md)。

- [x] **测试网联调**: Horizen 上 gasless redeem 全流程（`DirectContractRelayer`）
- [x] **与 deposit gasless 对称**: 费用透明 UI、toast、超时兜底
- [x] **文档**: [`gasless-acceptance.md`](./gasless-acceptance.md)
- [ ] **边界态**（可选复测）: 拒签、份额不足、`maxFeeZen` 超限、末位全额赎回

#### P0-B — 接入 [rrelayer](https://github.com/joshstevens19/rrelayer) 🔄 部分完成

> 部署与 env 见 [`stLighter-rrelayer-setup.md`](./stLighter-rrelayer-setup.md)。

- [x] PoC / BFF / 前端切换 / 广播前校验 / gas sidecar / **redeem E2E**
- [ ] 负向用例验收（见 [`gasless-acceptance.md`](./gasless-acceptance.md) P0-B）
- [ ] **deposit E2E** ⏸ **暂缓**：permit/allowance 策略待与 Horizen 官方沟通；注意 typehash 已含 `payer`
- [ ] **运维**: gas 监控、API key 轮换、smoke 脚本

**P0 完成标准（当前）**: P0-A + P0-B **redeem** 闭环。Deposit 真 relayer 验收后补。

---

### P0-Station — 跨链 Inbound / Egress（产品已定稿）

权威：[`stLighter-crosschain-gasless-spec.md`](./stLighter-crosschain-gasless-spec.md) + [`stLighter-station-design.md`](./stLighter-station-design.md)。

- [x] **S1**: `InboundStation` + accounting + `payForDeposit` + `StLighter.payer` + 单测 + 文档/ABI
- [x] **S2**: `EgressStation`（`creditFromRedeem`、`bridgeToBase`、Mock refund/complete、`withdrawToHorizen`）+ 12 单测
- [x] **S5a**: `ILayerZeroComposer.lzCompose` + `StationComposePayload` v1 + compose ADR
- [x] **S5b**: `ZenOftStationBridge`（OFT `send`，`refundAddress=egress`，同 tx `onBridgeComplete`）+ 5 单测
- [ ] **S3**: BFF 校验 Station / 扩展 `depositWithSig`（`payer=Station`）与 redeem+credit 同 tx
- [ ] **S4**: 前端半编排向导（跨链 stake + Redeem to Base / B1 地址确认）
- [ ] **S6**: `rescue` / unassigned 策略参数化

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
- [ ] **安全评审定稿**: OFT peer/DVN、proxy 升级、relayer allowlist、审计 scope、Station 共池

### 暂缓 / 明确不做（Phase 1）

- Base 端同链 deposit/redeem（产品锚定 Horizen；跨链 stake 走 Station，不在 Base 执行 vault 写入）
- Harvest keeper 链上激励（PRD Phase 1 无）

---

## 建议接续顺序

```
P0-Station S3 BFF 编排（redeem+credit / payer=Station）  ← 下一棒
  → S4 半编排向导
  → P0-B 负向 + deposit E2E（含 payer=user）
  → P1 Bridge / 双链测试网
  → P2 Goldsky / 安全评审
```

重启开发时:读 [`stLighter-station-impl-plan.md`](./stLighter-station-impl-plan.md) → [`stLighter-station-design.md`](./stLighter-station-design.md) → 本文件进度快照。
