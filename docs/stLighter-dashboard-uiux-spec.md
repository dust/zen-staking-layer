# stLighter Dashboard — 前端 UI/UX 执行规格

> **用途**:指导前端工程师落地 ltZEN dApp Dashboard 的**具体界面与交互**。本文是执行层规格(页面结构 / 组件 / 状态机 / 交互流 / 文案 / 响应式 / 边界态 / 无障碍)。
> **不重复**:复利叙事与可视化概念见 [`stLighter-dashboard-design.md`](./stLighter-dashboard-design.md);指标 ← 合约调用/事件映射见 [`abi/README.md`](../abi/README.md);需求与约束见 [`stLighter-PRD.md`](./stLighter-PRD.md)。
> **最后更新**:2026-06-15

---

## 0. 设计原则(贯穿全文)

1. **价值用 ZEN 表达,不用裸份额**。任何展示 ltZEN 余额的地方,**主数字是 `convertToAssets(balance)` 的 ZEN 价值**,裸份额只作次要灰字。原因:`DECIMALS_OFFSET=3` 使份额数量级比 ZEN 大 10³(PRD §4.1),裸份额会误导。
2. **汇率逐区块 live,harvest 不跳涨**。所有"增值"动效是平滑的,harvest 表现为"加速",不是台阶(见 dashboard-design §0)。
3. **赎回锚定 Horizen**。Base 上无法 redeem;UI 必须在 Base 语境下显式引导"桥回 Horizen"。
4. **诚实**。APY 标注"尾随实现、非承诺";所有预估值标 "≈";gas 代付额度对用户透明。
5. **链感知(chain-aware)**。同一界面在 Horizen / Base 下功能不同,用顶部链选择器驱动可用动作。

---

## 1. 信息架构 / 页面地图

```
/                     概览(Overview)         — 协议 + 个人聚合,英雄汇率,复利曲线
/stake                存入(Deposit)          — ZEN → ltZEN,含 gasless/permit 选项
/redeem               赎回(Redeem)           — ltZEN → ZEN(仅 Horizen)
/bridge               跨链(Bridge)           — Horizen ⇄ Base OFT 转移
/transparency         透明度(Transparency)   — 原始链上指标 + harvest 历史 + 浏览器直链
```

- **单页应用 + 持久顶栏**(钱包、链选择器、ltZEN 价值快览)。
- 移动端:底部 Tab(Overview / Stake / Redeem / More),Bridge 与 Transparency 收进 More。

---

## 2. 全局框架组件

### 2.1 顶栏(persistent header)

```
┌──────────────────────────────────────────────────────────┐
│ [stLighter logo]   [链: Horizen ▾]      1 ltZEN=1.0423 ZEN   [0x12..ab ▾] │
└──────────────────────────────────────────────────────────┘
```

- **链选择器**:Horizen / Base。切换即重渲染可用动作(见 §6 链感知矩阵)。
- **汇率快览**:常驻 `convertToAssets(1e18)`,live 微动。点击跳 /transparency。
- **钱包按钮**:未连接 → "连接钱包";已连接 → 地址缩写 + 余额下拉。

### 2.2 钱包 / 网络状态机

```
未连接 → 连接中 → 已连接(对链)
                   └→ 已连接(错链) → 提示"切换到 Horizen/Base" + 一键切链按钮
```

- 错链时,写入类按钮全部禁用并显示"请切换网络"。
- 连接失败 / 用户拒绝:非阻断 toast,可重试。

---

## 3. 页面:概览(Overview)

布局自上而下(桌面双列,移动单列):

### 3.1 英雄区(Hero)— 汇率

```
┌── 汇率 ───────────────────────────────────┐
│   1 ltZEN = 1.04231 ZEN     ↑ 0.00001 (live)   │
│   尾随 APY  6.8%   [7d|30d]   ⓘ 基于历史实现     │
└──────────────────────────────────────────┘
```

- 主数字 6–8 位小数(PRD/dashboard-design §4 精度要求),末位 live 滚动。
- APY 窗口切换 7d/30d;ⓘ tooltip 解释口径。
- 首存期(数据不足)隐藏 APY,显示"数据积累中"。

### 3.2 个人持仓卡(连接钱包后)

```
┌── 我的持仓 ────────────────┐
│  ≈ 1,250.8 ZEN                          │   ← 主数字 = convertToAssets(balance)
│  1,200,000 ltZEN  (份额)                │   ← 次要灰字
│  累计收益 +50.8 ZEN  (自存入起)         │   ← 见 §3.5 收益口径
│  [存入]  [赎回]                          │
└──────────────────────────┘
```

- 未连接:占位 "连接钱包查看持仓" + 连接按钮。
- Base 链:同样展示 ZEN 价值,但 [赎回] 替换为 [桥回 Horizen 赎回](见 §6)。

### 3.3 复利曲线(核心可视化)

实现细节遵循 dashboard-design §2「复利曲线细节」:

- 折线 = `convertToAssets(1e18)` 历史;harvest 点打标记,hover 显示复投额。
- 叠加"不复投"虚线对照,张口面积高亮 = 复利多赚。
- 时间轴 24h / 30d / 全部。
- **空/少数据态**:少于 2 个数据点时显示"协议运行不久,曲线积累中",不画误导性直线。

### 3.4 协议规模卡

`totalAssets`(TVL,以 ZEN)、`issuedShares`、上次 harvest 时间(来自 `Harvested` 事件)。纯展示。

### 3.5 个人累计收益口径(明确)

`累计收益 = 当前 convertToAssets(balance) − Σ(历史每次存入时的 ZEN 成本) + Σ(已赎回 ZEN)`。
成本基记录依赖 Goldsky 按地址聚合 `Deposited`/`Redeemed` 事件。**无法精确时**(如曾跨链转入的 ltZEN 无本地成本基)标注"≈ 基于本链记录",不假装精确。

---

## 4. 页面:存入(Deposit / Stake)

### 4.1 表单

```
┌── 存入 ZEN ────────────────────┐
│  数量 [ 1000.00 ] ZEN   [最大]            │
│  余额 5,000 ZEN                            │
│  ────────────────────────       │
│  预计获得 ≈ 1,000,000 ltZEN               │   ← previewDeposit
│           ≈ 1,000 ZEN 价值                │
│  当前汇率 1 ltZEN = 1.0423 ZEN            │
│  ───────────────────────        │
│  ☐ 免 gas 存入(由中继代付)              │   ← gasless 选项,见 4.3
│  [ 授权并存入 ]                            │   ← 按钮文案随路径变化
└────────────────────────────┘
```

- 输入实时调 `previewDeposit` 显示预计份额 + ZEN 价值。
- "最大"= 钱包 ZEN 余额(留少量原生 gas 余量,若 ZEN≠gas token 则全额)。

### 4.2 存入交互状态机(标准路径)

```
输入 → 校验(>0、≤余额)
     → [需授权?] 检查 allowance
          ├ 是 → 授权交易(approve) → 等待确认
          └ 否 ─────────────────┐
     → 存入交易(deposit) ←────────┘
     → pending(显示 tx hash + 浏览器链接)
     → 成功(toast + 持仓卡乐观更新 + 曲线追加点)
     → 失败(错误归类,见 §8)
```

### 4.3 三种存入路径(对应合约入口)

前端依据用户选择与代币能力选择入口(合约见 `StLighter.sol`):

| 用户场景 | 合约入口 | UX |
|----------|----------|-----|
| 普通存入(已授权或愿分两步) | `deposit` | 标准两步:approve → deposit |
| 一笔完成授权+存入 | `depositWithPermit` | 用 ltZEN/ZEN 的 EIP-2612 permit 签名,免单独 approve 交易 |
| 免 gas(中继代付) | `depositWithSig` / `depositWithSigAndPermit` | 用户**只签名不发交易**;中继提交,gas 从存入额扣 `feeZen`(≤ 用户签的 `maxFeeZen`) |

**gasless 专属 UI 要求**:
- 勾选"免 gas"后,显示**预计代付费用**与**实际到账**:`存入 1000 → 手续费 ≈ X ZEN → 实际质押 ≈ 1000−X`。
- 用户签名前必须看到 `maxFeeZen` 上限并确认(对应签名字段)。
- 状态机变为:`签名 → 提交给中继 → 等待中继上链 → 成功/超时`。中继超时要有"改用普通存入"兜底。

---

## 5. 页面:赎回(Redeem)

### 5.1 表单(仅 Horizen)

```
┌── 赎回 ZEN ────────────────────┐
│  数量 [ 500,000 ] ltZEN   [最大]          │
│  持有 1,200,000 ltZEN (≈1,250.8 ZEN)      │
│  ──────────────────────         │
│  预计取回 ≈ 520.5 ZEN                      │   ← previewRedeem
│  ☐ 免 gas 赎回                            │   ← redeemWithSig
│  [ 赎回 ]                                  │
└────────────────────────────┘
```

- 输入用 ltZEN 份额;同时显示"≈ ZEN"。提供"按 ZEN 金额反算份额"切换更友好。
- `previewRedeem` 显示预计取回;**末位退出**(redeem 全部)时提示"全额赎回,清空持仓"。
- harvest 在 redeem 内部自动发生(PRD §5.6),无需用户单独操作,但可在明细里说明"赎回前已自动复投未结算奖励"。

### 5.2 Base 链赎回引导

Base 下 /redeem **不提供本地赎回**,而是:

```
┌────────────────────────────┐
│  赎回需在 Horizen 进行                      │
│  你的 ltZEN 当前在 Base。请先桥回 Horizen, │
│  再赎回为 ZEN。                            │
│  [ 前往跨链桥回 → ]                         │
└────────────────────────────┘
```

可选(若产品确认"一键桥回并赎回"编排):提供组合流程,见 §6.3。

---

## 6. 链感知(chain-aware)与跨链

### 6.1 动作可用性矩阵

| 动作 | Horizen | Base |
|------|---------|------|
| 查看汇率/持仓(ZEN 价值) | ✅ | ✅(汇率读自 Horizen) |
| 存入 deposit | ✅ | ❌ → 引导切到 Horizen |
| 赎回 redeem | ✅ | ❌ → 引导桥回 |
| 跨链 bridge | ✅ | ✅ |
| 透明度只读 | ✅ | ✅(标注"汇率结算在 Horizen") |

### 6.2 页面:跨链(Bridge)

```
从 [Horizen ▾]  →  到 [Base ▾]
数量 [ ... ] ltZEN   [最大]
预计到账 ≈ 同额 ltZEN(OFT 1:1,份额不变)
LayerZero 费用 ≈ ... (原生币)
[ 跨链转移 ]
```

- 强调:**跨链不改变份额数量、不改变可兑换 ZEN 价值**(OFT 1:1,`issuedShares` 不变)。
- 状态机:`发起 → 源链 burn 确认 → LayerZero 传递中(进度/预计时间) → 目标链 mint 到账`。给"在 LayerZero Scan 查看"链接。

### 6.3 可选:一键"桥回并赎回"(若产品确认,纯前端编排)

`Base: bridge→Horizen` 完成后自动跳到 /redeem 预填。**这是前端编排,非合约原子操作**;每步独立可失败,需清晰分步进度与失败可续。

---

## 7. 页面:透明度(Transparency)

面向审计者 / 集成方 / 极客,体现开源不可篡改:

- **原始链上指标表**:`rewardPerTokenAccumulated()`(1e36 放大原值)、`totalAssets`、`issuedShares`、`feeBps`、`paused`、proxy/impl 地址、ltZEN `minter`。每项配**区块浏览器直链**,用户可独立核对。
- **Harvest 历史表**:时间、`claimed`、`restake`、harvest 后汇率(来自 `Harvested` 事件 + Goldsky)。
- **合约地址区**:Horizen proxy / impl / ltZEN、Base ltZEN、Timelock,均附浏览器链接与"复制"。
- 文案基调:数据原样呈现,标注"前端仅做展示,数值可链上独立验证"。

---

## 8. 通用交互规范

### 8.1 交易生命周期(所有写入动作统一)

```
idle → 校验 → 钱包待签 → 已广播(pending) → 已确认(success) | 失败(error)
```

- pending:非阻断,可继续浏览;顶栏显示进行中 tx 数。
- success:toast + 受影响数据**乐观更新**,随后被链上真实值校正。
- 始终展示 tx hash + 浏览器链接。

### 8.2 错误归类与文案

| 类别 | 触发 | 文案方向 |
|------|------|----------|
| 用户拒签 | 钱包 reject | "已取消",无错误色,可重试 |
| 余额不足 | 校验 | 入口禁用 + "余额不足" |
| 授权不足 | allowance < amount | 引导先授权(或转 permit 路径) |
| 错链 | chainId 不符 | "请切换到 Horizen" + 切链按钮 |
| 滑点/汇率变动 | preview 与实际偏差 | redeem/deposit 前重取 preview;偏差大时二次确认 |
| 暂停 | `paused()==true` | 仅 deposit 受阻:"存入已临时暂停,赎回/查看不受影响"(PRD §7) |
| gasless 中继超时 | 中继无响应 | "代付提交超时,可改用普通存入" |
| RPC 失败 | 读链失败 | 骨架屏 + "数据加载失败,重试" |

### 8.3 数值与格式

- ZEN 价值:默认 2–4 位小数;汇率:6–8 位;份额:千分位整数。
- 一律 "≈" 标注预估值;真实余额不加 "≈"。
- 大数千分位;移动端可缩写(1.2M)但 tooltip 给全值。

### 8.4 加载与空态

- 首屏:骨架屏,不堵塞。
- 未连接钱包:展示协议级公开数据(汇率、TVL、曲线),个人区给连接引导。
- 无持仓:鼓励性空态 + [立即存入]。

---

## 9. 响应式

| 断点 | 布局 |
|------|------|
| 桌面 ≥1024 | 概览双列(左持仓/操作,右曲线);顶栏完整 |
| 平板 768–1023 | 单列堆叠,曲线全宽 |
| 移动 <768 | 单列 + 底部 Tab;表单全宽;曲线可横向滚动;数字缩写+tooltip |

- 触控目标 ≥44px;主操作按钮移动端吸底。

---

## 10. 无障碍(a11y)

- 颜色不作唯一信息载体:涨/跌、成功/失败同时用图标+文字(色盲友好)。
- 全键盘可达:表单、链选择器、tab、modal 有焦点态与 ARIA 标签。
- live 数字用 `aria-live="polite"`,避免频繁打断读屏(可设节流)。
- 对比度满足 WCAG AA;动效尊重 `prefers-reduced-motion`(关闭 live 滚动动画)。

> 注:完整 WCAG 合规需配合辅助技术实测与专家评审,本规格仅给出设计层要求。

---

## 11. 交付与对齐 checklist

- [ ] ABI 固定:用 `abi/StLighter.json` / `abi/LtZEN.json`(见 `abi/README.md`),绑定 **proxy** 地址。
- [ ] 指标来源逐项对照 dashboard-design §3 表(实时 RPC vs Goldsky 快照)。
- [ ] 链感知矩阵(§6.1)在每个写入入口生效。
- [ ] gasless 三路径(§4.3)与合约入口一一对应,费用对用户透明。
- [ ] 精度:汇率 6–8 位、份额展示用 ZEN 价值(§0 原则 1)。
- [ ] 边界:首存期 APY 隐藏、少数据曲线不误导、Base 赎回引导。
- [ ] 暂停态:仅挡 deposit,redeem/查看可用(PRD §7)。
