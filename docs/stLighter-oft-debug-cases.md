# stLighter OFT debug cases（备忘）

运维/测试网踩坑记录。正式接线顺序仍以 [`stLighter-deploy-checklist.md`](./stLighter-deploy-checklist.md) 与 [`stLighter-oft-reference.md`](./stLighter-oft-reference.md) 为准。

---

## Case: Committer SUCCEEDED，Executor 一直 WAITING（inbound nonce 空洞）

### 现象

- [LayerZero Scan](https://testnet.layerzeroscan.com/)：`Committer: SUCCEEDED`，`Executor: WAITING`（可很久不动）
- 目的链（Horizen）上 **没有** 对应铸币 / credit
- 容易误判为 `ZenTokenOFT` 坏了；实际 OFT peer / ULN 往往已正常

### 根因

LayerZero V2 同一 messaging channel（`receiver + srcEid + sender`）要求 **按 nonce 顺序执行**。

常见触发：在 **peer / ULN 未齐** 时多次 `send`，source 侧 outbound nonce 已递增（1、2、3…），但目的链从未 `PacketVerified` 这些包。之后配好接线再发成功的一笔（例如 nonce = 4）会：

- 目的链 `inboundPayloadHash(4)` 有值（Committer 已写入）
- `inboundPayloadHash(1..3)` 仍为 `0x0`
- `inboundNonce` / `lazyInboundNonce` 仍为 `0`

Executor 无法跳过空洞去执行 4 → 模拟 `lzReceive` 失败 → 一直 `WAITING`。

### 诊断

```bash
export HORIZEN_RPC=https://horizen-testnet.rpc.caldera.xyz/http
export LZ_ENDPOINT_HZ=0x3aCAAf60502791D199a5a5F0B173D78229eBFe32
export OAPP=$ZEN_TOKEN_ADDRESS   # Horizen ZenTokenOFT（或卡住路径的目的 OApp）
export SRC_EID=40245             # Base Sepolia
# sender = source OApp 左填充 bytes32（例：Base ZenTokenOFTAdapter）
export SENDER=0x00000000000000000000000009201d61a10f0629d7afe2c2883caf328c34c1c3

cast call $LZ_ENDPOINT_HZ "inboundNonce(address,uint32,bytes32)(uint64)" \
  $OAPP $SRC_EID $SENDER --rpc-url $HORIZEN_RPC
cast call $LZ_ENDPOINT_HZ "lazyInboundNonce(address,uint32,bytes32)(uint64)" \
  $OAPP $SRC_EID $SENDER --rpc-url $HORIZEN_RPC

for n in 1 2 3 4 5; do
  echo -n "hash $n: "
  cast call $LZ_ENDPOINT_HZ "inboundPayloadHash(address,uint32,bytes32,uint64)(bytes32)" \
    $OAPP $SRC_EID $SENDER $n --rpc-url $HORIZEN_RPC
done
```

匹配本 case 时典型形态：`lazyInboundNonce == 0`，低序号 hash 全 0，较高序号（Scan 对应那笔）hash 非 0。

Packet header / Scan 上的 **nonce** 也可从 source `PacketSent` 解码确认。

### 修复：`EndpointV2.skip`（按序跳过未验证空洞）

`skip` 只能跳过 **下一个** nonce（`inboundNonce + 1`），且调用者须为 OApp 本身或其 **delegate**（`endpoint.delegates(oapp)`）。  
当前 thin `ZenTokenOFT` **没有** `skipInboundNonce` 入口；delegate/owner EOA 可直接对 Endpoint 调 `skip`：

```bash
# 例：要执行的是 nonce 4，则先 skip 1 → 2 → 3
cast send $LZ_ENDPOINT_HZ "skip(address,uint32,bytes32,uint64)" \
  $OAPP $SRC_EID $SENDER 1 --rpc-url $HORIZEN_RPC --private-key $PRIVATE_KEY
cast send $LZ_ENDPOINT_HZ "skip(address,uint32,bytes32,uint64)" \
  $OAPP $SRC_EID $SENDER 2 --rpc-url $HORIZEN_RPC --private-key $PRIVATE_KEY
cast send $LZ_ENDPOINT_HZ "skip(address,uint32,bytes32,uint64)" \
  $OAPP $SRC_EID $SENDER 3 --rpc-url $HORIZEN_RPC --private-key $PRIVATE_KEY

cast call $LZ_ENDPOINT_HZ "lazyInboundNonce(address,uint32,bytes32)(uint64)" \
  $OAPP $SRC_EID $SENDER --rpc-url $HORIZEN_RPC
# 期望: 3（之后 Executor 可投递 4）
```

之后等待 Executor，或在 LayerZero Scan 上对该消息 **Execute**。  
`skip` 会永久放弃被跳过的 nonce（对应 source 上那些已锁资产/失败路径需单独评估；testnet 通常可接受）。

### 不要和这些混淆

| 信号 | 另案 |
|------|------|
| `WAITING FOR ULN CONFIG` | peer / ULN 未配 — 见 checklist C1；修好后一般要 **新发** 一笔 |
| Executor 失败 / `lzReceiveAlert` | 目的执行 revert（peer、gas、业务逻辑） |
| Compose 路径 | credit 到 `InboundStation` 后再 `lzCompose`；用户 EOA 不会直接到账裸 ZEN |

### 预防

- Phase C1：**双向** `WireZenOft` + **双链** `ConfigureStLighterOFTDVN` 完成后再做 smoke `send`
- ULN/peer 未齐时不要反复跨链发送（每次都会占 outbound nonce）

### 实录索引（2026-07-26 testnet）

- Source tx（Base）：[`0x6c9d1253…0f78`](https://testnet.layerzeroscan.com/tx/0x6c9d1253eeb12c20591b84daa602f580937b81ecf5859de6f3a3d0be22370f78)
- Commit tx（Horizen）：`0x860aa981…7181`（`PacketVerified`，packet nonce = 4）
- Channel：Base Adapter `0x0920…c1C3` → Horizen ZenTokenOFT `0x2555…BffE`；`hash(1..3)=0`，`hash(4)` 已写入
