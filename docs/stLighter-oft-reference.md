# ltZEN OFT 主网参考合约

Horizen mainnet 上已有 LayerZero V2 OFT 部署，ltZEN 跨链安全栈应**对齐同链路的成熟配置**，而非从零选型。

## ZEN 双链形态（与 ltZEN 分开）

| 链 | ZEN | LayerZero |
|----|-----|-----------|
| **Base** | 普通 ERC20（非 OFT） | 已有 **`ZenTokenOFTAdapter`**（`OFTAdapter`）：跨链 **lock** 底层 ZEN |
| **Horizen** | **`ZenTokenOFT`**（原生 `OFT`） | Token 即 OFT；InboundStation / Egress 桥源 |

仓库 mocks：`src/mocks/ZenTokenOFT.sol`、`src/mocks/ZenTokenOFTAdapter.sol`。Compose / stake 路径见 [`stLighter-station-compose-adr.md`](./stLighter-station-compose-adr.md)。

> **勿混淆**: ltZEN 在 Base/Horizen **两侧都是原生 OFT**（mint/burn）。ZEN 则是 **Base Adapter + Horizen 原生 OFT**。

## 参考合约（ltZEN DVN 对齐）

| 合约 | 地址 | 用途 |
|------|------|------|
| **ZenTokenOFT**（Horizen） | [`0x57da2D504bf8b83Ef304759d9f2648522D7a9280`](https://horizen.calderaexplorer.xyz/address/0x57da2D504bf8b83Ef304759d9f2648522D7a9280?tab=contract) | **首选模板** — 原生 `OFT` + `Ownable(delegate)`，与 `LtZEN.sol` 同构；亦为 hub 侧 ZEN |
| **StargateOFTUSDC** | [`0x3a1293Bdb83bBbDd5Ebf4fAc96605aD2021BbC0f`](https://horizen.calderaexplorer.xyz/address/0x3a1293Bdb83bBbDd5Ebf4fAc96605aD2021BbC0f) | Horizen ↔ Base USDC 桥；DVN/确认数/库地址的辅助对照 |

### ZenTokenOFT 源码结构（与 LtZEN 对齐）

```solidity
contract ZenTokenOFT is OFT {
  constructor(string memory _name, string memory _symbol, address _lzEndpoint, address _delegate)
    OFT(_name, _symbol, _lzEndpoint, _delegate)
    Ownable(_delegate)
  {}
}
```

LtZEN 在此基础上增加 `minter`（hub = StLighter proxy；spoke = `address(0)`），跨链路径走 OFT 内置 `_debit/_credit`，**不受 `minter` 门控**。

## 部署接线顺序（ltZEN）

1. **Horizen**：`DeployStLighterHorizen` → 得到 hub `ltZEN`
2. **Base**：`DeployStLighterBase` → 得到 spoke `ltZEN`（`minter = 0`）
3. **双向 peer**（各链各跑一次 `WireStLighterOFT.s.sol`）：
   - Horizen：`PEER_EID` = Base eid，`PEER_LT_ZEN` = Base 合约地址
   - Base：`PEER_EID` = Horizen eid，`PEER_LT_ZEN` = Horizen 合约地址
4. **DVN / ULN**（各链各跑一次 `ConfigureStLighterOFTDVN.s.sol`）：
   - 从 ZenTokenOFT（Horizen ↔ Base 路径）读取 send/receive lib、required DVN、confirmations
   - 填入 env，对 **ltZEN** 调用 `EndpointV2.setConfig`

Cross-chain **ZEN stake** 复用 Base Adapter ↔ Horizen ZenTokenOFT peer/DVN，不另部署 Base 原生 ZEN OFT。

**测试网重部署**（Base Sepolia ↔ Horizen Testnet）：按 [`stLighter-deploy-checklist.md`](./stLighter-deploy-checklist.md) 顺序执行（含 `DeployZenTokenOFT` / `DeployZenTokenOFTAdapter` / `DeployInboundStation` / `WireZenOft`）。

## 从 ZenTokenOFT 复制配置（主网前 checklist）

在目标链 RPC 上，对 ZenTokenOFT 读取（`ZEN_OFT` = 上表地址）：

```bash
# 1. 对端 eid 与 peer（示例：读取 eid 301 的 peer）
cast call $ZEN_OFT "peers(uint32)(bytes32)" $PEER_EID --rpc-url $RPC

# 2. Endpoint 与 send/receive 库（从 LayerZero 文档或 scan 获取库地址后）
cast call $LZ_ENDPOINT "getSendLibrary(address,uint32)(address)" $ZEN_OFT $PEER_EID --rpc-url $RPC
cast call $LZ_ENDPOINT "getReceiveLibrary(address,uint32)(address,bool)" $ZEN_OFT $PEER_EID --rpc-url $RPC

# 3. ULN 配置（configType = 2）
cast call $LZ_ENDPOINT "getConfig(address,address,uint32,uint32)(bytes)" \
  $ZEN_OFT $SEND_LIB $PEER_EID 2 --rpc-url $RPC
cast call $LZ_ENDPOINT "getConfig(address,address,uint32,uint32)(bytes)" \
  $ZEN_OFT $RECEIVE_LIB $PEER_EID 2 --rpc-url $RPC
```

将解码结果中的 `requiredDVNs`、`confirmations` 写入 `ConfigureStLighterOFTDVN` 的 env，对 **ltZEN** 重复 `setConfig`。

> StargateOFTUSDC 为 Stargate 适配器模式，字节码不同，但**同一 Endpoint 上的 DVN 集合与确认数**通常可复用；若 ZenTokenOFT 与 USDC 桥配置一致，可交叉验证。Base 侧 ZEN 桥对照 **`ZenTokenOFTAdapter`**，不是原生 OFT。

## LayerZero Endpoint ID（部署时确认）

| 链 | eid（以 LayerZero 官方文档为准，部署前核实） |
|----|---------------------------------------------|
| Horizen | 待从 ZenTokenOFT `endpoint().eid()` 或 LZ 文档确认 |
| Base | 待从 Base **ZenTokenOFTAdapter** `peers` / LZ 文档确认 |

测试网完整顺序与 smoke：[`stLighter-deploy-checklist.md`](./stLighter-deploy-checklist.md)。

## 脚本映射

| 脚本 | 作用 |
|------|------|
| `script/DeployZenTokenOFT.s.sol` | Horizen 原生 ZEN OFT |
| `script/DeployZenTokenOFTAdapter.s.sol` | Base OFTAdapter |
| `script/DeployInboundStation.s.sol` | InboundStation |
| `script/WireZenOft.s.sol` | ZEN Adapter ↔ ZenTokenOFT `setPeer` |
| `script/WireStLighterOFT.s.sol` | ltZEN `setPeer(peerEid, peerLtZen)` |
| `script/ConfigureStLighterOFTDVN.s.sol` | `EndpointV2.setConfig` — ULN（`OAPP_LOCAL` = ltZEN 或 ZEN OApp） |

## 风险提醒（PRD §8）

- `setPeer` 错配可导致跨链资产损失 → 仅 timelock owner 执行，主网前在测试网双链验证。
- DVN 未配置时 `send` 应安全失败（见 `test/StLighter.crosschain.t.sol`）。
- OFT 跨链** intentionally 不可 pause**，避免困住 Base 端用户。
