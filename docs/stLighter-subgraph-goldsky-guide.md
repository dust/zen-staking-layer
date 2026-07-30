# Goldsky Subgraph 操作指南 —— 为 Compounding / Harvest / 净值增长图表供数

> **目标**:在 goldsky.com 部署一个扩展后的 subgraph,为前端三处图表提供**真实历史数据**,替换现有的「会话采样 localStorage」临时方案。
>
> **三个供数目标**:
> 1. **Compounding 曲线**(`CompoundChart`)—— 兑换率 `convertToAssets(1e18)` 的历史时间序列。
> 2. **Harvest 历史**(`HarvestHistory`)—— 每次复投的 `rewardClaimed / feeTaken / restaked`。
> 3. **ZenStaker 净值增长**(新增)—— 底层聚合质押头寸的 `balance` 增长 + 累计注入奖励。
>
> **现状基线**:`subgraphs/` 已有一个仅索引 **ZenStaker**(Horizen mainnet `0x6BF7…3E31`,startBlock `21318408`)的 subgraph。本指南是在其上**追加一个 StLighter data source + 若干时间序列实体**,不是从零重建。

---

## 0. 前置:你需要先确认的三个地址/区块

| 项 | 值 | 来源 |
|----|-----|------|
| ZenStaker(mainnet) | `0x6BF7CF29a8bcE11Aa62Cf593d165C244fA4d3E31` | 已在 `subgraph.yaml` |
| ZenStaker startBlock | `21318408` | 已在 `subgraph.yaml` |
| **StLighter proxy(mainnet)** | ⬜ **待填** | StLighter 主网部署地址(ERC1967 proxy) |
| **StLighter startBlock** | ⬜ **待填** | proxy 部署所在区块(用部署 tx 区块,勿用 0,否则全链扫描极慢) |

> ⚠️ 若 StLighter 尚未上主网,可先只做 ZenStaker 净值部分;StLighter 两个 data source 待主网部署后再启用。**startBlock 一定要用真实部署区块**——Goldsky 从该块开始索引,填小了会浪费大量索引时间与配额。

---

## 1. 两个图表需要什么数据 → 映射到 subgraph 实体

### 1.1 关键约束:兑换率历史无法直接读

- 链上只有 `convertToAssets(uint256)` 这个 **view**,返回**当前**兑换率,不存历史。
- 兑换率 = `(totalAssets + 1) / (issuedShares + 10³)`;`totalAssets` = ZenStaker 聚合 deposit 的 `balance + unclaimedReward`,随奖励**连续**上升,但链上**不发逐块事件**。
- **结论**:subgraph 只能在「有事件发生的区块」用 `eth_call` 采样当前兑换率,存成快照点。曲线因此是**真实但离散**的;前端在点之间平滑连线即可(与合约「只升不跳」语义一致)。

### 1.2 触发采样的时机(哪些事件后记一个 RateSnapshot)

| 事件 | 来源合约 | 为什么采样 |
|------|---------|-----------|
| `Deposited` | StLighter | issuedShares↑,兑换率可能微变 |
| `Redeemed` | StLighter | issuedShares↓ |
| `Harvested` | StLighter | 复投把 unclaimed 转本金(rate 中性,但确认增长节点) |
| `RewardNotified` | ZenStaker | **奖励注入 → 改变增速**,是曲线斜率变化的关键时刻 |

> 采样密度取决于活跃度。若担心冷清期点太稀,可后续加 Goldsky 的定时快照(见 §7 可选增强),但**首版靠事件驱动足够**,且零额外成本。

### 1.3 实体 ↔ 图表对应

| 图表 | 查询实体 | 关键字段 |
|------|---------|---------|
| Compounding 曲线 | `RateSnapshot`(时间序列) | `timestamp`, `rate`(=convertToAssets(1e18)), `totalAssets`, `issuedShares` |
| Harvest 历史 | `HarvestEvent` | `rewardClaimed`, `feeTaken`, `restaked`, `timestamp`, `txHash` |
| ZenStaker 净值增长 | `ProtocolDayData` / `Deposit` | 聚合 deposit `balance`、累计 `rewardNotified`、`totalStaked` |

---

## 2. 扩展 schema.graphql(追加,不改现有实体)

在现有 `schema.graphql` **末尾追加**以下实体(现有 6 个事件实体 + `Activity` + `Deposit` 全部保留,顺序不动以免破坏索引):

```graphql
# ---- StLighter 液态质押层 ----

# 兑换率快照(Compounding 曲线的数据源)。每个触发事件一个点。
type RateSnapshot @entity(immutable: true) {
  id: Bytes!                 # txHash.concatI32(logIndex)
  rate: BigInt!              # convertToAssets(1e18),wei,1e18 == 1.0
  totalAssets: BigInt!       # 采样时的 totalAssets()
  issuedShares: BigInt!      # 采样时的 issuedShares
  trigger: String!           # "deposit" | "redeem" | "harvest" | "reward"
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}

# 复投历史(HarvestHistory 的数据源)。
type HarvestEvent @entity(immutable: true) {
  id: Bytes!
  rewardClaimed: BigInt!
  feeTaken: BigInt!
  restaked: BigInt!
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}

# StLighter 存入 / 赎回明细(可选,便于对账与用户历史)。
type StLighterDeposit @entity(immutable: true) {
  id: Bytes!
  caller: Bytes!
  receiver: Bytes!
  assets: BigInt!
  shares: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}

type StLighterRedeem @entity(immutable: true) {
  id: Bytes!
  caller: Bytes!
  receiver: Bytes!
  shares: BigInt!
  assets: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}

# ---- 协议级日聚合(净值增长曲线,低查询成本)----
# 用 dayId (timestamp / 86400) 作 id,把高频快照降采样成每日一条,
# 前端画长周期曲线时查这个,避免拉全部 RateSnapshot。
type ProtocolDayData @entity(immutable: false) {
  id: String!                # dayId = floor(timestamp / 86400)
  date: Int!                 # 当日 0 点 unix
  rateOpen: BigInt!          # 当日首个快照 rate
  rateClose: BigInt!         # 当日最后一个快照 rate
  totalAssets: BigInt!       # 当日最后一次 totalAssets
  issuedShares: BigInt!
  cumulativeRewardNotified: BigInt!  # 截至当日累计注入奖励(ZenStaker 净值增长)
  aggregateStakedBalance: BigInt!    # stLighter 聚合 deposit 的 balance
}

# 全局单例(id 恒为 "1"),累计量的运行总和。
type ProtocolMeta @entity(immutable: false) {
  id: String!                # "1"
  cumulativeRewardNotified: BigInt!
  lastRate: BigInt!
  lastTotalAssets: BigInt!
  lastIssuedShares: BigInt!
}
```

---

## 3. 追加 StLighter data source(subgraph.yaml)

在现有 `dataSources:` 列表**追加**一个条目(ZenStaker 那个保留)。同时把 StLighter ABI 也加进 ZenStaker data source 的 `abis`,因为 ZenStaker 的 `RewardNotified` handler 里要 `eth_call` StLighter 采样兑换率。

```yaml
dataSources:
  # ---- 现有 ZenStaker(保留,仅在 abis 里追加 StLighter,便于 reward 触发采样)----
  - kind: ethereum/contract
    name: ZenStaker
    network: horizen-mainnet
    source:
      address: "0x6BF7CF29a8bcE11Aa62Cf593d165C244fA4d3E31"
      abi: ZenStaker
      startBlock: 21318408
    mapping:
      # ... 现有 entities / eventHandlers 全部保留 ...
      entities:
        # ... 现有 6 个 ...
        - RateSnapshot          # 追加
        - ProtocolDayData       # 追加
        - ProtocolMeta          # 追加
      abis:
        - name: ZenStaker
          file: ./abis/ZenStaker.json
        - name: StLighter        # 追加:reward 触发采样时要 call
          file: ./abis/StLighter.json
      # eventHandlers 现有 6 个保留 —— handleRewardNotified 里追加采样逻辑(§4.3)
      file: ./src/zen-staker.ts

  # ---- 新增 StLighter ----
  - kind: ethereum/contract
    name: StLighter
    network: horizen-mainnet
    source:
      address: "0xSTLIGHTER_PROXY_ADDRESS"   # ⬜ 待填
      abi: StLighter
      startBlock: 0                            # ⬜ 待填(部署区块)
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - RateSnapshot
        - HarvestEvent
        - StLighterDeposit
        - StLighterRedeem
        - ProtocolDayData
        - ProtocolMeta
      abis:
        - name: StLighter
          file: ./abis/StLighter.json
      eventHandlers:
        - event: Deposited(indexed address,indexed address,uint256,uint256)
          handler: handleDeposited
        - event: Redeemed(indexed address,indexed address,uint256,uint256)
          handler: handleRedeemed
        - event: Harvested(uint256,uint256,uint256)
          handler: handleHarvested
      file: ./src/st-lighter.ts
```

> **事件签名依据**(来自 `src/stlighter/StLighter.sol`,勿改):
> - `Deposited(address indexed caller, address indexed receiver, uint256 assets, uint256 shares)`
> - `Redeemed(address indexed caller, address indexed receiver, uint256 shares, uint256 assets)`
> - `Harvested(uint256 rewardClaimed, uint256 feeTaken, uint256 restaked)`

### 3.1 准备 StLighter ABI

subgraph 需要 StLighter ABI(含事件 + `convertToAssets` / `totalAssets` / `issuedShares` view 供 call):

```bash
# 从 forge 产物提取(项目根)
forge build
jq '.abi' out/StLighter.sol/StLighter.json > subgraphs/abis/StLighter.json
```

---

## 4. Mapping 逻辑

### 4.1 新增 `src/st-lighter.ts`

```typescript
import { Deposited, Redeemed, Harvested, StLighter }
  from "../generated/StLighter/StLighter";
import {
  RateSnapshot, HarvestEvent, StLighterDeposit, StLighterRedeem,
} from "../generated/schema";
import { BigInt, Address, ethereum, dataSource } from "@graphprotocol/graph-ts";
import { sampleRate } from "./shared"; // §4.2

export function handleDeposited(event: Deposited): void {
  let e = new StLighterDeposit(event.transaction.hash.concatI32(event.logIndex.toI32()));
  e.caller = event.params.caller;
  e.receiver = event.params.receiver;
  e.assets = event.params.assets;
  e.shares = event.params.shares;
  e.blockTimestamp = event.block.timestamp;
  e.transactionHash = event.transaction.hash;
  e.save();

  sampleRate(event, "deposit", dataSource.address());
}

export function handleRedeemed(event: Redeemed): void {
  let e = new StLighterRedeem(event.transaction.hash.concatI32(event.logIndex.toI32()));
  e.caller = event.params.caller;
  e.receiver = event.params.receiver;
  e.shares = event.params.shares;
  e.assets = event.params.assets;
  e.blockTimestamp = event.block.timestamp;
  e.transactionHash = event.transaction.hash;
  e.save();

  sampleRate(event, "redeem", dataSource.address());
}

export function handleHarvested(event: Harvested): void {
  let e = new HarvestEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  e.rewardClaimed = event.params.rewardClaimed;
  e.feeTaken = event.params.feeTaken;
  e.restaked = event.params.restaked;
  e.blockTimestamp = event.block.timestamp;
  e.transactionHash = event.transaction.hash;
  e.save();

  sampleRate(event, "harvest", dataSource.address());
}
```

### 4.2 新增 `src/shared.ts` —— 兑换率采样 + 日聚合

```typescript
import { BigInt, Address, ethereum } from "@graphprotocol/graph-ts";
import { StLighter } from "../generated/StLighter/StLighter";
import { RateSnapshot, ProtocolDayData, ProtocolMeta } from "../generated/schema";

const ONE = BigInt.fromString("1000000000000000000"); // 1e18
const DAY = BigInt.fromI32(86400);

export function sampleRate(event: ethereum.Event, trigger: string, stlighter: Address): void {
  let c = StLighter.bind(stlighter);

  // try_* 防止 revert 中断索引(如首存前 totalAssets=0)
  let rateRes = c.try_convertToAssets(ONE);
  let taRes = c.try_totalAssets();
  let isRes = c.try_issuedShares();
  if (rateRes.reverted || taRes.reverted || isRes.reverted) return;

  let snap = new RateSnapshot(event.transaction.hash.concatI32(event.logIndex.toI32()));
  snap.rate = rateRes.value;
  snap.totalAssets = taRes.value;
  snap.issuedShares = isRes.value;
  snap.trigger = trigger;
  snap.blockNumber = event.block.number;
  snap.blockTimestamp = event.block.timestamp;
  snap.transactionHash = event.transaction.hash;
  snap.save();

  updateDay(event.block.timestamp, rateRes.value, taRes.value, isRes.value);
}

function updateDay(ts: BigInt, rate: BigInt, ta: BigInt, is: BigInt): void {
  let meta = ProtocolMeta.load("1");
  if (meta == null) {
    meta = new ProtocolMeta("1");
    meta.cumulativeRewardNotified = BigInt.zero();
  }
  meta.lastRate = rate;
  meta.lastTotalAssets = ta;
  meta.lastIssuedShares = is;
  meta.save();

  let dayId = ts.div(DAY);
  let id = dayId.toString();
  let day = ProtocolDayData.load(id);
  if (day == null) {
    day = new ProtocolDayData(id);
    day.date = dayId.times(DAY).toI32();
    day.rateOpen = rate;
    day.cumulativeRewardNotified = meta.cumulativeRewardNotified;
    day.aggregateStakedBalance = BigInt.zero();
  }
  day.rateClose = rate;
  day.totalAssets = ta;
  day.issuedShares = is;
  day.cumulativeRewardNotified = meta.cumulativeRewardNotified;
  day.aggregateStakedBalance = ta; // 近似:聚合头寸净值
  day.save();
}
```

### 4.3 在现有 `src/zen-staker.ts` 的 `handleRewardNotified` 里追加采样

ZenStaker 的 `RewardNotified` 是「净值增长」的源头。在现有 handler 末尾追加:累计注入量 + 触发一次兑换率采样(前提:`STLIGHTER_ADDRESS` 已知)。

```typescript
// 文件顶部
import { sampleRate } from "./shared";
import { ProtocolMeta } from "../generated/schema";
const STLIGHTER = Address.fromString("0xSTLIGHTER_PROXY_ADDRESS"); // ⬜ 待填

// handleRewardNotified 末尾追加:
let meta = ProtocolMeta.load("1");
if (meta == null) {
  meta = new ProtocolMeta("1");
  meta.cumulativeRewardNotified = BigInt.zero();
  meta.lastRate = BigInt.zero();
  meta.lastTotalAssets = BigInt.zero();
  meta.lastIssuedShares = BigInt.zero();
}
meta.cumulativeRewardNotified = meta.cumulativeRewardNotified.plus(event.params.amount);
meta.save();

sampleRate(event, "reward", STLIGHTER);
```

> 若 StLighter 未部署,先跳过 `sampleRate`,仅累计 `cumulativeRewardNotified` —— 这已足够画 ZenStaker 累计奖励/净值增长曲线。

---

## 5. 本地验证(部署 Goldsky 前必做)

```bash
cd subgraphs
npm install
graph codegen            # 依据新 schema + StLighter ABI 生成类型
graph build              # 编译 wasm,任何 schema/mapping 错误在此暴露

# 可选:本地 graph-node 全链路
docker compose up -d
npm run create-local
npm run deploy-local
# 打开 http://localhost:8000/subgraphs/name/... 用 §8 的查询自测
docker compose down -v
```

> `graph codegen` 通过 = ABI/schema 对齐;`graph build` 通过 = mapping 类型正确。两步绿了再上 Goldsky,省配额。

---

## 6. 在 goldsky.com 部署

### 6.1 一次性设置

1. 注册 / 登录 [app.goldsky.com](https://app.goldsky.com)。
2. **Settings → API Keys → Create API Key**,复制。
3. 本地装 CLI 并登录:
   ```bash
   curl https://goldsky.com/install | sh
   goldsky login            # 粘贴 API key
   ```

### 6.2 确认 Goldsky 支持 Horizen mainnet

Goldsky 需要认识 `horizen-mainnet` 这条链。两种情况:

- **已内置**:`subgraph.yaml` 的 `network: horizen-mainnet` 直接可用。
- **未内置**:用 Goldsky 的 **custom RPC / custom chain** 配置(dashboard → Sources,或 CLI `--from-url`),提供 Horizen mainnet RPC(`https://horizen.rpc.caldera.xyz/http` 类)。**部署前先在 Goldsky 文档/支持确认 Horizen 是否已列入受支持网络**——这是唯一可能卡住的外部依赖。

### 6.3 部署

```bash
cd subgraphs
graph build                          # 确保产物最新
goldsky subgraph deploy stlighter/1.0.0 --path .
```

- 命名约定 `<name>/<version>`,如 `stlighter/1.0.0`;后续升级 bump 版本号。
- 部署后 Goldsky 返回一个 **GraphQL query endpoint**(形如 `https://api.goldsky.com/api/public/project_xxx/subgraphs/stlighter/1.0.0/gn`)。
- 在 dashboard 观察索引进度(从 startBlock 追到链头)。

### 6.4 (可选)加 tag 供前端稳定引用

```bash
goldsky subgraph tag create stlighter/1.0.0 --tag prod
# 前端用 .../subgraphs/stlighter/prod/gn,升级时只需把 tag 指向新版本,前端 URL 不变
```

---

## 7. (可选增强)让曲线更平滑 / harvest 标记

首版事件驱动采样已能画曲线。若要更密的点或图表 stub 里预留的增强:

- **定时快照**:Goldsky 支持 subgraph **block handler**(`blockHandlers` + `filter: { kind: polling, every: N }`),可每 N 块无条件采样一次兑换率,填补冷清期。代价是索引成本上升 —— 按需开启。
- **harvest 标记点**:`CompoundChart` 注释里 stub 的「harvest 竖标」直接用 `HarvestEvent` 的时间戳,在曲线对应 x 位置打点。
- **「不复投」对比线**:用 `ProtocolMeta.cumulativeRewardNotified` 推算「奖励不复投」的假想本金曲线,与真实 `rate` 曲线对比,直观展示复利溢价。

---

## 8. 前端接入(替换会话采样)

### 8.1 查询示例

```graphql
# Compounding 曲线(近 N 个采样点)
query Rate($first: Int = 200) {
  rateSnapshots(first: $first, orderBy: blockTimestamp, orderDirection: desc) {
    blockTimestamp
    rate
  }
}

# 长周期净值增长(日聚合,省带宽)
query Daily {
  protocolDayDatas(first: 90, orderBy: date, orderDirection: desc) {
    date
    rateClose
    totalAssets
    cumulativeRewardNotified
    aggregateStakedBalance
  }
}

# Harvest 历史
query Harvests($first: Int = 50) {
  harvestEvents(first: $first, orderBy: blockTimestamp, orderDirection: desc) {
    blockTimestamp
    rewardClaimed
    feeTaken
    restaked
    transactionHash
  }
}
```

### 8.2 改造点(前端,后续单独实施)

- `src/hooks/useRateHistory.ts`:从「localStorage 会话采样」改为 fetch Goldsky `rateSnapshots`(或 `protocolDayDatas`)。保留「< 2 点显示 accumulating」的降级逻辑。
- `src/components/transparency/HarvestHistory.tsx`:从 placeholder 改为渲染 `harvestEvents`。
- 新增 `NEXT_PUBLIC_SUBGRAPH_URL`(Goldsky endpoint / tag),服务端或客户端 fetch。
- `rate` 字段仍是 wei(1e18=1.0),前端 `/1e18` 展示,与 `useExchangeRate` 一致。

---

## 9. 落地顺序清单

```
① 填 StLighter proxy 地址 + startBlock(§0)
② 导出 StLighter ABI 到 subgraphs/abis/(§3.1)
③ 追加 schema 实体(§2)+ subgraph.yaml data source(§3)
④ 写 src/st-lighter.ts + src/shared.ts,改 handleRewardNotified(§4)
⑤ graph codegen && graph build 通过(§5)
⑥ (可选)本地 graph-node 自测查询(§5)
⑦ goldsky login → deploy → 观察索引(§6)
⑧ 前端替换 useRateHistory / HarvestHistory(§8,单独 PR)
```

> **依赖提醒**:整条链路唯一的外部不确定项是 **§6.2 Goldsky 是否原生支持 horizen-mainnet**。建议先确认这一点再动手,必要时用 custom RPC/chain 方案。其余步骤都在本仓库可控范围内。
