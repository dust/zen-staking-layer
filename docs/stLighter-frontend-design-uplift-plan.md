# stLighter / ltZEN 前端视觉改进计划(Design Uplift)

> 目标:把功能完备但视觉通用的 ltzen-frontend,提升为有**家族识别度**的精炼 staking 仪表盘。
> 方法:复用兄弟项目 **lighter-ui** 的品牌 DNA,分阶段实施 + 每阶段验收。
> 红线:**不改动任何合约交互逻辑、hooks 数据流、relayer / eip712 / chainGating**。本计划纯视觉/呈现层(字体、颜色、间距、动效、布局密度、品牌资产)。所有 tone-guide 红线(全英文、品牌拼写、`≈` 仅用于预估、harvest 不"跳"汇率、不误导)继续生效。
> **最后更新**:2026-06-22 — **D1–D4 均已落地**。待办见 [`todo-list.md`](./todo-list.md)。

---

## 当前状态（代码审计 2026-06-22）

| 阶段 | 状态 | 关键落点 |
|------|------|----------|
| **D1** 品牌地基 | ✅ | `layout.tsx` Syne/DM Sans/JetBrains Mono；`globals.css` `@theme`；`public/brand/logo.svg`；`Header` 字标 |
| **D2** 组件皮肤 | ✅ | `theme.ts`（`SURFACE`/`CTA_PRIMARY`/…）；`Card`/`Skeleton`/`Toast`；RainbowKit accent |
| **D3** Overview 主角 | ✅ | `HeroRate` 渐变读数 + 克制光晕；`CompoundChart` 品牌曲线；栅格留白 |
| **D4** 表单与收尾 | ✅ | `StakeForm`/`RedeemForm`/`RawMetricsTable`/`AddressList`；`app/icon.svg`；移动 `BottomTabBar` |

**未做（按计划）**: M5 Bridge 页视觉（M5 功能未开工）；framer-motion 未引入。

---

## 0. 设计方向(已锁定)

**美学**:精炼仪表盘(克制)。深蓝黑画布 + 大量留白,品牌渐变只用在 HeroRate 与主 CTA 这类"主角"节点,mono 数字像金融仪表读数。不堆氛围、不抢戏——数据本身是主角。

**品牌标志**:复用 lighter-ui 的渐变 `logo.svg` + Syne 字体渲染的 "ltZEN" 字标(家族一致)。

### 从 lighter-ui 提取的品牌 DNA(ground truth)

| Token | 值 | 用途 |
|-------|-----|------|
| 字体 display | **Syne** (600–800, tracking-tight) | logo 字标、页面 H1、HeroRate 标签 |
| 字体 body | **DM Sans** (300–600) | 所有正文、标签、说明 |
| 字体 mono | **JetBrains Mono** (400–500) | 汇率、ZEN 数额、份额、地址、原始指标 |
| 画布底色 | `#070A0E`(蓝黑,非纯黑) | body 背景 |
| 表面色 | `#0D1117` | 卡片/面板 |
| Hairline 边框 | `white/[0.06]` | 卡片、分隔、顶栏 |
| 模糊 | `backdrop-blur-xl` | 顶栏、吸底栏 |
| 品牌渐变 | `#27e4c0 → #31e0b5 → #3454ee`(teal→green→indigo) | logo、HeroRate、主 CTA |
| 主强调 | `emerald-400 / 500` | 成功、CTA、live 数字尾段 |
| 次强调 | `sky-400` | 链接、信息态 |

**对比当前 ltzen-frontend 的差距**:Geist 字体(skill 点名的"AI slop")、纯黑 `#0a0a0a` 无氛围、logo 仅是一个 emerald-cyan 圆点、无 display 层级、无家族识别。

### 资产复用清单(从 `../lighter-ui/app/public|app/`)
- `logo.svg`(7KB 渐变标)→ 复制到 `ltzen-frontend/public/brand/logo.svg`
- `horizen.svg`(链徽)→ 复制到 `public/brand/horizen.svg`(M5 Base 页与链切换器可用)

---

## 1. 设计令牌系统(贯穿所有阶段的地基)

集中到两处,杜绝散落的魔法色值:

- **`src/app/globals.css`** — Tailwind v4 `@theme` 扩展:品牌色阶 CSS 变量(`--color-canvas`、`--color-surface`、`--color-hairline`、`--brand-grad`)、字体变量绑定。
- **`src/lib/theme.ts`(新增)** — 导出可复用的 className 组合常量(如 `BRAND_GRADIENT_TEXT`、`SURFACE`、`CTA_PRIMARY`),供组件引用,避免 Tailwind 任意值字符串重复。
- 字体经 `next/font/google` 加载(Syne / DM Sans / JetBrains Mono),替换现有 Geist;CSS 变量 `--font-display / --font-sans / --font-mono`。

---

## 阶段实施

### Phase D1 — 品牌地基(令牌 + 字体 + logo)
**改动文件**:`app/layout.tsx`、`app/globals.css`、`lib/theme.ts`(新)、`public/brand/*`(复制资产)、`components/layout/Header.tsx`

- 引入 Syne / DM Sans / JetBrains Mono(next/font),设 CSS 变量,`<body>` 默认 DM Sans。
- globals.css `@theme`:注入 canvas/surface/hairline/品牌渐变令牌;画布底色改 `#070A0E`;保留已有 `prefers-reduced-motion` 兜底。
- 复制 lighter-ui `logo.svg` → `public/brand/`;Header 左上替换圆点占位为 `logo.svg` + Syne "ltZEN" 字标(`font-display font-bold tracking-tight`)。
- Header 顶栏样式对齐家族:`border-white/[0.06]` + `bg-[#070A0E]/95 backdrop-blur-xl`。

**验收 D1**
- [x] 三种字体在 Network 面板加载成功,无 FOUT 闪烁(`display:swap`)。
- [x] body 背景为 `#070A0E`;无残留 Geist 引用(`grep -r Geist src` 为空)。
- [x] 顶栏显示渐变 logo + Syne 字标,桌面/移动均正确。
- [x] `npm run lint && npx tsc --noEmit && npm run build` 全绿。

---

### Phase D2 — 核心组件皮肤(Card / 按钮 / 输入 / Skeleton / Tooltip)
**改动文件**:`components/common/{Card,Skeleton,InfoTooltip,Toast,CopyButton}.tsx`、`components/layout/{ChainSwitcher,WalletButton,TxBadge,BottomTabBar}.tsx`、`lib/theme.ts`

- **Card**:表面 `#0D1117` + `border-white/[0.06]`,统一圆角(`rounded-2xl`)与内距尺度;新增可选 `accent` 变体(品牌渐变描边,用于强调卡)。
- **按钮**:抽出 `CTA_PRIMARY`(品牌渐变填充、黑字、hover 微亮)与 `BTN_GHOST`(hairline 描边)两档;StakeForm/RedeemForm/ChainGuide 的主按钮统一引用。
- **输入框**:深表面 + focus 时品牌色 ring;mono 字体显示数额。
- **Skeleton**:shimmer 改为品牌冷色微光,`motion-safe` 包裹。
- **InfoTooltip / Toast / CopyButton**:字体、圆角、边框对齐令牌。
- RainbowKit `darkTheme()` 传入 `accentColor` = 品牌 emerald,与全站一致。

**验收 D2**
- [x] 所有卡片/按钮视觉统一(同圆角、同 hairline、同表面),无遗留旧 `bg-white/[0.02]` 杂色。
- [x] 主 CTA 全站一致(渐变填充);焦点态可见(键盘 Tab 可达,a11y §10 不退化)。
- [x] RainbowKit 连接弹窗强调色与全站一致。
- [x] lint + tsc + build 全绿;四页人工过一遍无错位。

---

### Phase D3 — HeroRate 与 Overview 重构(主角时刻)
**改动文件**:`components/overview/{HeroRate,PositionCard,ProtocolStatsCard,CompoundChart}.tsx`、`app/page.tsx`

- **HeroRate**:升级为页面主角——Syne 标签、超大 JetBrains Mono 读数、尾段品牌渐变 + `motion-safe` live 脉冲(保留现有"只升不跳"硬规则与诚实单位标注 "1,000 ltZEN = X ZEN")。背景加**克制**的品牌径向光晕(单层,低不透明度)。
- **CompoundChart**:曲线描边用品牌渐变(teal→indigo),区域填充低不透明度渐变;网格线 hairline 化;空态文案沿用。
- PositionCard / ProtocolStatsCard:统一卡片皮肤 + mono 数字层级;数值与标签的视觉权重拉开。
- Overview 栅格间距/留白调优(克制方向:更大留白,主次分明)。

**验收 D3**
- [x] HeroRate 是首屏视觉锚点;reduced-motion 下脉冲停止、数字静态可读。
- [x] 汇率仍只升不跳(无特殊跳变动效),单位标注诚实(未伪造 "1 ltZEN")。
- [x] 曲线渐变与品牌一致;空态/积累态文案不变。
- [x] 真实余额无 `≈` 前缀;预估值保留 `≈`(tone 红线)。
- [x] lint + tsc + build 全绿。

---

### Phase D4 — 表单与透明度页打磨 + 全局收尾
**改动文件**:`components/stake/*`、`components/redeem/*`、`components/transparency/*`、`app/{stake,redeem,transparency}/page.tsx`、`favicon`

- Stake/Redeem 表单:套用 D2 输入/按钮皮肤;gasless 开关、费用透明区、phase 态按钮的视觉层级统一;末位全额/harvest 提示用品牌强调而非裸 amber。
- Transparency:RawMetricsTable / AddressList 表格密度与 mono 对齐金融审计观感;explorer 链接 hover 态统一;`paused` 仍图标+文字(色不作唯一信号)。
- 替换默认 Next favicon 为品牌 favicon(由 logo 生成)。
- 响应式三断点 + 移动吸底栏视觉与新令牌对齐;触控目标 ≥44px 复核。
- **tone-guide §7 QA checklist 全量过**:全英文、品牌拼写(stLighter/ltZEN/ZEN/ZenStaker/Horizen/Base/LayerZero)、`≈`/trailing 限定。

**验收 D4(总验收)**
- [x] 四页(Overview/Stake/Redeem/Transparency)桌面 + 移动端视觉一致、无错位。
- [x] a11y 基线不退化:键盘可达、焦点态、对比度 AA、reduced-motion、色非唯一信号。
- [x] 品牌识别度:与 lighter-ui 并排可看出"同一团队/家族"(logo、字体、配色、渐变)。
- [x] tone-guide QA checklist 全绿。
- [x] lint + tsc + build 全绿;四页路由正常生成。

---

## 2. 不做(防止范围蔓延)
- 不改 hooks / relayer / eip712 / chainGating / 合约 ABI 调用——纯视觉层。
- 不引入重型 UI 库(shadcn/MUI/Chakra)或图表库;延续"inline SVG + Tailwind"路线。
- 不引入 framer-motion(lighter-ui 有,但本项目克制方向用 CSS 动效足矣;若 D3 确有需要再单独提议)。
- M5(Base bridge)暂缓——本计划只覆盖现有四页;M5 落地时复用本套令牌即可。

## 3. 风险与回滚
- 字体切换可能影响等宽对齐 → D1 即固定 `tabular-nums` + JetBrains Mono,D3 复核读数宽度稳定。
- Tailwind v4 `@theme` 任意值若与 next/font 变量冲突 → 令牌集中在 globals.css + theme.ts,单点排查。
- 每阶段独立可回滚(分支提交);验收不过不进入下一阶段。
