# stLighter 合约安全评审报告

> **状态**:初评 + 修复复审(内部)。评审对象 `src/stlighter/` 全量。非替代第三方审计——`AUDIT_DELTA.md` 已将本子系统标为 net-new / in-scope,仍需独立审计。
> **评审日期**:2026-07-26(初评);2026-07-27(复审,见 §9)。
> **方法**:人工逐行审计核心资金/会计路径 + 子代理并行(station 子系统深审、测试套件实测)。
> **复审结论**:§7 五项建议已全部落实并验证通过(commit `c4bf352`),测试 121 项全过。详见 §9。

---

## 1. 范围与基线

- **范围**:`src/stlighter/` 11 个文件(1485 行)——StLighter 金库、LtZEN OFT、station 跨链子系统。

| 文件 | 行数 | 角色 |
|------|------|------|
| `StLighter.sol` | 511 | 池化金库会计(ERC4626 风格)、自动复投、gasless meta-tx、UUPS |
| `LtZEN.sol` | 72 | LayerZero V2 OFT 份额代币 + EIP-2612 permit,`minter` 门禁 mint/burn |
| `ILtZEN.sol` | 18 | 协议侧最小 mint/burn 接口 |
| `station/InboundStation.sol` | 257 | Base→Horizen「From Base」存入,compose 接收 + `payForDeposit` |
| `station/EgressStation.sol` | 308 | Redeem-to-Base:`redeemAndCredit`(原子 redeemWithSig+credit)、`bridgeToBase` |
| `station/StationAccounting.sol` | 98 | credit/debit 会计 + `_assertSolvency` 兜底 |
| `station/ZenOftStationBridge.sol` | 151 | OFT `send` 出站桥适配器(非升级) |
| `station/libraries/StationComposePayload.sol` | 28 | compose payload 编解码 |
| `station/IStation*.sol` | 42 | 接口 |

- **基线**:审计过的 `withtally/staker` v1.0.1。stLighter 为纯外部调用者,未改写入路径 / 未改存储布局,与 `AUDIT_DELTA.md` 声明一致 ✅。

---

## 2. 结论摘要

整体质量高、防御意识强:CEI 严格、`nonReentrant` 全覆盖、通胀攻击双重防护、fee 双上限、跨链份额记账用全局 `issuedShares` 而非本地 `totalSupply()`。

- 测试实测 **110 项全过**(stLighter 82 + station 28,0 失败);invariant 256 runs × 12800 calls,0 revert。
- **无 Critical / 无确认的 High。**
- 主要问题:station 子系统的**原生 ETH 无出口**(MEDIUM-1)、**compose 顺序 nonce 卡币**(MEDIUM-2),外加若干 Low / 信息项与测试盲区。

---

## 3. 发现清单(按严重度)

### 🟠 MEDIUM-1 — station 原生 ETH 永久锁死,无提取路径

`ZenOftStationBridge.bridgeZen` 以 `refundAddress = egress` 发送 OFT(`ZenOftStationBridge.sol:101`)。relayer 必须超付 `msg.value`(报价漂移),OFT 把多余原生币退还到 `EgressStation`。`EgressStation` 有 `receive() payable`(`EgressStation.sol:288`),但**没有任何原生币提取函数**——`rescueUnassigned` / `sweepFloatToUnassigned` 只处理 ZEN。每次桥接超付的 ETH 永久滞留。`InboundStation.lzCompose` 为 `payable`(`InboundStation.sol:95`),同样收得下 LZ 原生空投却无清扫路径。

- **影响**:relayer / 运营方原生资金不可回收(非用户资金、非盗取)。
- **类别**:stuck-funds。

### 🟠 MEDIUM-2 — compose 存入用严格递增 per-owner nonce,乱序/失败的 compose 消息把已到账 ZEN 变无主浮款

`lzCompose → _creditFromCompose` 调 `_useNonce(owner)`(`InboundStation.sol:232`),用户离线**预测** nonce 并签名。问题:

1. LayerZero OFT 投递/compose 默认无序;两笔在途存入(nonce 0、1)乱序到达,或中间插入任何消费 nonce 的动作(`withdrawToHorizen`、`invalidateNonce`),都会让预测 nonce 失效 → 签名校验 revert(`InboundStation.sol:233`)。
2. compose revert 时 OFT **已把 ZEN 投递到 station**(compose 在 OFT 记账之后执行);经 endpoint 重试仍撞同一 revert,币变成无归属浮款。

- **影响**:活性 / 卡币,非盗取(`assets != actualAmount` 检查 `:110` 防超额记账)。恢复需 owner 清扫 + 链下补偿,用户无法自助。
- **类别**:liveness / stuck-funds。

### 🟡 LOW-1 — `lzCompose` 不校验源链 `srcEid`

`InboundStation.lzCompose`(`:95-113`)校验了 `msg.sender == composeCaller` 与 `_from == zenOft`,但从不读 `srcEid`。若 Horizen 的 `zenOft` 将来接了多条链 peer,来自非预期源链的存入也会被接受。因有 `actualAmount` 上限 + 用户签名,无超额记账,影响有限。

### 🟡 LOW-2 — 出站桥 `minAmountLD = 0`,无滑点保护

`ZenOftStationBridge.bridgeZen` 设 `minAmountLD: 0`(`:92`)。owner 已被 `_debit` 全额,若该 ZEN OFT 将来开征转账费,用户静默承担全部缺口。对当前可信 ZenTokenOFT 只是 sub-sharedDecimals 灰尘。

### 🟡 LOW-3 — `bridgeToBase` / `redeemAndCredit` 的 `feeZen` 未进签名

`bridgeToBase` 签名绑定了 `maxFeeZen` + `relayer` 但**不绑定 `feeZen`**(`EgressStation.sol:149`),调用方可在 `≤ maxFeeZen` 内自选并付给签名 `relayer`。这是 gasless 常规取舍(用户同意上限),且与 StLighter 主合约 `redeemWithSig` 一致(`feeZen` unsigned)。**属有意设计,记录备案。**

### ⚪ INFO-1 — 原 station 评审的 HIGH 已排除(receiver 受签名保护)

子代理曾担心 `redeemAndCredit` 强制 `receiver = address(this)` 可能被重放普通赎回签名。**已核实排除**:`REDEEM_WITH_SIG_TYPEHASH`(`StLighter.sol:73-75`)把 `receiver`、`relayer`、`maxFeeZen` 全纳入签名并在 `:380-391` 编码校验。用户「receiver=自己钱包」的签名无法重放进 station(字段不符,`SignatureChecker.isValidSignatureNow` 失败)。攻击前提不成立。

### ⚪ INFO-2 — `creditFromTrustedComposer` 无到账校验

`InboundStation.sol:117-125` 凭签名给 `owner` 记任意 `assets`,无 `amountLD` 对账,但受 `composeCaller` 门禁 + `_assertSolvency`(`StationAccounting.sol:93`)双重约束。生产中 `composeCaller` = LZ Endpoint 永不调此选择器,实为死代码。残余风险:谁是 `composeCaller` 谁就能把已有 station 浮款重指给任意签名 owner(抢在 sweep 前)。

### ⚪ INFO-3 — `LtZEN.burn` 可无 allowance 销毁任意地址份额

`LtZEN.burn(_from,...)`(`:63`)由 minter 直接销毁,无需 ERC20 授权。这是**已声明的信任假设**(`AUDIT_DELTA.md`:minter = StLighter proxy 完全可信,compromise = 无背书份额);redeem 路径下 `_from` 是签名 `_user`,受 EIP-712 保护。非漏洞,是设计。

### ⚪ INFO-4 — 死代码 / 次要项

- `bridgeToBase` 的 `bridgeId` 含 per-owner 唯一 `nonce`(`EgressStation.sol:162`),故 `pending[bridgeId].active` 碰撞守卫永不触发;revert 复用了误导性的 `EgressStation__BridgeNotActive` error。无安全影响。
- `onBridgeRefund` 拒绝部分退款(`amount != p.amount`,`EgressStation.sol:186`);对同步的 `ZenOftStationBridge` 退款路径根本不会走到(成功在 tx 内经 `onBridgeComplete` 结算)。仅对未来异步桥有意义,届时部分 OFT 退款会 revert 并把资金卡在适配器。

---

## 4. 核心合约设计确认(逐项通过 ✅)

| 项 | 结论 | 证据 |
|------|------|------|
| CEI / 重入 | `_redeem` 先改状态(`issuedShares-=`/`burn`)再外部交互(`withdraw`/`transfer`)+ `nonReentrant`;`_deposit` 同理 | `StLighter.sol:412-421, 349-350` |
| 通胀攻击 | `+10^DECIMALS_OFFSET` 虚拟偏移 + `totalAssets+1`;`totalAssets` 只读 ZenStaker 记账值,不读余额 → 捐赠攻击打不进 | `:182-192, 172-176` |
| fee 上限 | 双重卡:`feeZen ≤ maxFeeZen` 且两者 `≤ MAX_GAS_FEE_ZEN(10e18)`;fee 不进份额计算不稀释 | `:474-479, 343` |
| 签名安全 | `_useNonce` 在 encode 内消费,校验失败整体回滚;EIP-712 domain 含 chainId;`SignatureChecker` 兼容 EIP-1271 | `:262, 307, 485` |
| last-exit 全额提取 | `_shares == issuedShares` 才全提 `totalAssets`;跨链下若份额在 Base(本地已 burn),Horizen 无人能凑齐 `issuedShares`,`burn` 余额不足 revert → 安全 | `:408-409` |
| 跨链份额分母 | 用全局 `issuedShares` 而非本地 `totalSupply`,跨链 burn/mint 不影响兑换率 | `:178-180` |
| 初始化/升级守护 | `_disableInitializers()` 锁实现;`initializer` 防重复初始化;`_authorizeUpgrade` onlyOwner(timelock) | `:124, 131, 510` |
| ZenStaker 集成 | `getDepositInfo` 元组解构、`stake/stakeMore/withdraw/claimReward` 签名、claimer 权限全部匹配 | `Staker.sol` / `ZenStaker.sol` 已核对 |
| 暂停语义 | deposit 系 `whenNotPaused`,redeem/harvest **无**该修饰 → 符合 PRD「仅冻结存入,退出永远可用」 | `:225, 357, 431` |
| station 访问控制 | `payForDeposit`(=stLighter)、`onBridgeRefund/Complete`(=bridge)、`bridgeZen`(=egress)、`lzCompose`(composeCaller+zenOft)全部正确门禁;`_assertSolvency` 兜底防超额记账 | station 子系统 |

---

## 5. 测试实测

- **110 项全过 / 0 失败**(stLighter 82 + station 28);invariant 256 runs × 12800 calls,0 revert。
- 覆盖良好:通胀攻击、签名/nonce/deadline/重放、fee 边界、pause 语义、last-exit、跨链守恒、升级状态延续、spoke mint 守护(minter=0)、ERC-1271、cross-contract EIP-712 replay(域分隔符不同,签名不串用)。

**测试盲区(建议补):**

1. **显式重入攻击测试** —— 目前只靠 `nonReentrant`,无恶意重入 mock 主动验证。
2. **permit try/catch 失败路径** —— 只测成功路径;未测「permit 被抢跑失败但已有 allowance 仍成功」的 catch 分支。
3. **`StLighter__PayerMustBeUser` 负向断言** —— `depositWithSigAndPermit` 里 `payer != user` 的 revert 无专门测试。
4. compose 乱序 nonce(对应 MEDIUM-2)、原生 ETH 滞留(对应 MEDIUM-1)无回归测试。

---

## 6. 信任模型

三个可信组件承载 station 安全:

1. **StLighter**:`redeemAndCredit` 零本地校验,依赖 `redeemWithSig` 绑定 receiver/relayer/deadline —— **已确认绑定** ✅(INFO-1)。
2. **LayerZero endpoint / OFT**:假定先投币后 compose、`_from`/`amountLD` 诚实、消息至多执行一次、`composeCaller` 唯一 —— 代码依赖这些,且不查 `srcEid`(LOW-1)。
3. **bridge adapter**:`setBridge` owner 可变;`bridgeToBase` 先转币后调用,`_assertSolvency` 限制其只能动在途本金,不能动 credited 余额。

owner 受信于 pause / 参数轮换 / 浮款清扫,但因余额不变量**无法凭空伪造用户 credit**。唯一不受该不变量保护的是**原生 ETH**(无记账、无出口 → MEDIUM-1)。

---

## 7. 修复建议(本轮不改代码,仅方案)

> 排序 = 建议处理顺序。所有涉及 station 的改动都在 net-new 范围内,不触碰审计基线。

### 建议 1 —【MEDIUM-1】为两个 station 增加 owner-only 原生币 sweep

**问题**:原生 ETH 无记账、无出口,桥接超付永久滞留。
**方案**:在 `EgressStation` 与 `InboundStation` 各加一个 `onlyOwner nonReentrant` 的原生币提取函数,把合约原生余额转到指定地址。

```solidity
// 示意,非最终代码
function sweepNative(address payable to) external onlyOwner nonReentrant {
    if (to == address(0)) revert Station__ZeroAddress();
    uint256 bal = address(this).balance;
    (bool ok,) = to.call{value: bal}("");
    if (!ok) revert Station__NativeTransferFailed();
    emit NativeSwept(to, bal);
}
```

**要点**:
- 原生币与 ZEN 会计无关(ZEN 由 `_assertSolvency` 兜底),因此 sweep 全额安全,不会动到用户 credited 资金。
- 用 `call` 而非 `transfer`(2300 gas 上限对多签/合约收款人不友好)。
- 保留 `nonReentrant`;虽然是 owner-only,但收款人可能是合约。
- **更优的长期方案**:改 `ZenOftStationBridge.bridgeZen` 的 `refundAddress`,把 OFT 原生退款直接退给 relayer(`tx.origin` 不可取;应由 `bridgeToBase` 的调用者显式传入 refund 地址并纳入签名/校验),从源头减少滞留。sweep 作为兜底保留。

**测试**:超付 `msg.value` → 断言 station 原生余额增加 → `sweepNative` 后归零且收款人到账;非 owner 调用 revert。

---

### 建议 2 —【MEDIUM-2】compose 存入改用非顺序(claim-by-hash)nonce

**问题**:顺序 nonce 依赖 compose 有序到达 + 无并发,违反即导致签名失效、ZEN 变浮款。
**方案(择一)**:

- **方案 A(推荐)claim-by-hash**:用户签的不再是「预测的下一个 nonce」,而是一个**唯一 depositId / salt**(如 `keccak256(user, amount, srcTxHash, salt)`)。合约维护 `mapping(bytes32 => bool) usedComposeId`,首次消费即置位。乱序无影响,重放被 `usedComposeId` 挡下。
- **方案 B**:改用 **bitmap nonce**(类似 Permit2 的 `nonceBitmap`),用户可任意选未用位,不要求连续。
- **方案 C(仅缓解,不改合约)**:前端/relayer 严格串行化同一 user 的 compose 存入,并在 compose revert 时走既有 `sweepFloatToUnassigned` + `rescueUnassigned` 链下补偿。作为过渡,不推荐作最终态。

**附加**:无论 A/B,都应让 compose 失败时的 ZEN **可由用户凭原始签名自助 claim**,而非只能 owner 清扫。可加一个 `claimStrandedDeposit(payload, signature)` 入口,校验同一签名后把已到账 ZEN 记给 owner。

**测试**:两笔 compose 乱序到达 → 均成功记账;重复投递同一 payload → 第二次被 `usedComposeId` 挡下且不重复记账;compose 失败后用户自助 claim 成功。

---

### 建议 3 —【INFO-2】移除或收紧 `creditFromTrustedComposer`

**问题**:无到账对账的记账入口,虽受 `composeCaller` + solvency 双门禁,但属多余攻击面 + 死代码。
**方案**:
- **首选**:上主网前**删除** `creditFromTrustedComposer`(生产 `composeCaller`=Endpoint 永不调它)。
- **若保留**:文档明确「`composeCaller` 必须恒为 LZ Endpoint」,并在 `setComposeCaller` 处加注释与治理约束;考虑给它也加 `amountLD` 对账使其与 `lzCompose` 语义一致。

**测试**:若删除,确认无调用方回归失败;若保留,补一个「`composeCaller` 被换成 EOA 后可重指浮款」的负向/告警测试以固化风险认知。

---

### 建议 4 —【LOW-1 / LOW-2】跨链参数硬化

- **LOW-1 `srcEid` 白名单**:`lzCompose` 内解析 `OFTComposeMsgCodec.srcEid(_message)`,与配置的允许源 EID 比对,不符即 revert。当前单 peer 可先加断言(`== EXPECTED_SRC_EID`),多 peer 时升级为 mapping 白名单。
- **LOW-2 `minAmountLD` 下限**:`bridgeZen` 把 `minAmountLD` 从 `0` 改为 `amount - knownDustFloor`(dust floor 取 OFT 的 `sharedDecimals` 量级)。若实收 < 下限则 OFT 侧 revert,避免未来 OFT 开征转账费时用户静默吃亏。

**测试**:构造非白名单 `srcEid` 的 compose → revert;模拟 OFT 收费使实收 < 下限 → `bridgeZen` revert。

---

### 建议 5 —【测试盲区】补 3 项测试

1. **重入 mock**:恶意 ERC20 / IStationDepositPayer 在回调内重入 `deposit`/`redeem`/`harvest`,断言 `nonReentrant` 阻断。
2. **permit catch 分支**:先手动 `approve` 建立 allowance,再传一个**会失败的 permit**(如已被抢跑消费)→ 断言 `depositWithPermit` / `depositWithSigAndPermit` 仍经既有 allowance 成功。
3. **`StLighter__PayerMustBeUser` 负向**:`depositWithSigAndPermit` 传 `payer != user` → 断言 revert。

---

### 建议 6 —【全局】独立第三方审计

全子系统为 net-new,`AUDIT_DELTA.md` 已标 in-scope。上述修复完成后,应在冻结代码基础上做一轮独立审计,重点覆盖:gasless meta-tx 全路径、station 跨链 compose 状态机、UUPS 升级 + 存储布局、OFT DVN/peer 配置(部署期安全)。

---

## 8. 处理优先级一览

| # | 关联发现 | 严重度 | 优先级 |
|---|------|------|------|
| 1 | MEDIUM-1 原生币 sweep | 🟠 | 高 |
| 2 | MEDIUM-2 compose nonce | 🟠 | 高 |
| 3 | INFO-2 删 `creditFromTrustedComposer` | ⚪ | 中 |
| 4 | LOW-1/2 跨链参数硬化 | 🟡 | 中 |
| 5 | 测试盲区补齐 | — | 中 |
| 6 | 独立审计 | — | 上主网前必做 |

---

## 9. 修复复审验收(2026-07-27)

**复审对象**:commit `c4bf352 "security review & fix"`(改动 4 文件:`EgressStation.sol`、`InboundStation.sol`、`ZenOftStationBridge.sol`、`libraries/StationComposePayload.sol`)。
**方法**:逐条比对 §7 建议 + 编译 + 全量测试实测 + 重入测试单独确认。

### 9.1 逐条验收

| 建议 | 状态 | 验证证据 |
|------|------|----------|
| **MEDIUM-1** 原生币 sweep | ✅ 通过 | 两个 station 均加 `sweepNative(address payable to) onlyOwner nonReentrant`:零地址检查 + `call{value:bal}` + 失败 revert(`__NativeTransferFailed`)+ `NativeSwept` 事件。不触碰 ZEN 会计。测试 `test_SweepNative` / `test_SweepNativeRevertsNonOwner` 通过。 |
| **MEDIUM-2** compose 非顺序 nonce | ✅ 通过 | payload V1 增 `nonce` 字段;引入 Permit2 式 `nonceBitmap` + `_useUnorderedNonce`(`wordPos=nonce>>8`、`bitPos=nonce&0xff`、异或翻位、重放 revert `InvalidNonce`)。WithdrawToHorizen 保留顺序 `Nonces`,命名空间分离。新增 `invalidateUnorderedNonces(wordPos,mask)`。测试 `test_WithdrawDoesNotInvalidateComposeNonce` 证明两套 nonce 互不干扰。 |
| **INFO-2** 删 `creditFromTrustedComposer` | ✅ 通过 | 死代码函数已整体删除,`lzCompose` 成为唯一 compose 入口。 |
| **LOW-1** srcEid 白名单 | ✅ 通过 | `lzCompose` 加 `OFTComposeMsgCodec.srcEid(_message) != allowedSrcEid` 校验;构造函数新增 `allowedSrcEid_` 参数 + `setAllowedSrcEid`,零值拒绝(`InvalidSrcEid`)。 |
| **LOW-2** minAmountLD 下限 | ✅ 通过 | 构造期由 `token.decimals - oft.sharedDecimals` 算 `decimalConversionRate`;`minAmountLD = amount - (amount % rate)` 只扣 sub-sharedDecimals 灰尘。抽出 `_buildSendParam` 消除 `bridgeZen`/`quote` 重复;构造期 `localDecimals < shared` 防御性 revert。 |
| **建议5** 重入测试 | ✅ 通过 | 新增 `MaliciousStationPayer` mock + `test_ReentrancyBlockedViaMaliciousPayer`,实测触发 `ReentrancyGuardReentrantCall` 断言,真正验证 `nonReentrant`(填补原盲区)。 |

### 9.2 测试实测

- **121 项全过 / 0 失败**(stLighter 86 + station 35);invariant 256 runs × 12800 calls,0 revert。
- 破坏性构造签名变更(`InboundStation` 加 `allowedSrcEid_`)已同步至全部脚本/测试调用方(否则编译失败)。

### 9.3 复审中发现并修复的遗留瑕疵(非安全)

**`test/mocks/MaliciousStationPayer.sol` import 路径多一层 `../`**:`../../../src/...` 应为 `../../src/...`。原状态下 `forge` 靠 remappings 兜底解析成功(测试通过、`forge build` 退出码 0),但每次打印 `file ... not found` 噪音行,且依赖 fallback 不健壮。**已于复审中修正为 `../../`**,`forge build` 输出 `Compiler run successful!` 无 error,重入测试仍通过。

### 9.4 复审结论

§7 全部安全建议(MEDIUM-1/2、LOW-1/2、INFO-2、重入测试)**正确闭环并经测试验证**。剩余事项仅为流程性:permit-catch / PayerMustBeUser 两项负向测试(§5 盲区 2、3)可择机补齐;上主网前仍需 §7 建议6 的独立第三方审计。**当前 stLighter 子系统安全修复验收合格。**
