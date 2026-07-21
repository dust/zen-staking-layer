# Lighter Bridge & Zen Staking — 背景与索引

> **权威规范（跨链 + gasless）**: [`stLighter-crosschain-gasless-spec.md`](./stLighter-crosschain-gasless-spec.md)  
> **Station 合约设计**: [`stLighter-station-design.md`](./stLighter-station-design.md)  
> **本文用途**: 历史背景摘要与文档入口；不再展开产品细则。  
> **最后更新**: 2026-07-21

---

## 背景

Horizen (ZEN) 生态中，ZEN 主要在 **Base** 发行；本仓库的 Staker / stLighter 部署在 **Horizen mainnet (L3)**。stLighter 发行池化份额代币 **ltZEN**（EIP-2612 + LayerZero OFT 等），用户通过增加/减少协议在 ZenStaker 中的份额来 mint/burn ltZEN。

早期产品设想（多链 Dashboard、Base 侧跨链能力预留、Horizen 闭环优先）见仓库内 frontend / PRD 文档。ZEN **不支持** EIP-2612，因此不存在完美的 ZEN deposit gasless。

## 2026-06-25 起：跨链及 gasless 方向调整

动机与目标已收敛为：

1. 不提供无意义的「完美 gasless」宣传；保留有意义的真零 gas（ltZEN redeem、Station 路径上的 L3 写入）。
2. 跨链 stake（Base ZEN → **InboundStation** → Horizen ltZEN）与 Redeem to Base（→ **EgressStation** → 用户指定 Base 地址；失败可恢复；退款进 Egress）。
3. 同链与跨链路径分离；`lzCompose` **仅入账**，stake / 出桥由用户签名 + relayer 半编排。

**产品原则** → [`stLighter-crosschain-gasless-spec.md`](./stLighter-crosschain-gasless-spec.md)  
**Station 接口与 EIP-712** → [`stLighter-station-design.md`](./stLighter-station-design.md)

## 相关文档

| 文档 | 内容 |
|------|------|
| [`stLighter-crosschain-gasless-spec.md`](./stLighter-crosschain-gasless-spec.md) | 跨链 / gasless **产品权威规范** |
| [`stLighter-station-design.md`](./stLighter-station-design.md) | **InboundStation / EgressStation** 设计 |
| [`stLighter-relayer-design.md`](./stLighter-relayer-design.md) | Relayer / BFF 校验 |
| [`gasless-acceptance.md`](./gasless-acceptance.md) | Gasless 手动验收 |
| [`stLighter-oft-reference.md`](./stLighter-oft-reference.md) | ltZEN OFT 参考 |
| [`stLighter-frontend-plan.md`](./stLighter-frontend-plan.md) | 前端工程计划（首版范围部分已被规范修订） |
