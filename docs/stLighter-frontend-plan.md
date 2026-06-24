# stLighter Frontend (ltZEN dApp) — 项目计划

> **用途**:把三份 dashboard 文档(design / uiux-spec / tone-guide)落地为一个可实施的前端工程计划。本文是**工程计划**(技术栈、目录、里程碑、任务分解、验收),不重复 UI/交互规格本身。
> **关联**:界面交互 [`stLighter-dashboard-uiux-spec.md`](./stLighter-dashboard-uiux-spec.md);复利叙事 [`stLighter-dashboard-design.md`](./stLighter-dashboard-design.md);视觉文案 [`stLighter-dashboard-tone-guide.md`](./stLighter-dashboard-tone-guide.md);ABI/指标 [`../abi/README.md`](../abi/README.md)。
> **最后更新**:2026-06-22

---

## 0. 已确认决策(本计划前提)

| 项 | 决策 |
|----|------|
| 技术栈 | **Next.js (App Router) + wagmi v2 / viem + RainbowKit + TanStack Query** |
| 代码位置 | 同仓库子目录 **`ltzen-frontend/`** |
| 历史数据后端 | **先纯 RPC**(实时 `eth_call`);Goldsky 子图后置,历史曲线/APY 第一版用前端轮询采样或留占位 |
| 架构 | **多链 / chain-aware**(Horizen + Base 两个 EVM 网络),链选择器驱动可用动作(uiux-spec §6.1) |
| 首版范围 | **Horizen 全功能闭环优先**(Overview/Stake/Redeem/Transparency,标准 approve+deposit);**Base 跨链页紧随其后**(仅 ltZEN 跨链转移 + gasless),不阻塞 Horizen 闭环 |
| Base 链动作 | **仅 ltZEN 在 Horizen⇄Base 跨链转移(OFT,可自定义接收地址)+ gasless**;**不在 Base 做 deposit/redeem**(锚定 Horizen,uiux-spec §6.1) |
| gasless | **首版先 Horizen 的 gasless deposit/redeem**;Base 的 gasless 跨链紧随;两链统一走**抽象 relayer 接口**(选择端点 → 提交 metaTx → track tx 状态变化) |
| 合约地址 | **env 占位后填**(`NEXT_PUBLIC_*`,按链分组),代码不硬编码 |
| 测试币 | **内置水龙头按钮**(调 `MockZEN.mint()` 领 256 ZEN,仅 Horizen) |
| 设计 | **代码优先**,Tailwind + 语义色板自带样式,不等 Figma |
| 组件库 | **shadcn/ui + Tailwind** |

**首版交付顺序**:M0 多链地基 → M1–M4 Horizen 全功能闭环(含 Horizen gasless)→ M5 Base 跨链页(bridge + 自定义接收地址 + Base gasless)。Base 页依赖 Base ltZEN 已部署 + OFT 接线就绪;若未就绪,Horizen 闭环可独立先行上线。

**首版明确不含**(留后续):permit 一笔存入(`depositWithPermit`)、Goldsky 子图(历史曲线真实数据)、Base 端 deposit/redeem(产品上锚定 Horizen,非删减)。

---

## 1. 目标链与合约(MVP)

- **网络(两条 EVM 链,自定义 wagmi chains)**:
  - **Horizen Testnet**(hub)— Chain ID `2651420`,RPC `http://horizen-testnet.rpc.caldera.xyz/http`,explorer `https://horizen.calderaexplorer.xyz/`。deposit/redeem/汇率/透明度结算地。
  - **Base**(spoke)— chainId/RPC/explorer 待填(env);仅承载 ltZEN OFT 跨链流通 + gasless,**无 deposit/redeem/汇率源**。
- **合约**(全部经 env 注入、**按链分组**,绑定 **proxy** 地址):
  - Horizen:
    - `NEXT_PUBLIC_HORIZEN_STLIGHTER_ADDRESS` — StLighter proxy(汇率、deposit、redeem、harvest)
    - `NEXT_PUBLIC_HORIZEN_LTZEN_ADDRESS` — ltZEN(余额、approve、minter 校验、OFT send)
    - `NEXT_PUBLIC_HORIZEN_ZEN_ADDRESS` — MockZEN(余额、approve、faucet mint)
    - `NEXT_PUBLIC_HORIZEN_ZENSTAKER_ADDRESS` — ZenStaker(透明度页 `rewardPerTokenAccumulated`)
  - Base:
    - `NEXT_PUBLIC_BASE_LTZEN_ADDRESS` — ltZEN(余额、OFT send;`minter==0`,无本地 mint/burn)
  - Relayer(抽象,见 §2):`NEXT_PUBLIC_RELAYER_ENDPOINTS`(逗号分隔候选端点)
- **汇率单一数据源**:Base 页展示 ltZEN 的 ZEN 估值时,汇率**只读 Horizen 的 `convertToAssets`**(design §4 双链一致);Base 不提供汇率源,UI 标注"汇率结算在 Horizen"。
- **ABI**:从仓库根 `abi/StLighter.json`、`abi/LtZEN.json` 引用;ZEN/ZenStaker 用最小内联 ABI;LtZEN OFT 的 `quoteSend`/`send` 走 `abi/LtZEN.json`。构建时拷贝/symlink 到 `ltzen-frontend/src/abi/`,附 `pnpm sync-abi` 脚本。

---

## 2. 目录结构(`ltzen-frontend/`)

```
ltzen-frontend/
  app/
    layout.tsx              # 顶栏 + Providers(wagmi/RainbowKit/QueryClient)
    page.tsx                # / Overview
    stake/page.tsx          # /stake     (仅 Horizen 可写)
    redeem/page.tsx         # /redeem    (仅 Horizen 可写)
    bridge/page.tsx         # /bridge    (Horizen⇄Base ltZEN 转移,可自定义接收地址)
    transparency/page.tsx   # /transparency
  src/
    config/
      chains.ts             # Horizen + Base 两条自定义链
      contracts.ts          # env(按链分组)→ 地址 + ABI 绑定
      wagmi.ts              # wagmi config(多链)+ RainbowKit
      relayer.ts            # 抽象 relayer 端点配置(候选列表)
    abi/                    # 同步自根 abi/(勿手改)
    hooks/
      useExchangeRate.ts    # convertToAssets(1e18) on Horizen,逐区块刷新(Base 也读此源)
      usePosition.ts        # ltZEN 余额(当前链)+ ZEN 估值 + 累计收益
      useProtocolStats.ts   # totalAssets / issuedShares / lastHarvest(Horizen)
      useDeposit.ts         # approve→deposit 状态机(Horizen)
      useRedeem.ts          # redeem 状态机(Horizen)
      useBridge.ts          # OFT quoteSend→send(Horizen⇄Base,自定义 receiver)
      useFaucet.ts          # MockZEN.mint()(Horizen)
      useTxLifecycle.ts     # 链上交易生命周期(idle→sign→pending→success/error)
      useRelayer.ts         # 抽象 gasless:签 metaTx→选 relayer 提交→track 状态变化
    relayer/
      types.ts              # RelayerClient 接口:submit(metaTx) / getStatus(id)
      httpRelayer.ts        # 默认 HTTP 实现(端点来自 config/relayer.ts)
    components/
      layout/               # Header, ChainSwitcher, WalletButton, MobileTabBar
      overview/             # HeroRate, PositionCard, CompoundChart, ProtocolStatsCard
      forms/                # AmountInput, MaxButton, TxButton, PreviewRow, RecipientInput
      bridge/               # BridgeForm, ChainPicker, RelayerStatus, RecipientField
      transparency/         # RawMetricsTable, AddressList, HarvestHistory(占位)
      common/               # Skeleton, EmptyState, ErrorState, Toast, InfoTooltip
    lib/
      format.ts             # ZEN/汇率/份额 格式化(精度规则见 uiux-spec §8.3)
      copy.ts               # 集中英文文案(tone-guide §3),便于审校与一致性
      errors.ts             # 错误归类(uiux-spec §8.2)
      chainGating.ts        # 链感知:当前链 → 可用动作(uiux-spec §6.1 矩阵)
    styles/                 # Tailwind + 语义色板(tone-guide §5.2)
  .env.local.example        # 全部 NEXT_PUBLIC_*(按链分组)+ relayer 占位
  README.md                 # 启动/构建/接地址说明
```

> **gasless / relayer 抽象(贯穿)**:`relayer/types.ts` 定义最小 `RelayerClient` 接口
> (`submit(signedMetaTx) → {id}`、`getStatus(id) → {state, txHash?}`),`useRelayer` 负责
> 「构造 typed-data → 钱包签名 → 选候选端点提交 → 轮询 `getStatus` 直到 mined/failed」。
> 具体 relayer 协议(自建 / 第三方)在 `httpRelayer.ts` 内实现,**UI 与业务 hook 不依赖具体端点**,
> 后续换 relayer 只改这一层。首版接入 Horizen 的 gasless deposit/redeem;Base 的 gasless 跨链复用同一接口(M5)。

---

## 3. 里程碑与任务分解

### M0 — 脚手架与多链接入(地基)
- `create-next-app` + TypeScript + Tailwind;装 wagmi/viem/RainbowKit/TanStack Query/shadcn。
- **两条自定义链(Horizen + Base)**;多链 wagmi config;RainbowKit Provider;QueryClient。
- `.env.local.example` 全占位(按链分组)+ relayer 端点;`contracts.ts` 按链读 env + 绑 ABI;`sync-abi` 脚本。
- `chainGating.ts` 实现 uiux-spec §6.1 动作可用性矩阵(当前链 → 可用动作)。
- 顶栏框架:logo、**ChainSwitcher(Horizen/Base 切换驱动可用动作)**、WalletButton(连接/错链/切链状态机,uiux-spec §2.2)。
- **验收**:连钱包;Horizen/Base 间切链且 UI 动作随之变化;错链提示切链;`pnpm build` 通过。

### M1 — 只读 Overview(无需写入即可展示)
- `useExchangeRate`:`convertToAssets(1e18)`,`watch`/区块刷新,6–8 位小数 + live 末位动效(design §0,严禁 harvest 跳涨叙事)。
- `useProtocolStats`:`totalAssets` / `issuedShares`;HeroRate + ProtocolStatsCard。
- `usePosition`:ltZEN 余额 ×汇率 = ZEN 估值(主数字 ZEN,裸份额次要,uiux-spec §0 原则1)。
- CompoundChart:**第一版前端轮询采样**汇率落 localStorage/内存,画 `convertToAssets` 折线;数据不足显示"积累中"(design §4 / uiux-spec §3.3)。harvest 标记与"不复投对照线"留接口,Goldsky 接入后补。
- 骨架屏 / 空态 / 未连钱包公开数据(uiux-spec §8.4)。
- **验收**:未连钱包可见汇率/TVL/曲线;连钱包见持仓 ZEN 估值;数字格式符合 §8.3。

### M2 — Stake(核心写入闭环,Horizen)
- `useFaucet`:Get test ZEN 按钮 → `MockZEN.mint()`(领 256 ZEN)。
- `useDeposit`:`previewDeposit` 实时预览;allowance 检查 → `approve` → `deposit` 状态机(uiux-spec §4.2);通用 `useTxLifecycle` + Toast + tx hash explorer 链接。
- **gasless deposit(Horizen)**:`depositWithSigAndPermit` — 双签(DepositWithSig + ZEN Permit),免 approve;`createRelayer()` 抽象:
  - 测试网默认 `DirectContractRelayer`(直连合约,一笔 tx 验证 EIP-712,无后端 relayer)
  - `NEXT_PUBLIC_MOCK_RELAYER_ONLY=1` → 纯 UI 模拟
  - `NEXT_PUBLIC_RELAYER_ENDPOINTS` → `HttpRelayer`(relayer 服务置后开发)
- 费用透明(`maxFeeZen`;实际 `feeZen` 由 relayer 后端动态提供,测试网 fee=0)。
- 成功后乐观更新持仓;错误归类文案(§8.2)。
- **验收**:领币→标准存入或 gasless 双签存入→见 ltZEN;gasless 无 approve;中继超时兜底"改用普通存入"。`depositWithPermit` 推迟至 M2 之后。

### M3 — Redeem(赎回闭环,Horizen)
- `useRedeem`:输入 ltZEN 份额(可切按 ZEN 反算);`previewRedeem` 预览;末位全额赎回提示(uiux-spec §5.1)。
- redeem 状态机 + 乐观更新;"赎回前已自动复投"说明(PRD §5.6)。
- **gasless redeem(Horizen)**:`redeemWithSig` 复用 `useRelayer`。
- **验收**:赎回半数/全额,ZEN 余额变化与 preview 吻合,持仓更新;gasless 赎回可走中继并 track。

### M4 — Transparency + 打磨
- RawMetricsTable:`rewardPerTokenAccumulated`(1e36 原值)、`totalAssets`、`issuedShares`、`feeBps`、`paused`、`minter`,每项 explorer 直链(uiux-spec §7 / design §1)。
- AddressList(proxy/impl/ltZEN/ZenStaker + 复制);HarvestHistory 占位(待 Goldsky)。
- 响应式三断点 + 移动底部 Tab(uiux-spec §9);a11y 基线(§10,色不作唯一信号、键盘可达、`prefers-reduced-motion`)。
- 文案统一走 `copy.ts`,过 tone-guide §7 QA checklist(全英文、品牌拼写、≈/trailing 限定)。
- **验收**:四页移动端可用;a11y 基线过;UI 文案全英文且符合 tone-guide。

### M5 — Base 跨链页(bridge + 自定义接收地址 + Base gasless)
> 依赖:Base ltZEN 已部署 + Horizen⇄Base OFT peer/DVN 接线就绪。未就绪不阻塞 M1–M4 上线。
- `useBridge`:LtZEN OFT `quoteSend`(估 LayerZero 原生费)→ `send`,**支持自定义接收地址**(默认本人,可填他人);跨链不改份额数量/ZEN 价值(uiux-spec §6.2)。
- BridgeForm:源/目标链选择(Horizen⇄Base)、数量、`RecipientField`(默认自填,可改)、预计到账(同额 ltZEN)、LayerZero 费用、"在 LayerZero Scan 查看"。
- 跨链状态机:发起→源链 burn 确认→LayerZero 传递中→目标链 mint 到账;`RelayerStatus` 展示进度。
- **Base gasless 跨链**:复用 `useRelayer` 抽象——签名授权 OFT send,relayer 代提交并 track 状态(两链统一接口)。
- Base 链下:Overview 持仓以 ZEN 估值显示(汇率读 Horizen),Stake/Redeem 入口按 §6.1 引导切 Horizen / 桥回。
- **验收**:Horizen→Base、Base→Horizen 转移成功,接收地址可自定义,两链余额守恒、Horizen 汇率不受影响;Base gasless 跨链走中继并 track。

---

## 4. 与文档的强约束映射(实现红线)

| 红线(来源) | 落地点 |
|--------------|--------|
| 价值用 ZEN 非裸份额(uiux §0.1) | `usePosition` + `format.ts`,主数字恒为 `convertToAssets` |
| harvest 不跳涨(design §0) | CompoundChart 用真实汇率序列,harvest 仅作"斜率拐点"标记 |
| 精度 6–8 位看出 live(design §4.2) | HeroRate 汇率 8 位;ZEN 2–4 位;份额千分位 |
| APY 标 trailing / 非承诺(design §2) | MVP 数据不足时隐藏 APY,显示"积累中" |
| 暂停只挡 deposit(PRD §7) | `paused()` 仅禁用 Stake,Redeem/查看不受影响 |
| UI 全英文 + 品牌拼写(tone §0/§6) | `copy.ts` 集中管理 + QA checklist |
| 绑 proxy 地址(abi/README) | `contracts.ts` env 全部指向 proxy |
| 链感知:Base 不做 deposit/redeem(uiux §6.1) | `chainGating.ts` + ChainSwitcher,Base 仅 bridge/查看 |
| 汇率单一源在 Horizen(design §4 双链一致) | `useExchangeRate` 恒读 Horizen,Base 页标注"结算在 Horizen" |
| 跨链不改份额/价值(uiux §6.2) | `useBridge` OFT 1:1,UI 明示"价值不变" |
| 自定义接收地址(本次强调) | BridgeForm `RecipientField`,默认自填可改 |
| gasless relayer 可替换(本次强调) | `relayer/` 抽象层,UI/业务不依赖具体端点 |

---

## 5. 验收(整体)
- **多链**:Horizen/Base 切链顺畅,链感知矩阵(§6.1)在每个入口生效;Base 下 deposit/redeem 正确引导而非报错。
- Horizen 四页(Overview/Stake/Redeem/Transparency)跑通 领币→存入→赎回 闭环;含 gasless deposit/redeem(走 relayer 可 track)。
- Base 跨链页(M5)Horizen⇄Base 转移成功、接收地址可自定义、两链余额守恒、Horizen 汇率不受影响;Base gasless 跨链可走中继。
- 未连钱包可见协议级公开数据;连钱包见个人持仓(ZEN 估值);汇率逐区块 live 上升可见;曲线少数据时不误导。
- 错误/边界态(拒签、余额不足、错链、暂停、中继超时、RPC 失败)文案与行为符合 uiux-spec §8。
- 移动端可用;a11y 基线;UI 文案 100% 英文且符合 tone-guide。
- `pnpm build` 通过;`.env.local.example` 完整(按链分组 + relayer);README 可照做启动。

---

## 6. 后续(本计划不含实现)
- **Goldsky 子图**:历史汇率/harvest/APY 真实数据,替换前端轮询采样;补 harvest 标记与"不复投对照面积"。
- **permit 一笔存入**(`depositWithPermit`):非 gasless 路径,免单独 approve — M2 之后。
- **Base 端 deposit/redeem**:产品上锚定 Horizen,属 Phase 2 跨链写入范畴(PRD §3),非本前端删减项。

---

## 7. 风险与依赖
- **历史曲线数据**:MVP 纯 RPC 无链上历史,前端轮询采样仅在会话内累积,刷新即丢。明确标注"会话内采样",真实历史等 Goldsky。
- **合约地址**:依赖你部署后填 env;未填时前端应给清晰"未配置"提示而非崩溃。
- **faucet 速率**:MockZEN 每次 256 ZEN 上限,按钮需处理"领取过于频繁/gas 不足"反馈。
- **RPC 稳定性**:Caldera testnet RPC 若不稳,需要 TanStack Query 重试 + 骨架屏兜底。
- **Base 接入(M5)**:依赖 Base ltZEN 已部署 + Horizen⇄Base OFT peer/DVN 接线;未就绪时 Base 页禁用并提示,Horizen 闭环独立先行。
- **relayer 服务**:M2 不接真实 relayer。测试网默认 `DirectContractRelayer` 直连 `depositWithSigAndPermit`(验证 EIP-712,无 approve);`MockRelayer` 仅 UI 演练;`HttpRelayer` 待后端就绪。`feeZen` 由 relayer 动态报价,前端只签 `maxFeeZen` 上限。
- **跨链接收地址**:bridge 允许填他人地址,UI 必须二次确认("发送到非本人地址不可撤销"),并校验地址格式,防误填。
