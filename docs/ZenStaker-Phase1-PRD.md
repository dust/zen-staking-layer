# ZenStaker Phase 1 — 产品文档(逆向自代码)

> **来源说明**:本文档由 `hzn-2898/additional-view-functions` 分支相对 `main` 的改动逆向整理而成,
> 依据为 `AUDIT_DELTA.md`、`src/ZenStaker.sol`、`test/ZenStaker.t.sol`、`script/*.s.sol` 及其 NatSpec 注释。
> 标注 **[需确认]** 的条目是代码无法证实的推断,需产品方核实。

---

## 1. 产品概述

ZenStaker 是 Horizen 的 **ZEN 单币质押产品(Phase 1)**:用户质押 ZEN 代币,赚取以 ZEN 计价的奖励(ZEN-on-ZEN staking)。

- 底层基于已审计的 Tally / ScopeLift `Staker` 库(v1.0.1,commit `b5b6f98`),Phase 1 不对其写入逻辑做任何改动。
- 质押与提取**即时生效,无锁定期**。
- 奖励按"份额 × 时间"在固定周期内线性发放,机制源自 Synthetix StakingRewards。
- 治理层面由 Horizen 多签(admin)控制奖励来源等少量管理功能。

**目标用户 [需确认]**:持有 ZEN 的代币持有者,希望通过质押获得 ZEN 收益。

## 2. 范围边界(Phase 1 明确"不做"的事)

代码以硬编码方式锁死了以下决策,这是 Phase 1 范围的核心:

| 决策 | 取值 | 含义 |
|------|------|------|
| 治理投票委托 | 关闭 | 使用非投票 surrogate(`ZenDelegationSurrogate`),质押 ZEN 不参与治理投票 |
| 领取手续费(claim fee) | 0 | `MAX_CLAIM_FEE = 0`,且费用参数置零,Phase 1 不向用户收取领取费用 |
| Bumping | 禁用 | `maxBumpTip = 0`,无人可通过 tip 触发 earning power 重算 |
| 奖励/质押代币 | 同一个 ZEN | reward token 与 stake token 为同一地址 |
| Earning power 计算 | 恒等映射 | 使用 `IdentityEarningPowerCalculator`,earning power == 质押数量,所有质押者按比例平等获得奖励,无资格门槛 |

> **Phase 2+ [需确认]**:`AUDIT_DELTA.md` 与注释多次强调"Phase 1",暗示后续阶段会引入治理委托(投票 surrogate)等能力,但具体范围代码未涉及。

## 3. 功能规格

### 3.1 用户功能(继承自审计基线,未改动)

- **质押(stake)**:存入 ZEN,指定一个 delegatee 与可选 claimer,返回唯一 `depositId`。
- **追加质押(stakeMore)**:向已有 deposit 增加余额。
- **提取(withdraw)**:随时提取 deposit 中的任意金额,无延迟。
- **领取奖励(claimReward)**:claimer 随时领取已累积奖励;Phase 1 无手续费,全额到账。
- **permit 免授权质押(permitAndStake)**:通过 EIP-2612 签名在无需预先 `approve` 的情况下完成质押(来自 `StakerPermitAndStake` 扩展)。
- **claimer / delegatee 设置**:质押者可指定由谁领取奖励、名义委托给谁。

### 3.2 新增的链上读取(view)函数 —— Phase 1 的实际新增功能

这些函数是本分支的核心增量,目的是**减少前端 / Goldsky 索引器的 RPC 往返**,把多次读取聚合为单次调用。它们全部为只读,不改状态、不改存储布局。

| 函数 | 用途 |
|------|------|
| `getDepositInfo(depositId)` | 单个 deposit 的全量数据(余额、owner、earning power、delegatee、claimer、未领取奖励) |
| `getDepositsInfo(depositId[])` | 批量版本,返回平行数组,供索引器批量拉取 |
| `getGlobalState()` | 仪表盘所需全局状态:总质押量、总 earning power、奖励速率、奖励结束时间、上次结算时间、累计每代币奖励 |
| `getDepositorSummary(address)` | 单地址聚合:总质押量、总 earning power(不含未领取奖励) |
| `getDepositorFullSummary(address, depositId[])` | 在上一项基础上,跨该地址所有 deposit 汇总未领取奖励 |

> 设计注记:链上不维护"地址 → deposit ID 列表"的映射,deposit ID 由链下索引器(通过 `StakeDeposited` 事件的 `owner` 索引字段过滤)提供。这就是为什么带奖励汇总的接口要求调用方传入 ID 数组。

### 3.3 事件变更

`StakeDeposited.owner` 与 `StakeWithdrawn.owner` 增加 `indexed`,使链下索引器可按用户地址过滤日志。仅改变日志编码(topic vs data),不影响任何链上行为与 gas。**下游消费者(索引器、subgraph)需更新 ABI。**

## 4. 系统架构与集成

ZenStaker 由四个可替换组件组装而成(Phase 1 的具体选型):

1. **Staker 核心**(审计基线)—— 质押/提取/领取的记账逻辑。
2. **Earning Power Calculator** —— Phase 1 用 `IdentityEarningPowerCalculator`(1:1 恒等)。由 admin 可换。
3. **Reward Notifier** —— 授权的奖励来源,部署后由 admin 单独开启。**[需确认]** 具体使用哪种(Transfer / TransferFrom / Mint)代码未在本分支固定。
4. **Delegation Surrogate** —— Phase 1 用非投票的 `ZenDelegationSurrogate`;每个 delegatee 首次被质押时部署一个 surrogate 合约持有其代币,同一 delegatee 复用同一 surrogate。

**链下集成**:Goldsky 索引器消费事件并维护 deposit ID 索引,前端 dashboard 通过 §3.2 的聚合 view 函数读取展示数据。

## 5. 奖励分发机制与流程

> 本节为审计基线 `Staker.sol` 的核心机制(Phase 1 未改动),采用 Synthetix StakingRewards 式的"每单位 earning power 累计奖励"(reward-per-token accumulator)模型。ZenStaker 因使用恒等计算器,每个 deposit 的 earning power 恒等于其质押余额。

### 5.1 设计目标

- **按份额 × 时间线性分配**:每个 deposit 在每一秒按其 earning power 占全局总 earning power 的比例获得当秒奖励。
- **O(1) 记账**:无论质押人数多少,任何操作都不需要遍历所有 deposit。靠"全局累加器 + 每个 deposit 的快照(checkpoint)"实现——新增奖励只更新全局速率,单个用户的应得奖励在其下次操作时按差值惰性结算。
- **抗 flash-staking 与抢跑**:奖励不是一次性发放,而是在固定周期内逐秒流式释放,临时大额质押无法瞬间攫取超额奖励。

### 5.2 关键状态与常量

| 名称 | 含义 |
|------|------|
| `REWARD_DURATION` | 奖励流式释放周期,固定 **30 天**。每次通知新奖励都会把周期重置为"从现在起 30 天"。 |
| `SCALE_FACTOR` | 定点放大因子 `1e36`。奖励速率与累加器内部以放大态存储,只在最终付款时缩回,避免多次除法截断累积精度损失。 |
| `scaledRewardRate` | 全局奖励速率(放大态),单位为"scaled 奖励代币 / 秒"。 |
| `rewardPerTokenAccumulated()` | 全局累加器:自启用以来,每单位 earning power 累计应得的奖励(放大态)。随时间单调递增。 |
| `rewardPerTokenAccumulatedCheckpoint` | 上述累加器的最近一次存盘值。 |
| `lastCheckpointTime` | 全局累加器最近一次更新的时间戳。 |
| `rewardEndTime` | 当前奖励流的结束时间;到点后停止累积,除非有新奖励通知。 |
| `totalEarningPower` | 全局总 earning power(ZenStaker 中即总质押量)。 |
| deposit 内 `earningPower` | 该 deposit 的 earning power 快照。 |
| deposit 内 `rewardPerTokenCheckpoint` | 该 deposit 上次结算时的全局累加器值。 |
| deposit 内 `scaledUnclaimedRewardCheckpoint` | 该 deposit 已累积但未领取的奖励(放大态)。 |

### 5.3 核心公式

全局累加器(`rewardPerTokenAccumulated`,Staker.sol:341):

```
若 totalEarningPower == 0:返回上次存盘值(无人质押的时段不分配奖励)
否则:checkpoint + scaledRewardRate × (本次分配截止时刻 − lastCheckpointTime) / totalEarningPower
```

其中"本次分配截止时刻"由 `lastTimeRewardDistributed()` 给出:取 `min(当前时间, rewardEndTime)`——周期结束后不再累积。

单个 deposit 的未领取奖励(`_scaledUnclaimedReward`,Staker.sol:562):

```
scaledUnclaimedRewardCheckpoint + earningPower × (当前全局累加器 − 该 deposit 的 rewardPerTokenCheckpoint)
```

即"已存盘的未领取奖励"加上"自上次结算以来,按本 deposit 份额新增的奖励"。对外查询 `unclaimedReward()` 时再 `/ SCALE_FACTOR` 缩回可读金额。

### 5.4 流程一:注入奖励(`notifyRewardAmount`,Staker.sol:468)

调用者必须是 admin 授权的 reward notifier,且**必须先把奖励代币转入合约,再调用本方法**(方法本身不拉取代币)。

1. 校验调用者在 `isRewardNotifier` 白名单中,否则 revert。
2. 先把全局累加器存盘到当前值(冻结此刻之前已分配的奖励)。
3. 计算新的 `scaledRewardRate`:
   - 若上一轮已结束(`block.timestamp >= rewardEndTime`):`scaledRewardRate = _amount × SCALE_FACTOR / REWARD_DURATION`。
   - 若上一轮仍在进行:把**尚未释放的剩余奖励**与新奖励合并后再除以周期 —— `(剩余 + _amount × SCALE_FACTOR) / REWARD_DURATION`。即新奖励不会让旧奖励作废,而是与剩余部分一起在新的 30 天内重新摊平。
4. 将 `rewardEndTime` 重置为"现在 + 30 天",`lastCheckpointTime` 设为现在。
5. 安全校验:速率缩回后不得为 0(`Staker__InvalidRewardRate`);且承诺要发放的总额不得超过合约实际余额(`Staker__InsufficientRewardBalance`)。
6. 发出 `RewardNotified` 事件。

> **安全要点(来自代码注释)**:notifier 必须是"良民"合约。恶意 notifier 可通过①频繁通知微小奖励来不断拉长释放周期(grief 质押者),或②谎报未实际转入的奖励造成后领取者的资金缺口。第 5 步的余额校验只能防退化情形,无法完全杜绝,因此 **notifier 白名单的管理是关键信任假设**。Phase 1 由 Horizen 多签控制。

### 5.5 流程二:奖励累积(被动,无需交易)

奖励在 notify 之后随区块时间自动、连续地累积——无需任何人发交易触发。任意时刻的应得奖励都由 §5.3 的两个 view 公式实时算出。`totalEarningPower == 0` 的时段(无人质押)不分配任何奖励,这部分时间的奖励速率"空转",对应奖励会随周期结束而不再计入累加器。

### 5.6 流程三:结算 checkpoint(在每次状态变更时触发)

任何改变 earning power 或领取奖励的操作(stake / stakeMore / withdraw / claim / 改 delegatee / 改 claimer / bump),都会先后调用:

1. `_checkpointGlobalReward()`(Staker.sol:789):把全局累加器推进到当前值,并更新 `lastCheckpointTime`。
2. `_checkpointReward(deposit)`(Staker.sol:800):把该 deposit 的未领取奖励结算并存盘到 `scaledUnclaimedRewardCheckpoint`,同时把它的 `rewardPerTokenCheckpoint` 对齐到最新全局值。

这一步"锁定"了用户截至当前已挣得的奖励,使得之后改变 earning power(如追加/提取质押)只影响未来的累积,不会追溯篡改历史奖励。

### 5.7 流程四:领取奖励(`_claimReward`,Staker.sol:750)

1. 先执行全局 + deposit 的 checkpoint(见 5.6),得到最新的未领取奖励。
2. 缩回可读金额:`_reward = scaledUnclaimedRewardCheckpoint / SCALE_FACTOR`。
3. 扣除 claim fee 得 `_payout`(Phase 1 fee = 0,故 `_payout == _reward`);若为 0 直接返回。
4. 从 `scaledUnclaimedRewardCheckpoint` 中扣减 `_reward × SCALE_FACTOR`,**刻意保留不足 1 wei 的放大态尾数(dust)**,留待未来累积,进一步防精度流失。
5. 通过当前 earning power 计算器**重新计算该 deposit 的 earning power**,并相应更新 `totalEarningPower`、`depositorTotalEarningPower` 与 deposit 自身的 earning power(ZenStaker 中恒等于余额,通常不变)。
6. 发出 `RewardClaimed` 事件,将 `_payout` 转给 claimer;若有 fee 则把 fee 转给 feeCollector(Phase 1 不触发)。

### 5.8 ZenStaker Phase 1 的具体化

- earning power 计算器为 `IdentityEarningPowerCalculator`,故 earning power ≡ 质押余额,reward-per-token 模型退化为"按质押量 × 时间"分配。
- claim fee = 0,领取全额到账。
- stake 与 reward 同为 ZEN,合约余额同时包含"待发奖励"与"用户本金",§5.4 第 5 步的余额校验无法区分二者——这进一步印证 notifier 必须可信(由多签把关)。

## 6. 部署与运维

部署顺序与治理流程(来自 `script/`):

1. `DeployZenStaker.s.sol`:先部署 `IdentityEarningPowerCalculator`,再部署 `ZenStaker`(reward 与 stake 均传入 ZEN 地址,admin 设为 Horizen 多签)。
   - 必填环境变量:`ZEN_TOKEN_ADDRESS`、`ADMIN_ADDRESS`、`PRIVATE_KEY`;可选 `MAX_BUMP_TIP`(默认 0)。
2. `ConfigureRewardNotifier.s.sol`:部署后由 **admin** 调用 `setRewardNotifier` 开启某个奖励来源(必填 `STAKER_ADDRESS`、`REWARD_NOTIFIER_ADDRESS`、admin 的 `PRIVATE_KEY`)。

**治理模型**:admin(多签)可新增奖励来源、更换 earning power calculator 等;Phase 1 不开放面向普通用户的特权操作。

## 7. 验收标准(由测试映射,`test/ZenStaker.t.sol`)

**部署配置(Constructor)**
- reward 与 stake token 指向同一 ZEN 地址
- admin 正确设置为传入地址
- `MAX_CLAIM_FEE`、claim fee 参数、`maxBumpTip` 均为 0

**完整资金流(FullFlow)**
- 质押 → 等待奖励周期 → 领取 → 提取,全流程可走通;`totalStaked` 正确增减
- 经过完整 `REWARD_DURATION` 后,未领取奖励 ≈ 通知的奖励总额(误差 ≤ 1e15)
- 相同质押额的两个用户获得相同奖励(ZEN-on-ZEN 按份额平分)

**View 函数正确性**
- `getDepositInfo`/`getDepositsInfo` 返回的余额、owner、earning power 与实际一致;未领取奖励随时间增长、在奖励通知后被正确填充;空数组输入返回空数组;模糊测试覆盖任意金额下的余额正确性
- `getGlobalState` 在无活动时返回零;质押后反映 `totalStaked`;通知奖励后 reward rate 被设置;累计每代币奖励随时间增长
- `getDepositorSummary` 对未知地址返回零;跨多个 deposit 正确聚合;提取后正确减少

**permit 与 surrogate**
- 无需预先 approve 即可通过 permit 签名质押
- 首次质押为该 delegatee 部署 surrogate;相同 delegatee 复用同一 surrogate;surrogate 实际持有质押代币

## 8. 质量与审计约束

- 本 fork 跟踪已审计的 `withtally/staker` v1.0.1(Sherlock / Offbeat / Cantina / Uniswap Foundation 多轮审计)。
- 改动纪律:**只做增量或声明式改动,不改写入路径逻辑,不改存储布局。** 当前唯一的基线改动是两个事件的 `indexed`(仅日志布局)。
- 新增 view 函数为无副作用只读,`ZenDelegationSurrogate` 除基类构造外无逻辑,故不触发核心合约重新审计;但审计 diff 应确认事件布局变更属有意为之。
- CI 要求测试覆盖率 ≥ 99.5%,格式由 `scopelint` 强制。

---

## 附:逆向无法覆盖的盲区(需产品方补充)

- 奖励资金来源、奖励周期具体时长背后的经济模型、目标 APR
- Phase 2+ 的具体范围与时间表
- 目标用户画像、UX 流程、上线计划、合规考量
- 各项设计决策在哪些备选方案间做过权衡(代码只记录了"结论",未记录"过程")
