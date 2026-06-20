# stLighter Dashboard — 视觉与文案 Tone 指南

> **用途**:统一 ltZEN dApp 的视觉语言与 UI 文案。给设计师与前端工程师做创意/文案交接。
> **硬性约束**:**所有面向用户的 UI 文案一律使用地道 web3 英文**(不出现中文)。本文档的说明性文字用中文,但每一处 UI 样例/词表均为最终英文文案,可直接落地。
> **关联**:页面/组件结构见 [`stLighter-dashboard-uiux-spec.md`](./stLighter-dashboard-uiux-spec.md);复利叙事见 [`stLighter-dashboard-design.md`](./stLighter-dashboard-design.md)。
> **最后更新**:2026-06-15

---

## 0. 品牌命名规范(拼写不可变)

UI 与文案中必须严格遵循以下大小写,**不得自创变体**:

| 正确 | 错误示例 | 说明 |
|------|----------|------|
| `stLighter` | StLighter, STLighter, Stlighter | 协议名,小写起首(句首也保持小写,设计上接受) |
| `ltZEN` | LTZen, LtZen, ltZen, $ltZEN(正文不加 $) | 份额代币;代币选择器内可用 `ltZEN` 纯文本 |
| `ZEN` | Zen, zen | 底层资产代币,全大写 |
| `ZenStaker` | Zenstaker, ZEN Staker | 底层质押合约(一般只在 Transparency 出现) |
| `Horizen` | Horizon, HorizEN | 链名(hub) |
| `Base` | BASE, base | 链名(spoke) |
| `LayerZero` | Layer Zero, Layerzero | 跨链协议 |

- 代币金额写法:`1,000 ZEN` / `1.0423 ZEN`(数字与符号间一个空格)。
- 标题中提及代币用 `ltZEN`,不写成 "LT ZEN" 或 "Liquid ZEN"。

---

## 1. 品牌声音(Voice)

stLighter 的声音 = **Confident · Transparent · Effortless**(自信、透明、轻松)。它是一个把质押"变简单"的协议,语气像一个懂行但不卖弄的朋友。

| 维度 | 是 | 不是 |
|------|----|----|
| 态度 | Confident, calm | Hypey, salesy("🚀 moon", "insane APY") |
| 复杂度 | Plain, jargon-light | Academic / 堆术语吓人 |
| 收益表述 | Honest, qualified("trailing", "≈") | Guaranteed / 承诺式("earn X%") |
| 用户关系 | Empowering("you're in control") | Patronizing / 说教 |

**北极星文案(可用作 hero 副标题或 meta)**:
> *Stake ZEN. Stay liquid. Your ltZEN keeps compounding — no lockups, no claiming.*

---

## 2. 语气随场景切换(Tone)

Voice 恒定,tone 随情境调:

| 场景 | Tone | 示例 |
|------|------|------|
| 营销 / 空态 | Warm, inviting | "Put your ZEN to work — get liquid ltZEN you can use anywhere." |
| 交易进行中 | Calm, reassuring | "Confirming your deposit…" |
| 成功 | Brief, positive | "Deposit confirmed. You're earning." |
| 错误(用户侧) | Neutral, non-blaming | "Transaction cancelled. No funds moved." |
| 错误(系统侧) | Honest, actionable | "Couldn't reach the network. Retry." |
| 风险/不可逆 | Direct, clear | "Redeeming all ltZEN will close your position." |
| 透明度区 | Factual, plain | "Live on-chain values. Verify any number on the explorer." |

---

## 3. 微文案词典(Microcopy — 直接落地英文)

### 3.1 核心动作(按钮 / CTA)

| 场景 | 英文文案 |
|------|----------|
| 连接钱包 | `Connect Wallet` |
| 主存入 | `Stake ZEN` |
| 授权后存入(两步) | `Approve` → `Stake` |
| 一笔 permit 存入 | `Stake with Permit` |
| 免 gas 存入 | `Stake (Gas-Free)` |
| 赎回 | `Redeem` / `Redeem ZEN` |
| 最大额 | `Max` |
| 跨链 | `Bridge` / `Bridge ltZEN` |
| 切换网络 | `Switch to Horizen` / `Switch to Base` |
| 重试 | `Retry` |
| 在浏览器查看 | `View on Explorer` |

### 3.2 状态文案

| 状态 | 英文 |
|------|------|
| 待签名 | `Confirm in your wallet…` |
| 已广播 | `Transaction submitted` |
| 确认中 | `Confirming…` |
| 成功(存入) | `Staked successfully` |
| 成功(赎回) | `Redeemed successfully` |
| 用户取消 | `Cancelled — no funds moved` |
| 余额不足 | `Insufficient ZEN balance` |
| 错链 | `Wrong network — switch to Horizen` |
| 暂停 | `Deposits are paused. Redemptions and balances are unaffected.` |
| 中继超时(gasless) | `Relayer timed out. Try a standard deposit instead.` |
| 加载失败 | `Couldn't load data. Retry.` |

### 3.3 指标标签(Labels)

| 指标 | 英文标签 | 副说明(tooltip) |
|------|----------|------------------|
| 汇率 | `Exchange Rate` 或 `1 ltZEN =` | "Updates every block as rewards compound." |
| APY | `APY (trailing)` | "Based on realized rate growth, not a guarantee." |
| 个人价值 | `Your Balance` | "Value in ZEN, redeemable on Horizen." |
| 裸份额 | `ltZEN shares` | "Accounting units; value shown in ZEN above." |
| 累计收益 | `Total Earned` | "Estimated from your deposit history on this chain." |
| TVL | `Total Staked` 或 `TVL` | — |
| 上次复投 | `Last Harvest` | "Rewards are auto-compounded into the pool." |
| 原始累加器 | `Reward-per-token (raw)` | "On-chain accumulator, scaled by 1e36. For verification." |

### 3.4 教育性微文案(空态 / tooltip / 首次引导)

- 关于复利:`Your ltZEN balance stays the same — each one just redeems for more ZEN over time.`
- 关于 harvest:`Harvests don't bump your value instantly. They make it grow faster from here.`
- 关于 Base 赎回:`Redemptions settle on Horizen. Bridge your ltZEN back first.`
- 关于跨链不变性:`Bridging doesn't change how much ZEN your ltZEN is worth.`
- 关于 gasless 费用:`A small ZEN fee covers gas. You'll see it before you sign.`

---

## 4. 数字与单位排版

- **金额**:千分位逗号,符号在后空一格 — `1,250.80 ZEN`。
- **汇率**:6–8 位小数 — `1 ltZEN = 1.04231 ZEN`(精度见 uiux-spec §8.3)。
- **份额**:整数千分位 — `1,200,000 ltZEN`,作次要灰字。
- **预估值**:前缀 `≈` — `≈ 520.5 ZEN`;真实余额不加。
- **百分比**:一位小数 — `6.8%`;APY 永远带 `(trailing)` 或 tooltip 限定。
- **大数缩写**(移动端):`1.2M ZEN`,tooltip 给全值。
- **地址**:`0x12ab…cd34`(前 4 后 4),旁置 copy 图标。

---

## 5. 视觉语言

### 5.1 基调

- **氛围**:clean, financial-grade, trustworthy。留白充足,数据为主角,避免花哨渐变与 meme 元素。
- **数据可视化优先**:hero 汇率与复利曲线是视觉重心,其余克制。

### 5.2 色彩语义(语义先行,具体色值由设计系统定)

| 语义 | 用途 | 约束 |
|------|------|------|
| Primary/Brand | 主 CTA、汇率高亮、曲线主线 | 单一主色,贯穿 |
| Positive | 增值、成功、复利面积 | **不作唯一信号**,须配图标/文字(色盲友好) |
| Neutral | 正文、次要数据 | 高对比正文 |
| Warning | 不可逆操作、暂停态 | 谨慎使用,不滥用红 |
| Error | 系统错误 | 仅真错误;用户取消用 neutral |
| Chain accents | Horizen / Base 区分 | 各一辅助色,用于链选择器与跨链流 |

- 对比度满足 WCAG AA;深浅色主题都要定义。

### 5.3 复利曲线视觉规范

- 主线(`convertToAssets`):brand 色,2px,平滑。
- "不复投"对照线:neutral 虚线;两线间张口用低饱和 positive 填充(透明度低)。
- Harvest 标记:小圆点 + hover 卡片(`Compounded ≈ X ZEN`)。
- 切忌把 harvest 画成竖直台阶(见 dashboard-design §0)。
- live 末点:轻微脉冲,`prefers-reduced-motion` 下关闭。

### 5.4 动效(Motion)

- 克制、功能性:数字 live 滚动用 count-up,过渡 ≤300ms。
- 成功态轻确认(check 微动),不放烟花。
- 全部动效尊重 `prefers-reduced-motion`。

### 5.5 图标与字体

- 图标:线性、统一描边;链 logo 用官方 Horizen / Base 资产。
- 字体:**数字用等宽或 tabular-figures**,避免 live 滚动时宽度抖动;正文用清晰无衬线。

---

## 6. 文案禁忌(Don'ts)

- ❌ 收益承诺:"guaranteed", "risk-free", "earn 7%"(用 `APY (trailing)` + `≈`)。
- ❌ Hype 用语:"🚀", "moon", "ape in", "insane/crazy APY"。
- ❌ 把 harvest 描述为"价值跳涨 / instant boost"。
- ❌ 用裸 ltZEN 份额数字作主价值(必须 ZEN 价值;见 uiux-spec §0)。
- ❌ 暗示可在 Base 赎回。
- ❌ 误导跨链会改变价值。
- ❌ 中文混入 UI(本产品 UI 全英文)。
- ❌ 责备式错误文案("You entered an invalid amount")→ 改中性("Enter an amount up to your balance")。

---

## 7. 文案 QA checklist(交付前)

- [ ] 全部 UI 字符串为英文,无中文残留。
- [ ] 品牌拼写符合 §0(`stLighter` / `ltZEN` / `ZEN` / `Horizen` / `Base`)。
- [ ] 所有收益/预估值带 `≈` 或 `(trailing)` 限定,无承诺式表述。
- [ ] 价值展示用 ZEN,裸份额仅作次要信息。
- [ ] 错误文案中性、可操作,区分用户取消 vs 系统错误。
- [ ] Base 语境正确引导"bridge back to Horizen to redeem"。
- [ ] 数字排版符合 §4(空格、小数位、千分位、`≈`)。
- [ ] 关键动效有 `prefers-reduced-motion` 回退。
