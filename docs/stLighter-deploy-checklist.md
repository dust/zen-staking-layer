# stLighter 主网部署 Checklist

> 双链接线与 DVN 复制在**实际测试网/主网环境**执行；本清单仅作顺序与验收参考。  
> OFT 参考：`docs/stLighter-oft-reference.md` · 治理脚本：`script/DeployStLighterTimelock.s.sol`

## 前置条件

- [ ] ZenStaker 已在 Horizen 主网部署并运行
- [ ] ZEN 代币地址、LayerZero Endpoint V2、DVN 列表已确认（可复制现有 ZenTokenOFT 配置）
- [ ] 治理多签 / Timelock 地址已定
- [ ] `.env` 已按 `.env.template` 填写（**勿提交私钥**）

## 1. Horizen Hub

| 步骤 | 脚本 / 操作 | 验收 |
|------|-------------|------|
| 1.1 | `DeployStLighterHorizen.s.sol` — 部署 ltZEN + StLighter proxy + `setMinter(proxy)` | `ltZen.minter() == proxy` |
| 1.2 | 记录 proxy / impl / ltZEN 地址 | 写入运行手册 |
| 1.3 | `DeployStLighterTimelock.s.sol`（若尚未部署） | timelock 地址 |
| 1.4 | 将 StLighter `owner` 与 ltZEN `owner` 移交 Timelock | `owner() == timelock` |
| 1.5 | 验证 `feeBps == 0`，`pause` 未激活 | 只读检查 |
| 1.6 | 小额 smoke：`deposit` → `harvest`（有奖励时）→ `redeem` | 汇率 / 份额正确 |

## 2. Base Spoke

| 步骤 | 脚本 / 操作 | 验收 |
|------|-------------|------|
| 2.1 | `DeployStLighterBase.s.sol` — 仅 ltZEN，**minter = 0** | `minter() == address(0)` |
| 2.2 | ltZEN `owner` 移交 Timelock（与 Hub 同一治理） | `owner() == timelock` |
| 2.3 | 确认本地无法 `mint` / `burn`（仅 OFT 跨链路径） | `test_SpokeCannotLocalMint` 同类检查 |

## 3. OFT 跨链接线（测试网/主网执行）

| 步骤 | 脚本 / 操作 | 验收 |
|------|-------------|------|
| 3.1 | `WireStLighterOFT.s.sol` — 双向 `setPeer`（EID ↔ 地址） | `peers(eid)` 非零 |
| 3.2 | `ConfigureStLighterOFTDVN.s.sol` — ULN send/receive DVN | 与 ZenTokenOFT 对齐 |
| 3.3 | 小额跨链：Hub → Spoke → Hub | 两链 `totalSupply` 守恒；Horizen `convertToAssets` 不变 |
| 3.4 | 错误 peer / 未配置路径应 revert | 手动负向测试 |

## 4. 治理与升级

| 步骤 | 操作 | 验收 |
|------|------|------|
| 4.1 | Timelock 为 StLighter `owner`；升级经 `UpgradeStLighterViaTimelock.s.sol` | 非 EOA 可直接 `upgradeTo` |
| 4.2 | 升级后 `ltZen.minter` 仍为 proxy 地址 | 存取款正常 |
| 4.3 | 紧急 `pause` 仅挡 deposit；redeem / harvest 可用 | PRD §7 |

## 5. 前端 / Dashboard（合约外）

- [ ] ABI 固定：proxy 地址 + `StLighter` / `LtZEN` 接口
- [ ] Horizen：deposit / redeem / gasless（EIP-712 + 可选 permit）
- [ ] Base：读 ltZEN 余额；跨链桥 UI；赎回路径 = **桥回 Horizen 再 redeem**（若产品确认）
- [ ] 双链 `totalSupply` 与 Hub `convertToAssets` 展示

## 6. 安全评审（上线前）

- [ ] OFT peer、DVN、确认数独立评审（参考 StargateOFTUSDC / ZenTokenOFT）
- [ ] Proxy 升级权限仅 Timelock
- [ ] `AUDIT_DELTA.md` stLighter 审计范围定稿
- [ ] ltZEN 完整 `name` 字符串最终确认（symbol 已为 `ltZEN`）

## 7. 开放项（非阻塞部署脚本）

| 项 | 状态 |
|----|------|
| ltZEN 完整 name | 待定 |
| Harvest keeper 激励 | Phase 1 无；链下 keeper 或用户自触发 |
| 双链 live 测试 | 推迟至测试网部署阶段 |

## 环境变量速查

见 `.env.template`：`ZEN_TOKEN_ADDRESS`、`ADMIN_ADDRESS`、`STLighter_*`、`LZ_*`、`TIMELOCK_*` 等。


``` shell
forge script script/DeployMockZEN.s.sol --rpc-url=$RPC_URL --broadcast --private-key="$PRIVATE_KEY"

forge script script/DeployZenStaker.s.sol --rpc-url=$RPC_URL --broadcast --private-key=$PRIVATE_KEY

ZEN_STAKER=0xb1E4021B36Ad51AE548B2065Bc55A3BACa33187e

forge verify-contract \
  --rpc-url $RPC_URL \
  --verifier blockscout \
  --verifier-url "$RPC_URL/api" \
  $ZEN_STAKER \
  src/ZenStaker.sol:ZenStaker


```

== Logs ==
  LtZEN:          0xF91e475D62E6181C630bf70bCd8564c29b03486B
  Implementation: 0x0d4bE6a999279c8e5Bf7d63FDb0aB626b9275a76
  StLighter proxy: 0xEaAF6a0CF959D0C8b18A79289F4b7c1ce16E41c6
  ZEN:            0x3909EBEE55aa57Cd7b2ce4c05e57C24f7499203A
  ZenStaker:      0xb1E4021B36Ad51AE548B2065Bc55A3BACa33187e
  Timelock:       0x6dF5Ff7f16a8b08908F6B6893fD4e8D84e770679

