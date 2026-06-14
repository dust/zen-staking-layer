我对Horizen(ZEN)生态比较了解，它现在主要发行在Base链上，而这个Staker将部署在Horizen mainnet(L3, Base链的应用层), 目前在设计一个在它基础上的包装产品(stLighter: Lighter for Horizen Staking Program)，有如下特征：
1. 整个项目完全开源。
2. 多链部署，用户可以切换Base/Horizen网络即可查看当前链下的资产Dashboard. 其中Base链上的操作则需要增加跨链的相关操作，目前可以使用Layerzero/stargate进行整合，为了简单产品设计。目前暂不展开跨链及Base上进行Staking操作的相关设计，但是在Horizen网络上设计时，刚应该预留和保持这种扩展能力和接口。
3. stLighter会发行池化的zen stakeholder token（暂命名为:ltZEN），是一个更先进的ERC Token, 比如支持EIP-2612(考虑直接继承openzeppelin相关库即可)，用户参与stake/redeem时，增加/减少stLighter protocol在 Hoirzen Staker的份额，同时mint/burn这个池化的token(ltZEN).
