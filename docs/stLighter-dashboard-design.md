# stLighter Dashboard — 复利透明度可视化设计

> **用途**:为 ltZEN dApp dashboard 的"汇率 / 复投 / 复利"展示提供产品与数据规格。面向前端 UI/UX 与 Goldsky 指标实现。
> **关联文档**:`docs/stLighter-PRD.md`(需求)、`abi/README.md`(ABI 与指标来源)、`AUDIT_DELTA.md`(合约范围)。
> **最后更新**:2026-06-15

---

## 0. 一条决定叙事的技术事实(先读)

`convertToAssets()` 汇率 **不是在 harvest 时跳涨的**,它**每个区块都在平滑上升**。

原因:`totalAssets() = staked balance + unclaimed`,底层 ZenStaker 的 `unclaimed`(未领奖励)按秒累加。因此:

| 时刻 | `totalAssets` | `issuedShares` | 汇率曲线 |
|------|---------------|----------------|----------|
| 两次 harvest 之间 | 随 `unclaimed` 线性增长 | 不变 | **直线上升** |
| harvest 那一刻 | 不变(`unclaimed → 0`,`staked += unclaimed`) | 不变 | **不跳涨**(rate-neutral) |
| harvest 之后 | 本金更大 → earning power 更大 | 不变 | **斜率变陡** |

**结论**:汇率曲线是 **分段线性、每次 harvest 斜率递增 → 整体上凸(convex)**。这就是复利的几何形态。

> 由此得到比"汇率跳涨"更真实也更高级的故事:**harvest 不让份额瞬间变值钱,而是让份额此后增值得更快**。每个 harvest 点是曲线的一个"加速拐点",harvest 越频繁越逼近指数曲线。**严禁把 harvest 画成跳涨**——既不符合合约行为,也会被懂行的人质疑。

---

## 1. 产品概念

- **主角指标 = `convertToAssets()`(份额单价)**。它直接回答用户唯一关心的问题:"我的 1 ltZEN 现在值多少 ZEN"。汇率单调上升即收益。
- **`rewardPerTokenAccumulated()` 不是主角**。它是底层 ZenStaker 的全局累加器,放大了 `SCALE_FACTOR = 1e36`,是天文数字,对普通用户零意义。它的产品价值是 **开源透明的"原始凭证"**:给审计者、集成方、不信任前端的人核对"我们没篡改"。退居"链上数据/极客"折叠区,并配区块浏览器直链。
- **复利魅力的可视化载体** = 汇率历史曲线的"上凸"形态 + harvest 拐点 + 与"不复投假想线"的张口面积。

---

## 2. UI/UX 布局(指标分层)

```
┌─ 英雄位 ───────────────────────────────────┐
│  1 ltZEN = 1.0423 ZEN      ↑ +0.0001 (live)     │  ← convertToAssets,主角,带 live 动效
│  尾随 30d APY: 6.8%   (基于历史实现,非承诺)      │  ← 由汇率历史反推,必须标注窗口
└──────────────────────────────────────────┘
┌─ 你的持仓 ──────────────────────┐
│  1,200 ltZEN  ≈  1,250.8 ZEN                       │
│  累计收益  +50.8 ZEN(自存入)                       │
└────────────────────────────┘
┌─ 复利曲线(核心可视化) ──────────────────────┐
│  convertToAssets 历史折线 + harvest 标记 +        │
│  "不复投"假想虚线,两线张口面积 = 复利多赚部分    │
│  时间轴: 24h / 30d / 全部                          │
└──────────────────────────────────────────┘
┌─ 透明度 / 极客区(默认折叠) ──────────────────┐
│  rewardPerTokenAccumulated(): 4.21e52  [↗ 链上]   │  ← 原始累加器
│  issuedShares / totalAssets / 上次 harvest 时间   │
└──────────────────────────────────────────┘
```

### 核心可视化:复利曲线细节

- 一条 **`convertToAssets()` 历史折线** 即承载全部魅力。
- 在 harvest 时间点打**标记**(数据来自 `Harvested` 事件),hover 显示"本次复投 X ZEN"。
- 叠加一条 **虚线 = 不复投的假想线性增长**;两线之间的**张口面积 = 复利多赚的部分**。把抽象复利变成一眼可见的面积。
- 时间轴切换 24h / 30d / 全部。

### APY 计算(诚实口径)

不展示任何前瞻 / 承诺收益。用**已实现汇率增长**反推尾随 APY:

```
APY = (rate_now / rate_{t-Δ}) ^ (365 / Δ_days) − 1
```

- 提供 **7d / 30d 窗口切换**;窗口越短越受 harvest 节奏抖动影响,默认 30d 较稳。
- 标注"基于历史实现,非未来承诺"。

---

## 3. 数据指标来源及含义

### 3.1 实时(前端直接 RPC `eth_call`,逐区块刷新)

| 展示值 | 合约调用(Horizen hub proxy) | 含义 | 备注 |
|--------|------------------------------|------|------|
| 份额单价 | `convertToAssets(1e18)` | 1 ltZEN 当前可兑换的 ZEN | 主角;每区块平滑上升 |
| 反向单价 | `convertToShares(1e18)` | 1 ZEN 当前可铸的 ltZEN | 存款预览用 |
| 总资产 | `totalAssets()` | 聚合 deposit 的 `staked + unclaimed` | 曲线斜率来源 |
| 总份额 | `issuedShares()` | ltZEN 总供应(跨链不变分母) | harvest 时不变 |
| 原始累加器 | `ZenStaker.rewardPerTokenAccumulated()` | 每单位 earning power 累计奖励 ×1e36 | 透明度凭证,非主角 |
| 用户持仓 | `LtZEN.balanceOf(user)` | 用户 ltZEN 余额 | × 份额单价 = ZEN 估值 |

> `convertToAssets` 因每区块上升,"live ticking" 动效是**真实**的,非装饰。

### 3.2 历史(必须靠 Goldsky 指标,链上不存历史汇率)

两种采样叠加,保证曲线既有拐点又不失真:

| 采样方式 | 触发 | 落盘字段 |
|----------|------|----------|
| **事件驱动** | `Harvested` / `Deposited` / `Redeemed` 事件 | `rate=convertToAssets(1e18)`, `totalAssets`, `issuedShares`, `blockNumber`, `timestamp`,(harvest 额外存 `claimed`/`restake`) |
| **定时补点** | 固定间隔(如每小时) | 同上 | 

- 历史 APY 由这张快照表两点反推(见 §2 公式)。
- 仅事件驱动会导致两次 harvest 间的直线段缺点 → 定时补点补齐。

---

## 4. 容易翻车的点(实现 checklist)

1. **别把 harvest 画成跳涨** —— 它 rate-neutral(§0)。harvest 是"斜率加速拐点",不是台阶。
2. **精度** —— `convertToAssets` 含 `DECIMALS_OFFSET = 3` 的 virtual offset 与 floor 取整;展示需 **6–8 位小数**才能看出 live 上升,否则首存初期变化不可见。
3. **双链一致** —— Base 上 ltZEN 只是 OFT 份额,**无汇率源**。汇率**只能从 Horizen hub 读**。Base dashboard 要么跨链读 Horizen,要么明确标注"汇率结算在 Horizen"。
4. **首存期** —— `issuedShares` 很小时汇率对单笔 harvest 敏感,APY 可能剧烈波动。首日用更长窗口或隐藏 APY,标"数据积累中"。
5. **透明区直链** —— `rewardPerTokenAccumulated()` 旁放区块浏览器链接([ZenStaker on Caldera explorer](https://horizen.calderaexplorer.xyz/)),让用户能独立核对前端展示值。

---

## 5. 一句话总结

**`convertToAssets()` 当英雄(逐区块 live)+ 上凸复利曲线讲故事(harvest 拐点 + 不复投对照面积)+ `rewardPerTokenAccumulated()` 退居透明度凭证。** harvest 的故事是"加速增值",不是"瞬间变值钱"。
