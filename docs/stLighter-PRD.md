# stLighter — Lighter for Horizen Staking Program

## 产品 & 需求说明书(Phase 1)

> **状态**:初稿,基于 `docs/Lighter-Bridge-Zen-Staking.md` 的产品构思 + 与产品方的多轮决策确认编写。
> **底层依赖**:本协议构建于 `ZenStaker`(见 `docs/ZenStaker-Phase1-PRD.md`)之上。
> **跨链前提(已确认)**:Horizen mainnet 已部署 LayerZero V2 Endpoint 与 DVN 等基础设施;Base 亦原生支持。OFT 部署与接线 **无需 LayerZero 官方审批**(permissionless),由项目方自持 owner/delegate 密钥完成。
> 标注 **[需确认]** 的条目为待产品方补充的开放项。

---

## 1. 产品概述

stLighter 是部署在 **Horizen mainnet(基于 Base 的 L3 应用层)** 上的 **ZEN 流动性质押(liquid staking)协议**。它在已审计的 `ZenStaker` 之上做一层池化包装:

- 用户存入 ZEN,获得池化质押凭证代币 **ltZEN**。ltZEN 是 **LayerZero V2 OFT**,首发即原生跨 Horizen 与 Base 两链。
- 协议作为 ZenStaker 的**单一存款人(single depositor)**持有一个聚合质押头寸,代所有用户质押。
- 质押奖励(ZEN)由协议自动复投回 ZenStaker,持续抬高每份 ltZEN 可兑换的 ZEN 数量。奖励的源头是 ZenStaker 的 reward notifier,资金来自 **Horizen DAO / 基金会及其治理机构**的质押激励;stLighter 作为该 deposit 的 claimer 被动接收并复投。
- 用户持有 ltZEN 即可在 Horizen 与 Base 的 DeFi 中自由流通、转账、授权、跨链,同时持续享受质押收益,无需手动 claim。

**类比**:Lido 的 wstETH / Compound 的 cToken —— 份额价值随收益上涨,持有数量不变。

### 1.1 核心价值

| 痛点 | stLighter 的解法 |
|------|------------------|
| 原生质押头寸(ZenStaker deposit)不可转让、不可组合 | ltZEN 是标准 ERC20,可转账、可进 DeFi |
| 需手动领取并复投奖励 | 协议自动复投,收益反映在兑换率 |
| 单个用户与 ZenStaker 交互产生多笔 deposit、难以管理 | 协议聚合为单一头寸,用户只面对 ltZEN |

### 1.2 设计原则

- **完全开源**。
- **不改动 ZenStaker**:stLighter 是 ZenStaker 的纯外部调用者,复用其审计过的写入路径(`stake` / `stakeMore` / `withdraw` / `claimReward`)。
- **质押单点结算,代币多链流通**:质押/赎回的核心写入逻辑只在 Horizen(ZenStaker 所在地)发生,避免核心资金路径跨链的异步复杂度;ltZEN 作为 OFT 在 Horizen + Base 两链原生流通。这是 LayerZero 跨链 LST(如 OFT 版 wstETH)的成熟范式。
- **Phase 1 不含 Base 端发起 staking**:在 Base 直接存入 ZEN 并经跨链消息驱动 Horizen 质押,留待 Phase 2;但 ltZEN 的 OFT 跨链与两链流通在 Phase 1 即交付。

## 2. 关键决策(已确认)

| 维度 | 决策 | 说明 |
|------|------|------|
| 代币计价模型 | **份额型 / ERC4626** | ltZEN 余额恒定,兑换率随复投上涨;直接继承 OZ ERC4626 + ERC20Permit |
| 协议费 | **可配置,启动为 0,硬上限 2000 bps** | 预留 `feeBps` + `feeRecipient`,上线设 0,治理可调但不得超过 20%(2000 bps 常量上限) |
| 赎回模型 | **即时赎回** | burn ltZEN 后立即从 ZenStaker 提取 ZEN 返还用户,与 ZenStaker 无锁定特性一致 |
| 跨链路径 | **ltZEN 作为 LayerZero V2 OFT,Phase 1 首发即集成** | 原生 OFT,Horizen + Base 两链,mint/burn 式跨链;质押结算仍单点在 Horizen。无需 LayerZero 审批 |
| Dashboard 数据 | **读两链真实链上状态(非纯索引器)** | ltZEN 在两链都是真实合约,Dashboard 直接读链上余额/汇率,索引器仅做查询加速与事件聚合 |

## 3. 范围边界(Phase 1)

**做:**
- Horizen 上的 ZEN 存入(deposit)→ mint ltZEN
- ltZEN burn → 即时赎回 ZEN(redeem)
- 自动复投奖励、ERC4626 兑换率
- ltZEN 的 ERC20 + EIP-2612 permit 能力
- **ltZEN 作为 LayerZero V2 OFT,在 Horizen ↔ Base 间跨链转移(mint/burn 式)**
- **Base 端部署 ltZEN OFT 合约,使其在 Base 原生流通、可进 Base DeFi**
- 协议费基础设施(置 0)
- 多链 Dashboard:读两链真实链上状态 + 索引器加速

**Phase 1 不做(留待后续阶段):**
- 在 Base 链上发起 stake/redeem(经跨链消息转发到 Horizen 质押)——核心写入路径跨链,Phase 2 评估
- 协议费的实际收取(参数置 0)
- 治理投票委托(继承 ZenStaker Phase 1 的非投票 surrogate)

> **ltZEN 的兑换率锚定在 Horizen**:ERC4626 的 `totalAssets/totalSupply` 计算依赖 ZenStaker 头寸,只在 Horizen 上有意义。Base 上的 ltZEN 是同一份额代币的跨链镜像(OFT 在源链 burn、目标链 mint,总量守恒),其"可兑换多少 ZEN"始终由 Horizen 端的兑换率定义。**赎回必须在 Horizen 进行**:用户若持有 Base 上的 ltZEN,需先经 OFT 桥回 Horizen 再 redeem(Phase 1 体验如此;Base 端直接赎回属 Phase 2 的跨链写入范畴)。

## 4. 代币设计:ltZEN

### 4.1 代币参数

名称 stLighter Staked ZEN(全称待定),**symbol `ltZEN`,decimals `18`(对齐 ZEN)**。

> **⚠️ 份额单位 ≠ ZEN 数量(前端需归一化展示)**:因采用虚拟偏移 `DECIMALS_OFFSET = 3`(§5.5),**ltZEN 份额以比 ZEN 大 10³ 倍的单位计**(存 1000 ZEN 约得 1000×10³ = 1,000,000 ltZEN 记账单位)。这是 ERC4626 份额的正常特性,但意味着用户钱包里看到的 ltZEN 余额数字 ≠ 其可兑换的 ZEN 数量。前端 Dashboard **必须用 `convertToAssets(balance)` 展示"可兑换 ZEN 价值",而非裸份额数字**,否则用户会误读。decimals 仍为 18,offset 体现在数量级而非小数位。

### 4.2 架构:金库(Horizen)与份额代币(OFT)的分离

ltZEN 既要承载 **ERC4626 份额语义**,又要作为 **LayerZero OFT 跨链**。二者有一个根本张力:ERC4626 假定"份额代币 = 持有底层资产的金库合约",而底层 ZEN 只存在于 Horizen 的 ZenStaker;Base 上不可能有金库。因此采用 **hub-and-spoke(中心-卫星)** 结构:

| | Horizen(hub) | Base(spoke) |
|---|---|---|
| ltZEN 形态 | **金库 + OFT**:ERC4626 份额会计 + OFT 跨链能力 | **纯 OFT 份额代币**:仅 ERC20 + OFT + Permit,无金库逻辑 |
| 底层资产 | ZEN 部署在 ZenStaker | 无(Base 无 ZEN 质押) |
| deposit / redeem | ✅ 在此结算 | ❌(需先桥回 Horizen) |
| 兑换率定义 | ✅ 由此处 `totalAssets/totalSupply` 定义 | 镜像引用 Horizen 值(只读展示) |
| 跨链 mint/burn | OFT 标准:跨出时 burn、跨入时 mint | 同左 |

- **总量守恒**:OFT 的跨链是"源链 burn、目标链 mint",两链 ltZEN 总供应量之和恒等于金库已发行份额数,兑换率不受跨链影响。
- **兑换率单一真相源**:无论 ltZEN 在哪条链,1 ltZEN 可兑换的 ZEN 数量永远由 Horizen 金库的 `convertToAssets(1)` 定义。Base 端仅展示该值,不自行计算。

> **⚠️ 兑换率分母必须用"全局已发行份额",不能用本地 `totalSupply()`(已定稿:方案 X)**:用户把 ltZEN 从 Horizen 桥到 Base 时,OFT 在 Horizen `burn`、在 Base `mint`,会使 **Horizen 本地 `LT_ZEN.totalSupply()` 减少而 `totalAssets` 不变**,若直接用本地供应量做分母,兑换率会被错误推高。因此 stLighter 协议合约**自维护一个 `issuedShares` 计数器**:仅在 `deposit`(+)/`redeem`(-)时增减,跨链转移完全不影响它。`convertToAssets/convertToShares` 一律以 `issuedShares` 为分母,这才是两链一致的全局份额总量。(备选方案 Y——跨链消息聚合各链供应——复杂且有延迟,不采用。)

> **实现取舍(已确认)**:**金库会计放在 stLighter 协议合约**(实现 ERC4626 风格的 deposit/redeem/convertToAssets 与全部兑换率逻辑),**ltZEN 为纯 OFT 份额代币**(`OFT` + `ERC20Permit`,仅受控 mint/burn,不含金库逻辑)。理由:`ERC4626` 与 LayerZero `OFT` 均为重继承基类,分离会计层与代币层可避免多重继承冲突,并让 ltZEN 在两链保持完全一致的精简实现(Base 端直接复用同一份 OFT 合约)。代价是协议不直接暴露标准 `ERC4626` 的 `asset()/vault` 接口,但对外仍提供等价的 `convertToAssets/convertToShares/previewDeposit/previewRedeem` 视图。

### 4.3 继承与 mint/burn 权限

- ltZEN 继承:`OFT`(LayerZero V2,内含 ERC20)+ `ERC20Permit`(EIP-2612)。
- mint/burn 入口由**受控 `minter` 角色**把关:
  - Horizen:stLighter 协议合约持 mint/burn 权(deposit 时 mint、redeem 时 burn);LayerZero Endpoint 在 OFT 跨链路径上 burn/mint(标准 OFT 机制)。
  - Base:仅 LayerZero Endpoint 通过 OFT 路径 mint/burn,无本地 deposit/redeem。
- OFT 的 `owner/delegate`(setPeer、DVN 配置等)由治理(多签 + 时间锁)持有。
- **DVN / 安全栈配置**:跨链验证者(DVN)选择与确认数由项目方自行配置(permissionless 的另一面是安全责任自负),需作为独立安全设计项评审。

## 5. 核心机制

### 5.1 协议作为 ZenStaker 的单一存款人

stLighter 协议合约在 ZenStaker 中维护**一个聚合 deposit**:

- 首次有用户存入时,协议调用 `ZenStaker.stake(amount, delegatee)` 创建该 deposit,记录返回的 `depositId`。
- 协议把自己设为该 deposit 的 **owner 与 claimer**,从而独占管理权与奖励领取权。
- delegatee 取值 **(已确认:协议合约自身地址)**:Phase 1 ZenStaker 使用非投票 surrogate,delegatee 不产生投票效果,仅作为 surrogate 的分桶键。协议聚合头寸固定以**协议合约地址**为 delegatee,语义清晰(该 surrogate 归 stLighter 托管),不影响收益与安全。未来 Phase 2 若开启真实投票委托,再透传用户 delegatee。

### 5.2 兑换率与 totalAssets

ERC4626 的核心是 `shares ↔ assets` 的换算,依赖 `totalAssets()`:

```
totalAssets() = 协议 deposit 在 ZenStaker 的 balance + 该 deposit 的 unclaimedReward
```

这两项均可通过 ZenStaker 的 `getDepositInfo(depositId)` 一次读取(`balance` 与 `unclaimedRewards` 字段)。

- **存入**:`shares = assets × totalSupply / totalAssets`(首存特殊处理,见 §5.5)。
- **赎回**:`assets = shares × totalAssets / totalSupply`。
- 兑换率 = `totalAssets / totalSupply`,随每次复投单调上升(无亏损情形下)。

> **收益展示(APR)**:不设固定目标 APR,前端**动态跟随链上实际兑换率变化**计算并展示(如按近 N 天兑换率增幅年化)。由于奖励自动复投,实际收益预计**略高于直接在 ZenStaker 质押**(复利效应),但本质受 Horizen DAO 注入的奖励速率驱动。

### 5.3 流程:存入(deposit / stake)

1. 用户授权并把 `amount` ZEN 转入协议(或通过 ltZEN 的 permit + 一笔交易完成)。
2. 协议按当前兑换率计算应 mint 的 ltZEN 份额。
3. 协议把 ZEN 通过 `ZenStaker.stakeMore(depositId, amount)` 投入聚合头寸(首存用 `stake`)。
4. 协议 mint ltZEN 给用户。

> ZenStaker 支持 `permitAndStake`,协议层可据此提供"一笔交易完成授权+存入"的入口。

### 5.4 流程:复投(compound / harvest)

因为 ZenStaker 的 stake 与 reward **同为 ZEN**,复投是闭环:

1. 协议调用 `ZenStaker.claimReward(depositId)` 领取累积的 ZEN 奖励到协议合约。
2. 协议(扣除协议费后,Phase 1 费=0)调用 `stakeMore(depositId, claimed)` 把奖励重新质押。
3. ltZEN 的 `totalSupply` 不变,`totalAssets` 增加 → 每份 ltZEN 价值上升。

**触发方式(已确认):permissionless `harvest()` + stake/redeem 时自动 harvest(A + B)。**
- 提供独立的 permissionless `harvest()`,任何人(含 keeper)可随时调用,把 `unclaimedReward` 领回并 `stakeMore` 复投。
- 每次 `deposit` 与 `redeem` 流程内部**先执行一次 harvest**,再处理用户的存入/赎回。这保证:
  1. 兑换率在用户操作时已反映最新已实现收益;
  2. 赎回前 deposit 的 `balance` 已纳入全部已实现奖励,避免大额赎回被未复投奖励卡住(见 §5.6)。

> 注意:即便两次 harvest 之间,`unclaimedReward` 已计入 `totalAssets`(§5.2),兑换率不会失真;harvest 把"未领取奖励"转为"已质押本金",影响的是复利计息基数与 `withdraw` 可提取上限,而非估值准确性。

### 5.5 首存通胀攻击防护

**双重防护,且攻击面天然小于标准 ERC4626(已由测试坐实):**

1. **`totalAssets` 不读任何实际代币余额**——它只读 ZenStaker 的 `getDepositInfo(depositId)` 返回的 `balance`(一个存储记账值)+ `unclaimedReward`。因此经典的"直接捐赠代币拉高兑换率"向量**根本打不进来**:无论把 ZEN 转给协议合约、还是转给实际持币的 delegation surrogate,`totalAssets` 都不变。唯一能增加 `totalAssets` 的路径是 `stake/stakeMore`(同时正确增发份额)或 `notifyReward`(受权限控制的正常收益)。
2. **虚拟份额偏移**(`DECIMALS_OFFSET = 3`,OZ ERC4626 风格):在上述基础上提供第二层冗余,确保 `issuedShares == 0` 起步时首存者无法通过取整把后存者份额归零。

> 测试 `test/StLighter.t.sol::InflationAttack` 三个用例验证:①捐赠给协议合约 ②捐赠给 surrogate 均不影响 `totalAssets`;③完整攻击场景(1 wei 首存 + 双路径各捐 5000 ZEN)下受害者仍得公平份额并能足额赎回。因攻击面小,`DECIMALS_OFFSET` 无需取大值,当前 3 已足够(份额单位 = 资产 × 10³,见 §4.1 展示说明)。

### 5.6 流程:赎回(redeem / withdraw)

1. 用户 burn `shares` 份 ltZEN。
2. 协议按当前兑换率算出应返还的 ZEN `assets`。
3. 协议调用 `ZenStaker.withdraw(depositId, assets)` 从聚合头寸提取(必要时先 harvest 以确保 deposit 余额足够)。
4. 协议把 ZEN 转给用户。

即时完成,无锁定期、无排队——与 ZenStaker 即时提取特性一致。

> **赎回顺序(已确认)**:`redeem` 流程**先 harvest**(`claimReward` + `stakeMore` 把全部已实现奖励复投回 deposit 本金),再按当前兑换率计算 `assets` 并 `withdraw`。这样 `withdraw` 可提取上限 = deposit 的 `balance` 已包含所有已实现收益,大额赎回不会被未复投奖励卡住。harvest 与 §5.4 的策略一致。

## 6. Gasless 交易(meta-transaction)

> **动机**:Horizen 现部署在 L2/L3 应用层,目标用户多数不持有作为 gas 的原生 ETH。stLighter 让用户**仅凭链下签名**即可完成质押类操作:由 relayer 代付 ETH gas,协议再从用户的 ZEN 中扣除等值手续费补偿 relayer。新用户无需先持有 ETH 即可入场。

### 6.1 关键决策(已确认)

| 维度 | 决策 |
|------|------|
| 架构 | **自建 meta-tx 层**:EIP-712 typed-data 签名 + per-signer nonce + deadline,沿用审计基线 `StakerOnBehalf` 的范式(`SignatureChecker`,兼容 EOA 与 EIP-1271 合约钱包) |
| 费率定价 | **签名锁定 `maxFeeZen`**:用户在签名里写明本次操作最多愿付多少 ZEN 作 gas 费,relayer 实收 ≤ 该值;前端报价、合约不引入预言机 |
| relayer 授权 | **无许可**:任何人凭有效用户签名均可代发;费率上限由用户签名的 `maxFeeZen` 保护,无需信任特定 relayer |
| 首期范围 | **质押类操作**:`depositWithSig` / `redeemWithSig` / `harvest`(harvest 本就 permissionless,天然 gasless);ltZEN 纯转账的 gasless 留待后续(那种场景用户可能只有 ltZEN 无 ZEN,扣费来源不同) |

### 6.2 扣费来源(按操作不同)

gas 费始终以 **ZEN** 结算给 relayer,但来源随操作而异:

| 操作 | 用户提供 | 费用从何扣 |
|------|----------|-----------|
| `depositWithSig` | ZEN(转入协议) | 从转入的 ZEN 中先扣 `fee`,**剩余部分**才质押并据此 mint ltZEN |
| `redeemWithSig` | ltZEN(销毁) | 从赎回**产出的 ZEN** 中扣 `fee`,余额转给用户 |
| `harvest` | 无(permissionless) | 无需 meta-tx;relayer 自行决定是否代发,可由协议从复投奖励中预留极小激励(**[需确认]** 是否给 harvest 加 keeper 激励) |

### 6.3 签名结构(EIP-712)

每个 gasless 操作的 typed-data 至少包含:`操作参数` + `depositor/用户地址` + `maxFeeZen` + `nonce` + `deadline`。例如:

```
DepositWithSig(uint256 assets,address receiver,uint256 maxFeeZen,address user,uint256 nonce,uint256 deadline)
RedeemWithSig(uint256 shares,address receiver,uint256 maxFeeZen,address user,uint256 nonce,uint256 deadline)
```

- `maxFeeZen` 进入签名 → relayer 无法多扣;实收 `fee = min(relayer 申报, maxFeeZen)`,且 `fee` 应有合约级合理上限校验。
- `nonce`(per-user,复用 OZ `Nonces`)防重放;`deadline` 防过期签名被延迟提交。
- `SignatureChecker` 校验,兼容合约钱包(EIP-1271)。

### 6.4 流程示例:gasless deposit

```
1. 用户离线签 DepositWithSig(assets, receiver, maxFeeZen, user, nonce, deadline)
   并对 ZEN 给协议授权(用 ZEN 的 EIP-2612 permit 一并签,彻底免 on-chain approve)
2. relayer 上链调用 depositWithSig(...签名, ...permit), 自付 ETH gas
3. 协议校验签名/nonce/deadline → 用 permit 拉取 assets ZEN
4. 协议计算 fee(≤ maxFeeZen)→ 转 fee 给 relayer(tx.origin 或签名指定的 relayer 收款地址)
5. 用 (assets - fee) 走正常 deposit 路径:_harvest → 质押 → mint ltZEN 给 receiver
```

> **[需确认]** fee 的收款人:是 `msg.sender`(代发的 relayer)还是签名里另指定的 `feeReceiver`?无许可模式下通常付给 `msg.sender`。

### 6.5 安全考量(gasless 特有)

- **费用上限**:`maxFeeZen` 在签名内,且合约对 `fee` 设独立硬上限(防前端/relayer 合谋设过高 maxFeeZen 时仍有兜底)。
- **重放**:per-user nonce + deadline;跨链场景需确保 domain separator 含 chainId(EIP-712 标准已含)。
- **抢跑/审查**:无许可 relayer 降低单点审查风险;若某 relayer 不打包,用户可换 relayer 或自行上链。
- **fee 与 deposit 顺序**:必须"先扣 fee 再 mint 份额",且 fee 不计入 `totalAssets`/份额计算,避免稀释其他持有者。
- **零费回退**:若用户自己直接调用(非 gasless),`maxFeeZen=0`,不扣费——gasless 是可选叠加层,不破坏直接调用路径。

## 7. 架构与集成

```
   Horizen mainnet (L3)                                    Base
 ┌──────────────────────────────────────────┐      ┌────────────────────────┐
 │ 用户 ─stake/redeem─> stLighter 协议合约    │      │  ltZEN (OFT spoke)      │
 │                  │                          │      │  ERC20+OFT+Permit       │
 │   stake/stakeMore/withdraw/claimReward      │      │  仅跨链流通,无金库      │
 │                  ▼                          │      └───────────▲────────────┘
 │              ZenStaker ──> ZEN              │                  │
 │                  │                          │        LayerZero V2 OFT
 │     mint/burn(份额) ▼                       │        (burn 源链 / mint 目标链)
 │              ltZEN (hub: 金库会计 + OFT) ───┼──────────────────┘
 └──────────────────────────────────────────┘
```

- **Horizen(hub)**:stLighter 协议合约(deposit/redeem/harvest + ERC4626 会计)+ ltZEN(份额代币 + OFT)+ ZenStaker(已存在)。质押、赎回、复投、兑换率均在此结算。
- **Base(spoke)**:ltZEN OFT 合约,使份额代币在 Base 原生流通、可进 Base DeFi;无质押/赎回逻辑。
- **跨链**:LayerZero V2 OFT,mint/burn 式转移,总量守恒;DVN 安全栈由项目方配置,owner/delegate 由治理持有。
- **链下**:前端提供 Base/Horizen 网络切换;Dashboard 读两链 ltZEN 真实余额 + Horizen 兑换率,Goldsky 索引器做事件聚合与查询加速(非唯一数据源)。

## 8. 安全考量

- **信任假设**:协议合约是 ZenStaker 该 deposit 的唯一 owner/claimer,用户对 ZEN 的所有权完全由 ltZEN 份额代表。协议的 admin/升级权限由 **多签 + 时间锁(timelock)治理** 持有:特权操作(费率调整、合约升级、参数变更)须经多签发起并通过时间锁延迟生效,给用户留出退出窗口。
- **兑换率操纵**:`totalAssets` 依赖 ZenStaker 的 `balance` 与 `unclaimedReward`,均为受信合约只读值,不引入外部预言机,降低操纵面。
- **首存攻击**:见 §5.5,用 OZ 虚拟份额偏移。
- **重入**:deposit/redeem 涉及外部 ZEN 转账与 ZenStaker 调用,需遵循 checks-effects-interactions 并复用 OZ 的 `ReentrancyGuard`。
- **协议费上限**:`feeBps` 设硬上限常量 **2000 bps(20%)**,治理调整不得超过该值,防掠夺性费率。
- **暂停(已确认:仅暂停 deposit)**:提供 emergency pause,**仅冻结 deposit/mint 入口,赎回(redeem/burn)与 harvest 始终可用**,确保用户在任何情况下都能退出。pause 权限由治理(多签 + 时间锁)持有。**[需确认]** 是否额外设一个可即时触发暂停的 guardian(不经时间锁)?
- **跨链(OFT)风险**:
  - **DVN 安全配置**:permissionless 部署意味着安全责任自负。DVN 选择与确认阈值直接决定桥的安全性,需独立评审;建议多 DVN 冗余。
  - **peer 配置**:`setPeer` 错配或被恶意篡改会导致跨链资产损失,故 owner/delegate 必须由治理(多签+时间锁)严格把关。
  - **兑换率跨链一致性**:Base 端 ltZEN 不自行计算兑换率,只引用 Horizen 值,避免两链估值漂移被套利。
  - **暂停与跨链**:emergency 情况下,OFT 跨链是否需要可暂停?**[需确认]**(注意:暂停跨链可能困住 Base 端用户,需权衡)。

## 9. 验收标准(待实现后补全测试映射)

- 首存按虚拟份额偏移正确 mint,无通胀攻击窗口
- 多用户按比例公平获得份额;复投后兑换率上升而份额不变
- redeem 即时返还正确数量 ZEN,含未复投奖励的边界情形
- 协议费=0 时 100% 奖励归 ltZEN 持有者;费>0 时按 bps 正确分账给 feeRecipient
- ltZEN 的 permit 签名授权可用
- 协议作为单一 depositor 在 ZenStaker 中的 balance/earningPower 与 ltZEN totalAssets 一致
- ltZEN 跨链:Horizen → Base 转移后两链总供应量守恒;Base 端余额正确 mint、源链正确 burn
- Base 端 ltZEN 引用的兑换率与 Horizen 金库一致(无两链估值漂移)
- 错误 peer / 未配置 DVN 时跨链调用安全失败(不丢资产)

### 9.1 不变量(invariant 套件,`test/StLighter.invariants.t.sol`)

CI 强度(1000 runs × 50000 calls)下锁死的核心会计性质:

1. **`issuedShares == ltZEN.totalSupply()`**(单链无跨链时)——份额计数器与代币供应严格相等,是 §4.2 方案 X 跨链兑换率模型的本地正确性基线。
2. **持有者价值不减**:一个存入后从不赎回的"锚定持有者",其可兑换 ZEN 永不下降(奖励只会推高)。
3. **不超额报告**:`convertToAssets(totalShares) ≤ totalAssets`,协议不会声称偿付能力超过实际持有。
4. **协议不滞留 ZEN**:除 ≤ 1e6 wei 取整灰尘外,ZEN 全部质押进 ZenStaker,协议合约自身无凭空余额。
5. **`totalAssets` 严格等于** ZenStaker 聚合 deposit 的 `balance + unclaimedReward`。

> **⚠️ 规格澄清(invariant 测试得出的认知)**:"兑换率单调不减"**不能**用固定探针 `convertToAssets(1e18)` 的单调性来表达。因 virtual offset 令 `convertToAssets(x) = x·(totalAssets+1)/(issuedShares+10³)` 不是恒定单位价格——当池子规模随他人存取剧烈变化(尤其接近清空)时,该探针会数学性地上下抖动(实测幅度可达 ~1e15 wei),**但这不代表持有者亏钱**。真正应锁死的是上面第 2 条(锚定持有者价值不减)。早期用探针单调性表述会得到假阳性失败,已纠正。原 §9 第二条验收标准"复投后兑换率上升而份额不变"应据此理解为"持有者可兑换价值不减"。

## 10. 开放问题汇总

**已确认:**
- ✅ harvest 触发:permissionless `harvest()` + stake/redeem 自动 harvest(§5.4)
- ✅ 赎回前强制 claim + restake(§5.6)
- ✅ 治理:多签 + 时间锁(§7)
- ✅ 奖励源头:Horizen DAO / 基金会及治理机构,经 ZenStaker notifier 注入(§1)
- ✅ delegatee:固定为协议合约地址(§5.1)
- ✅ 紧急暂停:仅冻结 deposit/mint,赎回与 harvest 始终可用(§7)
- ✅ 协议费:启动 0,治理可调,硬上限 2000 bps(20%)(§2 / §7)
- ✅ APR:不设固定目标,前端动态跟随实际兑换率,复投致略高于裸质押(§5.2)
- ✅ 代币:symbol `ltZEN`,decimals `18`(§4.1)
- ✅ 跨链:ltZEN 作为 LayerZero V2 OFT,Phase 1 首发即集成 Horizen + Base;质押结算单点在 Horizen;Horizen 端点/DVN 已就绪、OFT 部署无需审批(§3 / §4 / §6)
- ✅ Dashboard:读两链真实链上状态(ltZEN 在两链均为真实合约),索引器仅做查询加速(§3 / §6)

**仍需产品方补充:**
1. **暂停 guardian**:除治理(多签+时间锁)外,是否设可**即时**触发暂停的 guardian 角色?(§7)
2. **ltZEN 代币全称**:symbol 已定 `ltZEN`,完整 name 字符串待定(如 "Lighter Staked ZEN")。
3. **协议合约 / ltZEN 可升级性**:是否采用代理(proxy)可升级,还是不可升级 + 迁移式治理?(影响信任模型与审计范围)
4. **金库实现形态**:✅ 已定稿——会计层在 stLighter 协议合约,ltZEN 纯 OFT + EIP-2612(§4.2)。
5. **OFT 安全栈**:DVN 选型与确认阈值(几个 DVN、多少确认)。
6. **跨链是否可暂停**:emergency 下 OFT 跨链路径是否需要 pause?(权衡:暂停会困住 Base 端用户)。
7. **Base 端赎回体验**:Phase 1 Base 用户赎回需先桥回 Horizen,前端是否提供"一键桥回并赎回"引导?(纯前端编排,非合约)

**编写部署脚本/测试骨架时新发现的问题:**
8. **⚠️ issuedShares 与 ZenStaker `withdraw` 的精度/取整一致性**:✅ 已定稿——`convertToAssets` 在赎回路径**向下取整(favor 协议)**,避免提空导致 revert / 灰尘。已在测试 `test_LargeRedeemNotBlockedByUnharvestedRewards` 标记。
9. **⚠️ 全额赎回 / 最后一人退出**:✅ 已定稿——**最后一人退出可取空协议**(`issuedShares` 归零时 `totalAssets` 全额可提,不留残款)。实现需特判 last-exit 路径,把含 virtual offset 与 reward 灰尘在内的全部余额结算给最后赎回者。
10. **首存通胀攻击的 donation 向量**:✅ 已坐实——`totalAssets` 只读 ZenStaker 记账值,捐赠 ZEN 给协议或 surrogate **均不影响** `totalAssets`,攻击面小于标准 ERC4626;叠加 `DECIMALS_OFFSET=3` 虚拟偏移,首存攻击不成立。已由 `test/StLighter.t.sol::InflationAttack` 三个用例验证(§5.5)。
11. **部署循环依赖(已在脚本中解决)**:`StLighter.LT_ZEN` 为 immutable、`LtZEN.minter` 须为 StLighter,互相依赖。解法:ltZEN 先以 minter=0 部署 → 部署 StLighter → `setMinter(protocol)` → 移交 owner 给治理。见 `script/DeployStLighterHorizen.s.sol`。
12. **harvest 与 pause 的关系**:`harvest()` 在暂停期间应仍可调用(复投不应被冻结),与 deposit 的 pause 解耦。已在测试 `test_RedeemAvailableWhilePaused` 体现,但 harvest 的 pause 豁免需在实现中确认。
