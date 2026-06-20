# stLighter — 执行计划

> **用途**:可中断、可重启的任务清单。记录已完成项、进行中项与待办,便于随时接续开发。
> **关联文档**:`docs/stLighter-PRD.md`(需求)、`docs/stLighter-sequence-diagrams.md`(时序)、`docs/stLighter-dashboard-design.md`(前端复利透明度可视化)、`docs/stLighter-dashboard-uiux-spec.md`(前端 UI/UX 执行规格)、`docs/stLighter-dashboard-tone-guide.md`(视觉与文案 tone)、`docs/ZenStaker-Phase1-PRD.md`(底层)、`AUDIT_DELTA.md`(审计差异)。
> **最后更新**:2026-06-15

---

## 当前状态快照

| 维度 | 状态 |
|------|------|
| 核心协议 `StLighter.sol` | ✅ 已实现(deposit/redeem/harvest/gasless/permit/issuedShares/pause/fee) |
| 份额代币 `LtZEN.sol` | ✅ 已实现(OFT + ERC20Permit + minter) |
| 单元测试 `test/StLighter.t.sol` | ✅ **59 passed**(含 gasless/permit/ERC1271/view helpers) |
| 治理测试 `test/StLighter.governance.t.sol` | ✅ **4 passed** |
| 升级测试 `test/StLighter.upgrade.t.sol` | ✅ **5 passed** |
| 部署脚本测试 `test/StLighter.deploy.t.sol` | ✅ **4 passed**(checklist §1–§4 自动断言) |
| 不变量 `test/StLighter.invariants.t.sol` | ✅ **5 passed** |
| 跨链测试 `test/StLighter.crosschain.t.sol` | ✅ **4 passed**; **双链测试网接线推迟** |
| 测试合计 | ✅ **81 passed / 0 failed / 0 skipped** |
| 前端 ABI | ✅ `abi/StLighter.json` / `abi/LtZEN.json` + `README` |
| CI 覆盖率门槛 | ✅ 限 `src/stlighter/*`,90%(LtZEN 100%、StLighter 91.67%,见构建发现) |
| Proxy 可升级 | ✅ UUPS + ERC1967Proxy + Timelock 脚本 |
| OFT 接线脚本 | ✅ `WireStLighterOFT` + `ConfigureStLighterOFTDVN` |
| 部署 checklist | ✅ `docs/stLighter-deploy-checklist.md` |
| 审计文档 | ✅ `AUDIT_DELTA.md` 已增 stLighter 章节 |

**阻塞项(已解除)**:~~`lib/devtools` submodule 未完整拉取~~ 已从 Mac 拷贝 `lib/`;编译通过。单链测试使用 `EndpointV2Mock` 替代占位地址。

修复 submodule(可选,用于 git 元数据对齐):

```bash
git submodule update --init --recursive
FOUNDRY_PROFILE=lite forge test --match-path test/StLighter.t.sol
FOUNDRY_PROFILE=lite forge test --match-path test/StLighter.invariants.t.sol
```

---

## 产品决策(已确认,已写入 PRD §10)

- [x] **不设**即时 guardian 暂停角色;仅多签 + 时间锁
- [x] **StLighter proxy 可升级**;**ltZEN 不可升级**;升级时 `LtZEN.setMinter` 迁移
- [x] **OFT 安全栈**:部署时决定,参考 Horizen ↔ Base 上 ZEN/USDC 桥 DVN 配置
- [x] **OFT 跨链不可暂停**(避免困住 Base 用户)
- [x] **harvest keeper 激励**:Phase 1 暂不引入;见 PRD §6.6 可选方案
- [x] **gasless fee 收款人**:`msg.sender`(relayer)
- [x] **ltZEN 代币全称**:name 与 symbol 一致,均为 `ltZEN`(2026-06-15 确认,已落地脚本/测试)
- [ ] **Base 端赎回 UX**:前端是否编排「一键桥回并赎回」(纯前端)

---

## 阶段 0 — 文档与决策(已完成)

- [x] 阅读 `docs/` + `CLAUDE.md`,梳理项目背景
- [x] 将产品方确认项写入 `docs/stLighter-PRD.md`(§2 / §6 / §7 / §8 / §10)
- [x] 新增 PRD §6.6 harvest keeper 激励背景与可选方案
- [x] 实现 vs PRD 差距分析(见下文「差距清单」)
- [x] 制定分阶段执行计划(本文件)

---

## 阶段 1 — 测试补齐与审计文档(大部分完成)

### 已完成

- [x] 修复 submodule / 从 Mac 拷贝 `lib/` 依赖(编译通过)
- [x] 单链测试 harness:引入 `EndpointV2Mock` 替代占位 `lzEndpoint` 地址
- [x] 跑通 `forge test --match-path test/StLighter.t.sol` — **50 passed**, 2 skipped(跨链)
- [x] 跑通 `forge test --match-path test/StLighter.invariants.t.sol` — **5 passed**
- [x] 更新 `test/StLighter.t.sol` 过时注释(移除 "NON-COMPILING SCAFFOLDING")
- [x] 新增 `test_PreviewRedeemMatchesLastExitRedeem`
- [x] 新增 `test_LastExitLeavesNoStrandedZen`
- [x] 新增 `test_PermitAllowsTransferWithoutPriorApproval`(ltZEN EIP-2612)
- [x] `AUDIT_DELTA.md` 新增 stLighter 章节(新文件、`via_ir`、LayerZero 依赖、proxy 计划)

### 待完成

- [ ] `git submodule status` 与 `.gitmodules` 对齐(可选,拷贝 lib 后元数据可能不一致)
- [x] 确认 CI 覆盖率仍满足 ≥ 99.5%(stLighter 新代码纳入后) — 见下「CI 覆盖率/构建发现」
- [ ] `scopelint check` 通过(本机未安装 scopelint;CI 仍会执行)

### 验收命令

```bash
git submodule update --init --recursive
FOUNDRY_PROFILE=lite forge test --match-path test/StLighter.t.sol -vv
FOUNDRY_PROFILE=lite forge test --match-path test/StLighter.invariants.t.sol -vv
forge coverage --report summary   # 完整覆盖率
scopelint check
```

---

## 阶段 2 — StLighter Proxy 可升级架构(已完成)

> PRD 已确认:StLighter 经 proxy 升级,治理 = proxy admin + 多签 + 时间锁;ltZEN immutable。

### 已完成

- [x] `StLighter` 改造为 **UUPS** Implementation + `initialize(zen_, staker_, ltZen_, owner_)`
- [x] 存储变量替代 immutables(`_zen`/`_staker`/`_ltZen` + getter `ZEN()`/`STAKER()`/`LT_ZEN()`)
- [x] `test/helpers/StLighterProxyDeploy.sol` — ERC1967Proxy 部署库
- [x] 全部现有测试改为经 proxy 部署(60 passed)
- [x] `test/StLighter.upgrade.t.sol` — initialize 防重入、UUPS 升级保状态、onlyOwner、minter 稳定
- [x] `script/DeployStLighterHorizen.s.sol` — implementation + proxy + setMinter(proxy)
- [x] `lib/openzeppelin-contracts-upgradeable` + remapping + `.gitmodules`
- [x] `script/DeployStLighterTimelock.s.sol` — multisig proposer + open executor
- [x] `script/StLighterGovernanceLib.sol` — `TIMELOCK_ADDRESS` env helper
- [x] `script/UpgradeStLighterViaTimelock.s.sol` — timelock 调度 UUPS 升级

### 升级 SOP(UUPS)

1. 部署新 Implementation:`new StLighter()`(无需 initialize)
2. Timelock(= `owner`) 调用 proxy 上 `upgradeToAndCall(newImpl, "")`
3. **无需** `LtZEN.setMinter` — proxy 地址不变,minter 仍有效
4. 验证:`issuedShares`、`depositId`、`initialized`、`totalAssets` 连续
5. 仅当**迁移到新 proxy** 时才需 `ltZen.setMinter(newProxy)`

### 待完成(阶段 2 收尾)

- [x] Timelock 合约接线 — `DeployStLighterTimelock.s.sol`; 部署脚本 `TIMELOCK_ADDRESS` / `GOVERNANCE_ADDRESS`
- [x] `ltZen.transferOwnership(timelock)` — Horizen + Base 部署脚本已启用(plain Ownable,即时生效)
- [x] UUPS 升级 SOP 脚本 — `UpgradeStLighterViaTimelock.s.sol`(schedule / execute)
- [x] 治理测试 — `test/StLighter.governance.t.sol`

---

## 阶段 3 — OFT 跨链(P0,进行中)

> Phase 1 交付 Horizen ↔ Base ltZEN 流通;质押结算仍在 Horizen。
> 主网参考: [ZenTokenOFT](https://horizen.calderaexplorer.xyz/address/0x57da2D504bf8b83Ef304759d9f2648522D7a9280)（首选）、[StargateOFTUSDC](https://horizen.calderaexplorer.xyz/address/0x3a1293Bdb83bBbDd5Ebf4fAc96605aD2021BbC0f)（DVN 对照）。详见 `docs/stLighter-oft-reference.md`。

### 任务

- [x] 调研参考合约 — ZenTokenOFT 与 LtZEN 同构;DVN 从链上 `getConfig` 复制
- [x] 完成 `script/WireStLighterOFT.s.sol` — `setPeer` 双向接线
- [x] 完成 `script/ConfigureStLighterOFTDVN.s.sol` — ULN send+receive `setConfig`
- [x] `script/DeployStLighterBase.s.sol` ownership 移交(阶段 2 已完成)
- [x] LayerZero 测试 harness — `TestHelperOz5`(已有 `lib/devtools`)
- [x] `test/StLighter.crosschain.t.sol` — 跨链守恒、兑换率、`minter==0`、未配置 peer 失败
- [x] 移除 `test/StLighter.t.sol::CrossChain` 中 `vm.skip` stub
- [ ] 主网:从 ZenTokenOFT 读取真实 eid/DVN/confirmations 填入 env 并双链验证
- [ ] 跨链场景 invariant handler 扩展(可选;核心性质已由 crosschain 单测覆盖)

### 验收标准(来自 PRD §9)

- Horizen → Base 转移后两链总供应量守恒
- Base 端余额正确 mint、源链正确 burn
- 跨链不影响 Horizen `convertToAssets`(兑换率)
- 错误 peer / 未配置 DVN 时安全失败

---

## 阶段 4 — Gasless UX 增强(P1,可选)

### 任务

- [x] `depositWithSigAndPermit`:合并 EIP-712 + ZEN permit,彻底免 on-chain approve(PRD §6.4)
- [x] 非 gasless 的 `depositWithPermit`(对标 ZenStaker `permitAndStake`,PRD §5.3)
- [x] 合约级 `MAX_GAS_FEE_ZEN` 硬上限(PRD §6.5 兜底,独立于签名 `maxFeeZen`)
- [x] EIP-1271 合约钱包 gasless 测试(mock 钱包 + `SignatureChecker`)
- [ ] harvest keeper 激励:若观测到 harvest 间隔过长,从 PRD §6.6 方案 B/C 选型 — **Phase 1 暂不实现**

---

## 阶段 5 — 部署与上线准备(P2)

### 任务

- [x] 确定 ltZEN 完整 name 字符串 — name = symbol = `ltZEN`(2026-06-15)
- [x] 主网部署 checklist(Horizen hub → Base spoke → Wire OFT → 移交治理) — `docs/stLighter-deploy-checklist.md`
- [x] 部署脚本本地集成测试 — `test/StLighter.deploy.t.sol`(checklist §1–§4 验收转为自动断言)
- [x] 前端 ABI 固定导出 — `abi/StLighter.json` / `abi/LtZEN.json` + `abi/README.md`
- [ ] 前端/Dashboard 多链读链集成(合约外,ABI 已稳定导出)
- [ ] Base 用户「桥回 Horizen 再 redeem」前端编排(若产品确认)
- [ ] 安全评审:OFT peer 配置、DVN 选型、proxy 升级权限
- [x] 独立审计 scope 定稿(stLighter net-new + 审计边界/信任假设)— `AUDIT_DELTA.md`

---

## 实现 vs PRD 差距清单

### 已对齐

| PRD 要求 | 实现 |
|----------|------|
| 单一 ZenStaker deposit,协议 owner/claimer | `StLighter._stakeIntoStaker` |
| `issuedShares` 跨链不变分母 | `issuedShares` 仅 deposit/redeem 变动 |
| ERC4626 风格 views + `DECIMALS_OFFSET=3` | `convertTo*` / `preview*` |
| 自动 harvest + permissionless `harvest()` | `_harvest()` + `harvest()` |
| pause 仅挡 deposit;redeem/harvest 可用 | `whenNotPaused` 仅 deposit |
| 协议费基础设施(启动 0,上限 2000 bps) | `feeBps` / `setFeeParameters` |
| last-exit 全额 sweep | `redeem` + `previewRedeem` |
| gasless deposit/redeem,fee → `msg.sender` | `depositWithSig` / `redeemWithSig` |
| ltZEN = OFT + ERC20Permit + minter | `LtZEN.sol` |
| 首存通胀攻击防护 | `totalAssets` 只读 ZenStaker + virtual offset;`InflationAttack` 测试 |

### 主要缺口

| 优先级 | 缺口 | PRD 引用 |
|--------|------|----------|
| P0 | StLighter proxy 可升级 | ✅ 阶段 2 完成 |
| P0 | OFT `setPeer` + DVN 接线 | ✅ 脚本 + 参考文档 |
| P0 | 跨链测试(当前 skip) | ✅ `StLighter.crosschain.t.sol` |
| P1 | `depositWithSig` + ZEN permit 一笔交易 | ✅ §6.4 |
| P1 | `depositWithPermit`(非 gasless) | ✅ §5.3 |
| P1 | 合约级 gas fee 硬上限 | ✅ §6.5 `MAX_GAS_FEE_ZEN` |
| P1 | EIP-1271 合约钱包测试 | ✅ `MockERC1271Wallet` |
| P2 | 部署脚本 ownership 移交 TODO | `DeployStLighter*.s.sol` |
| P2 | Timelock 集成 | §7 / §8 |

---

## 建议执行顺序

```
阶段 0 ✅
    ↓
阶段 1 ✅
    ↓
阶段 2 ✅
    ↓
阶段 3 (OFT 跨链 — 代码/单测 ✅; **双链测试网接线推迟至实际部署**)
    ↓
阶段 4 ✅ (Gasless 增强)
    ↓
阶段 5 (部署上线 — checklist 已起草)
```

**重启时建议**:先读本文件「当前状态快照」→ 执行阶段 1 验收命令确认基线 → 从第一个未勾选项继续。

---

## 关键路径与文件索引

```
docs/
  stLighter-PRD.md              # 需求规格(含已确认决策)
  stLighter-sequence-diagrams.md
  stLighter-execution-plan.md   # 本文件
  stLighter-deploy-checklist.md # 主网/测试网部署顺序
  stLighter-dashboard-design.md # 前端复利透明度可视化设计(汇率/复投/复利)
  stLighter-dashboard-uiux-spec.md # 前端 UI/UX 执行规格(页面/组件/交互/边界态)
  stLighter-dashboard-tone-guide.md # 视觉与文案 tone 指南(UI 全英文)
  ZenStaker-Phase1-PRD.md

src/stlighter/
  StLighter.sol                 # 协议合约(会计 + ZenStaker 调用)
  LtZEN.sol                     # OFT 份额代币
  ILtZEN.sol

script/
  DeployStLighterHorizen.s.sol  # Hub 部署
  DeployStLighterBase.s.sol     # Spoke 部署
  WireStLighterOFT.s.sol        # 跨链接线(TODO)

test/
  StLighter.t.sol               # 集成测试
  StLighter.invariants.t.sol    # 不变量
  helpers/StLighter.handler.sol

AUDIT_DELTA.md                  # 审计差异(ZenStaker + stLighter)
```

---

## CI 覆盖率 / 构建发现(2026-06-15)

核对覆盖率门槛时发现两处 **CI 实际会失败** 的问题,均已修复:

1. **`forge coverage` 与 `via_ir` 冲突** — CI 原命令 `forge coverage`(coverage profile)会剥离
   `via_ir`,而 LayerZero OFT 继承链(ltZEN)必须 `via_ir`,导致 stack-too-deep,coverage job
   编译即失败。修复:`ci.yml` 改为 `forge coverage --ir-minimum ...`。
2. **审计基线 fuzz 测试在 via_ir 下失败** — `testFuzz_UpdatesExistingDelegateScore`
   (`BinaryEligibilityOracleEarningPowerCalculator.t.sol`,审计基线)仅在 `via_ir` 下、且在
   天文级 warp 时间戳(`~3.7e53`)确定性失败;optimizer 关闭则通过。属编译器 codegen 工件,
   非合约缺陷(生产写路径 `lastOracleUpdateTime = block.timestamp` 无条件正确)。**决策(用户)**:
   不改审计基线测试文件;CI 用 `--no-match-test` 排除,并在 `AUDIT_DELTA.md` 记录。
3. **99.5% 覆盖率门槛在 via_ir 下不可达** — `--ir-minimum` 源码映射不准,**所有**文件被系统性
   低估(连审计基线 `Staker.sol` 也仅 ~94%,其覆盖行在映射层丢失而非未测)。**决策(用户)**:
   门槛**仅限 `src/stlighter/*`**,阈值 **90%**。实测:`LtZEN.sol` 真 100%;`StLighter.sol`
   91.67%——剩余 12 行(`_disableInitializers`/`__X_init`/`_harvest`/`_pause`/`previewRedeem`
   返回等)经测试**确证执行**,纯属 ir-minimum 无法归因内联/内部调用。已补 `Views` 测试合约
   覆盖 `previewDeposit`/`convertToShares`/`totalShares`(此前唯一真实缺口)。

覆盖率结果(`--ir-minimum`,排除上述基线测试,限 stLighter):`LtZEN.sol` 100%;
`StLighter.sol` 行 91.67%、分支 76.92%(分支默认不卡门槛)。
注:`scopelint` 本机未安装,未在本地执行格式/lint 检查。

---

## 变更日志

| 日期 | 变更 |
|------|------|
| 2026-06-15 | A.1/B/C.1-3:修复 CI coverage(`--ir-minimum`)、排除 via_ir 基线测试并记入 AUDIT_DELTA;coverage 门槛改为限 `src/stlighter/*`@90%(用户决策);新增 `test/StLighter.deploy.t.sol`(部署脚本本地集成)与 `Views` 测试合约;ltZEN name=`ltZEN`;导出 `abi/`。全套 **81 passed**(CI test job 481 passed/1 skipped) |
| 2026-06-15 | 基线核对:全套 72 passed(t 54 / governance 4 / upgrade 5 / invariants 5 / crosschain 4);更正快照表(原 72 误标在 `StLighter.t.sol` 单文件,实为套件合计) |
| 2026-06-14 | 阶段 2 收尾:Timelock 部署脚本、ltZEN ownership 移交、治理测试(64 passed) |
| 2026-06-14 | 阶段 2 完成:StLighter UUPS proxy;60+5 测试通过;新增 `openzeppelin-contracts-upgradeable` 依赖 |
| 2026-06-14 | 初版:产品决策入 PRD;差距分析;阶段 0 完成;阶段 1 测试/AUDIT_DELTA 部分完成;submodule 阻塞记录 |
