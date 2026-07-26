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
   - 从已知可用 OApp（或下表 testnet 快照）读取 send/receive lib、required DVN、confirmations
   - 填入 env，对 **ltZEN** 调用 `EndpointV2.setConfig`

Cross-chain **ZEN stake** 复用 Base Adapter ↔ Horizen ZenTokenOFT peer/DVN，不另部署 Base 原生 ZEN OFT。接线同样是 **双向 peer + 双链 ULN**。

**测试网重部署**（Base Sepolia ↔ Horizen Testnet）：按 [`stLighter-deploy-checklist.md`](./stLighter-deploy-checklist.md) 顺序执行（含 `DeployZenTokenOFT` / `DeployZenTokenOFTAdapter` / `DeployInboundStation` / `WireZenOft` / `ConfigureStLighterOFTDVN`）。

## Testnet ULN（Base Sepolia ↔ Horizen Testnet）

`ConfigureStLighterOFTDVN.s.sol` 写入 `EndpointV2.setConfig`（`configType = 2`）。每条链、每个 OApp（ZEN Adapter / ZenTokenOFT / ltZEN）各跑一次。

| Env | Base Sepolia（`PEER_EID=40435`） | Horizen Testnet（`PEER_EID=40245`） |
|-----|----------------------------------|--------------------------------------|
| `LZ_ENDPOINT` | `0x6EDCE65403992e310A62460808c4b910D972f10f` | `0x3aCAAf60502791D199a5a5F0B173D78229eBFe32` |
| `LZ_SEND_LIB` | `0xC1868e054425D378095A003EcbA3823a5D0135C9` | `0x45841dd1ca50265Da7614fC43A361e526c0e6160` |
| `LZ_RECEIVE_LIB` | `0x12523de19dc41c91F7d2093E0CFbB76b17012C8d` | `0xd682ECF100f6F4284138AA925348633B0611Ae21` |
| `DVN_ADDRESSES` | `0xe1a12515f9ab2764b887bf60b923ca494ebbb2d6` | `0xa78a78a13074ed93ad447a26ec57121f29e8fec2` |
| `LZ_CONFIRMATIONS` | `2` | `2` |
| 本链 eid | `40245` | `40435` |

> Base 的 `LZ_RECEIVE_LIB` **不是** `0xd682…`（那是 Horizen receive lib）。混用会导致 `getConfig` revert 或配置写错库。

**故障信号**：LayerZero Scan 显示 `WAITING FOR ULN CONFIG` / Required DVN waiting —— 先查对端 `peers(remoteEid)` 是否非零，再查两侧是否已对**新** OApp 显式 `setConfig`。修完后需**重新发**跨链交易。

**另一类**：`Committer SUCCEEDED` 但 `Executor WAITING` 很久 —— 多为更早失败 `send` 造成的 **inbound nonce 空洞**；用 `Endpoint.skip` 按序跳过未验证 nonce。步骤与实录见 [`stLighter-oft-debug-cases.md`](./stLighter-oft-debug-cases.md)。

曾可用的 Base Adapter 对照（历史地址，仅作 `getConfig` 模板）：[`0xF91e475D62E6181C630bf70bCd8564c29b03486B`](https://base-sepolia.blockscout.com/address/0xF91e475D62E6181C630bf70bCd8564c29b03486B)。

## 从已知 OApp 复制配置

在目标链 RPC 上，对**已工作的**同路径 OApp 读取（testnet 可用上节旧 Adapter / 当前 Adapter；mainnet 用上表 ZenTokenOFT）：

```bash
# 0. 本链 endpoint
cast call $OAPP "endpoint()(address)" --rpc-url $RPC

# 1. 对端 eid 与 peer（必须非零）
cast call $OAPP "peers(uint32)(bytes32)" $PEER_EID --rpc-url $RPC

# 2. send / receive 库（第二返回值 true = 仍走 default lib）
cast call $LZ_ENDPOINT "getSendLibrary(address,uint32)(address)" $OAPP $PEER_EID --rpc-url $RPC
cast call $LZ_ENDPOINT "getReceiveLibrary(address,uint32)(address,bool)" $OAPP $PEER_EID --rpc-url $RPC

# 3. ULN 配置（configType = 2）→ 解码后取 confirmations + requiredDVNs
cast call $LZ_ENDPOINT "getConfig(address,address,uint32,uint32)(bytes)" \
  $OAPP $SEND_LIB $PEER_EID 2 --rpc-url $RPC
cast call $LZ_ENDPOINT "getConfig(address,address,uint32,uint32)(bytes)" \
  $OAPP $RECEIVE_LIB $PEER_EID 2 --rpc-url $RPC
```

将结果写入 `ConfigureStLighterOFTDVN` 的 env（`OAPP_LOCAL`、`PEER_EID`、`LZ_ENDPOINT`、`LZ_SEND_LIB`、`LZ_RECEIVE_LIB`、`LZ_CONFIRMATIONS`、`DVN_ADDRESSES`），对**新部署的** OApp 再跑一遍 `setConfig`。Default lib 上的 pathway ULN **不等于**已为新 OApp 显式配置——部署 checklist 要求显式写入。

> StargateOFTUSDC 为 Stargate 适配器模式，字节码不同，但**同一 Endpoint 上的 DVN 集合与确认数**通常可复用；若 ZenTokenOFT 与 USDC 桥配置一致，可交叉验证。Base 侧 ZEN 桥对照 **`ZenTokenOFTAdapter`**，不是原生 OFT。

## LayerZero Endpoint ID（部署时确认）

| 链 | eid（以 LayerZero 官方文档 / `endpoint.eid()` 为准） |
|----|------------------------------------------------------|
| Horizen Testnet | `40435` |
| Base Sepolia | `40245` |
| Horizen mainnet | 部署前从 ZenTokenOFT / LZ 文档确认 |
| Base mainnet | 部署前从 Adapter / LZ 文档确认 |

测试网完整顺序与 smoke：[`stLighter-deploy-checklist.md`](./stLighter-deploy-checklist.md)。

## 脚本映射

| 脚本 | 作用 |
|------|------|
| `script/DeployZenTokenOFT.s.sol` | Horizen 原生 ZEN OFT |
| `script/DeployZenTokenOFTAdapter.s.sol` | Base OFTAdapter |
| `script/DeployInboundStation.s.sol` | InboundStation |
| `script/WireZenOft.s.sol` | ZEN Adapter ↔ ZenTokenOFT `setPeer`（**每链各一次**） |
| `script/WireStLighterOFT.s.sol` | ltZEN `setPeer(peerEid, peerLtZen)`（**每链各一次**） |
| `script/ConfigureStLighterOFTDVN.s.sol` | `EndpointV2.setConfig` — ULN（`OAPP_LOCAL` = ltZEN 或 ZEN OApp；**每链每 OApp 各一次**） |

## 风险提醒（PRD §8）

- `setPeer` 错配可导致跨链资产损失 → 仅 timelock owner 执行，主网前在测试网双链验证。
- 只配一侧 peer / 漏 ULN → Scan `WAITING FOR ULN CONFIG`；DVN 未配置时跨链应安全失败（见 `test/StLighter.crosschain.t.sol`）。
- OFT 跨链** intentionally 不可 pause**，避免困住 Base 端用户。
