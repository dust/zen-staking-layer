# stLighter — 执行计划

> **用途**:可中断、可重启的任务清单。记录已完成项、进行中项与待办,便于随时接续开发。
> **关联文档**:`docs/stLighter-PRD.md`(需求)、`docs/stLighter-sequence-diagrams.md`(时序)、`docs/ZenStaker-Phase1-PRD.md`(底层)、`AUDIT_DELTA.md`(审计差异)。
> **最后更新**:2026-06-14

---

## 当前状态快照

| 维度 | 状态 |
|------|------|
| 核心协议 `StLighter.sol` | ✅ 已实现(deposit/redeem/harvest/gasless/issuedShares/pause/fee) |
| 份额代币 `LtZEN.sol` | ✅ 已实现(OFT + ERC20Permit + minter) |
| 单元测试 `test/StLighter.t.sol` | ✅ 已编写(含新增 last-exit / permit 用例);**待编译验证** |
| 不变量 `test/StLighter.invariants.t.sol` | ✅ 已编写;**待编译验证** |
| 跨链测试 | ⏳ stubbed(`vm.skip`) |
| Proxy 可升级 | ❌ 未实现 |
| OFT 接线脚本 | ⏳ `WireStLighterOFT.s.sol` 为 TODO |
| 审计文档 | ✅ `AUDIT_DELTA.md` 已增 stLighter 章节 |

**阻塞项**:`lib/devtools` submodule 未完整拉取,导致含 `LtZEN`(LayerZero OFT)的编译/测试失败。修复:

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
- [ ] **ltZEN 代币全称**:symbol `ltZEN` 已定,name 待定
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

- [x] 更新 `test/StLighter.t.sol` 过时注释(移除 "NON-COMPILING SCAFFOLDING")
- [x] 新增 `test_PreviewRedeemMatchesLastExitRedeem`
- [x] 新增 `test_LastExitLeavesNoStrandedZen`
- [x] 新增 `test_PermitAllowsTransferWithoutPriorApproval`(ltZEN EIP-2612)
- [x] `AUDIT_DELTA.md` 新增 stLighter 章节(新文件、`via_ir`、LayerZero 依赖、proxy 计划)

### 待完成

- [ ] 修复 submodule:`git submodule update --init --recursive`(确保 `lib/devtools` 存在)
- [ ] 跑通 `forge test --match-path test/StLighter.t.sol`,修复失败项
- [ ] 跑通 `forge test --match-path test/StLighter.invariants.t.sol`
- [ ] 确认 CI 覆盖率仍满足 ≥ 99.5%(stLighter 新代码纳入后)
- [ ] `scopelint check` 通过

### 验收命令

```bash
git submodule update --init --recursive
FOUNDRY_PROFILE=lite forge test --match-path test/StLighter.t.sol -vv
FOUNDRY_PROFILE=lite forge test --match-path test/StLighter.invariants.t.sol -vv
forge coverage --report summary   # 完整覆盖率
scopelint check
```

---

## 阶段 2 — StLighter Proxy 可升级架构(P0,未开始)

> PRD 已确认:StLighter 经 proxy 升级,治理 = proxy admin + 多签 + 时间锁;ltZEN immutable。

### 任务

- [ ] 将 `StLighter` 拆为 **Implementation + Initializer**
  - constructor 逻辑 → `initialize(zen, staker, ltZen, owner)`
  - 保留 immutables 策略:评估 `ZEN`/`STAKER`/`LT_ZEN` 是否仍为 immutable(升级时通常不变)
- [ ] 选用 proxy 模式(建议 **UUPS**,治理面更小;或 Transparent)
- [ ] 新增/改造 `script/DeployStLighterHorizen.s.sol`:
  - 部署 Implementation → Proxy → `initialize`
  - Proxy admin → Timelock
  - `StLighter` owner(`Ownable`)→ Timelock(或多签经 Timelock 执行)
  - 完成 `ltZen.transferOwnership(governance)`(当前为 TODO 注释)
- [ ] 文档化升级 SOP:
  1. Timelock 调度 `upgradeToAndCall` 至新 Implementation
  2. 新 Implementation 部署后,Timelock 调用 `LtZEN.setMinter(newProxyAddress)`
  3. 验证 `issuedShares` / `depositId` / `initialized` 状态连续性
- [ ] 升级相关测试(至少:初始化、不可重复 initialize、升级后 deposit/redeem 仍可用)
- [ ] 更新 `AUDIT_DELTA.md` proxy 章节

### 关键文件(预计新增/修改)

| 文件 | 动作 |
|------|------|
| `src/stlighter/StLighter.sol` | 改造为 UUPS Implementation |
| `src/stlighter/StLighterProxy.sol` 或 OZ `ERC1967Proxy` | 新增 |
| `script/DeployStLighterHorizen.s.sol` | proxy 部署流程 |
| `test/StLighter.upgrade.t.sol` | 新增 |

---

## 阶段 3 — OFT 跨链(P0,未开始)

> Phase 1 交付 Horizen ↔ Base ltZEN 流通;质押结算仍在 Horizen。

### 任务

- [ ] 调研 Horizen ↔ Base 上 **ZEN、USDC** OFT 桥的 DVN 与确认数配置
- [ ] 完成 `script/WireStLighterOFT.s.sol`:
  - [ ] `setPeer` 双向接线
  - [ ] DVN / ULN send+receive 库配置
- [ ] 完成 `script/DeployStLighterBase.s.sol` ownership 移交
- [ ] 引入 LayerZero 测试 harness(如 `TestHelperOz5`)或自建 mock Endpoint
- [ ] 实现并启用 `test/StLighter.t.sol::CrossChain` 中被 skip 的测试:
  - [ ] `test_BridgePreservesTotalSupplyAcrossChains`
  - [ ] `test_BridgeDoesNotChangeExchangeRate`
  - [ ] spoke `minter == address(0)` 无法本地 mint
- [ ] 跨链场景下 `issuedShares` 不变量(单链测试已覆盖;跨链需扩展 handler)

### 验收标准(来自 PRD §9)

- Horizen → Base 转移后两链总供应量守恒
- Base 端余额正确 mint、源链正确 burn
- 跨链不影响 Horizen `convertToAssets`(兑换率)
- 错误 peer / 未配置 DVN 时安全失败

---

## 阶段 4 — Gasless UX 增强(P1,可选)

### 任务

- [ ] `depositWithSigAndPermit`:合并 EIP-712 + ZEN permit,彻底免 on-chain approve(PRD §6.4)
- [ ] 非 gasless 的 `depositWithPermit`(对标 ZenStaker `permitAndStake`,PRD §5.3)
- [ ] 合约级 `MAX_GAS_FEE_ZEN` 硬上限(PRD §6.5 兜底,独立于签名 `maxFeeZen`)
- [ ] EIP-1271 合约钱包 gasless 测试(mock 钱包 + `SignatureChecker`)
- [ ] harvest keeper 激励:若观测到 harvest 间隔过长,从 PRD §6.6 方案 B/C 选型

---

## 阶段 5 — 部署与上线准备(P2)

### 任务

- [ ] 确定 ltZEN 完整 name 字符串
- [ ] 主网部署 checklist(Horizen hub → Base spoke → Wire OFT → 移交治理)
- [ ] 前端/Dashboard 多链读链集成(合约外,但需 ABI 稳定)
- [ ] Base 用户「桥回 Horizen 再 redeem」前端编排(若产品确认)
- [ ] 安全评审:OFT peer 配置、DVN 选型、proxy 升级权限
- [ ] 独立审计 scope 定稿(stLighter 为 net-new,见 `AUDIT_DELTA.md`)

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
| P0 | StLighter proxy 可升级 | §2 / §7 / §10 |
| P0 | OFT `setPeer` + DVN 接线 | §4 / §7 |
| P0 | 跨链测试(当前 skip) | §9 |
| P1 | `depositWithSig` + ZEN permit 一笔交易 | §6.4 |
| P1 | `depositWithPermit`(非 gasless) | §5.3 |
| P1 | 合约级 gas fee 硬上限 | §6.5 |
| P1 | EIP-1271 合约钱包测试 | §6.1 |
| P2 | 部署脚本 ownership 移交 TODO | `DeployStLighter*.s.sol` |
| P2 | Timelock 集成 | §7 / §8 |

---

## 建议执行顺序

```
阶段 0 ✅
    ↓
阶段 1 (修 submodule → 跑测试 → 修失败)
    ↓
阶段 2 (Proxy 可升级)     ← 新确认项,影响审计范围
    ↓
阶段 3 (OFT 跨链)         ← Phase 1 跨链交付核心
    ↓
阶段 4 (Gasless 增强)     ← 可并行或延后
    ↓
阶段 5 (部署上线)
```

**重启时建议**:先读本文件「当前状态快照」→ 执行阶段 1 验收命令确认基线 → 从第一个未勾选项继续。

---

## 关键路径与文件索引

```
docs/
  stLighter-PRD.md              # 需求规格(含已确认决策)
  stLighter-sequence-diagrams.md
  stLighter-execution-plan.md   # 本文件
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

## 变更日志

| 日期 | 变更 |
|------|------|
| 2026-06-14 | 初版:产品决策入 PRD;差距分析;阶段 0 完成;阶段 1 测试/AUDIT_DELTA 部分完成;submodule 阻塞记录 |
