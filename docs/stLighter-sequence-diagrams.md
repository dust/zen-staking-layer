# stLighter 时序图

> 配合 `docs/stLighter-PRD.md` 与 `src/stlighter/` 合约骨架阅读。
> 参与者:**User**、**StLighter**(协议合约,Horizen)、**LtZEN**(OFT 份额代币)、**ZenStaker**(底层质押,Horizen)、**ZEN**(代币)、**LZ Endpoint**(LayerZero V2)。
> 关键不变量:兑换率 = `totalAssets / issuedShares`,其中 `issuedShares` 仅随 deposit/redeem 变动,**跨链不影响**。

---

## 1. Deposit(存入,Horizen)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant SL as StLighter
    participant ZS as ZenStaker
    participant ZEN
    participant LT as LtZEN (OFT)

    User->>SL: deposit(assets, receiver)
    Note over SL: whenNotPaused, nonReentrant
    SL->>SL: _harvest() 先复投,刷新兑换率
    SL->>SL: shares = convertToShares(assets)<br/>分母 = issuedShares
    SL->>ZEN: safeTransferFrom(User → SL, assets)
    alt 首次存入(未初始化)
        SL->>ZS: stake(assets, delegatee=SL, claimer=SL)
        ZS-->>SL: depositId
        Note over SL: initialized = true
    else 已初始化
        SL->>ZS: stakeMore(depositId, assets)
    end
    SL->>SL: issuedShares += shares
    SL->>LT: mint(receiver, shares)
    SL-->>User: shares
```

---

## 2. Harvest(复投,permissionless)

```mermaid
sequenceDiagram
    autonumber
    actor Anyone as Anyone / Keeper
    participant SL as StLighter
    participant ZS as ZenStaker
    participant ZEN
    actor Fee as feeRecipient

    Anyone->>SL: harvest()
    Note over SL: 暂停期间仍可调用
    alt 未初始化
        SL-->>Anyone: return(no-op)
    end
    SL->>ZS: claimReward(depositId)
    ZS->>ZEN: transfer(reward → SL)
    ZS-->>SL: claimed
    alt claimed == 0
        SL-->>Anyone: return(no-op)
    end
    SL->>SL: fee = feeBps==0 ? 0 : claimed*feeBps/1e4
    opt fee > 0
        SL->>ZEN: safeTransfer(feeRecipient, fee)
    end
    SL->>ZS: stakeMore(depositId, claimed - fee)
    Note over SL: totalAssets↑, issuedShares 不变<br/>⇒ 每份 ltZEN 价值上升
```

> deposit 与 redeem 入口在处理用户操作前都会内部调用一次 `_harvest()`,因此"先复投再计价"是默认行为;独立 `harvest()` 供 keeper 主动触发,加快复利节奏。

---

## 3. Redeem(赎回,Horizen)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant SL as StLighter
    participant LT as LtZEN (OFT)
    participant ZS as ZenStaker
    participant ZEN

    User->>SL: redeem(shares, receiver)
    Note over SL: nonReentrant;赎回不受 pause 限制
    SL->>SL: _harvest() 强制 claim+restake<br/>已实现奖励全部进入 deposit 本金
    SL->>SL: assets = convertToAssets(shares)<br/>分母 = issuedShares
    SL->>SL: issuedShares -= shares
    SL->>LT: burn(User, shares)
    SL->>ZS: withdraw(depositId, assets)
    ZS->>ZEN: transfer(surrogate → SL, assets)
    SL->>ZEN: safeTransfer(receiver, assets)
    SL-->>User: assets
```

> 先 harvest 的意义:`withdraw` 的可提取上限是 deposit 的 `balance`。把未领取奖励先 claim+restake 进本金,可避免大额赎回因"奖励尚未复投"而被卡在余额上限(PRD §5.6)。

---

## 4. 跨链转移(Horizen → Base,OFT)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant LTH as LtZEN @Horizen
    participant EPH as LZ Endpoint @Horizen
    participant DVN as DVN / Executor
    participant EPB as LZ Endpoint @Base
    participant LTB as LtZEN @Base

    User->>LTH: send(dstEid=Base, to, amount)
    LTH->>LTH: _burn(User, amount) 源链销毁
    LTH->>EPH: lzSend(message)
    EPH-->>DVN: 等待 DVN 验证 + Executor
    DVN->>EPB: 验证通过后投递
    EPB->>LTB: lzReceive(message)
    LTB->>LTB: _mint(to, amount) 目标链铸造
    LTB-->>User: Base 上获得 amount ltZEN
    Note over LTH,LTB: 两链供应量之和守恒<br/>issuedShares(@Horizen 协议)不变 ⇒ 兑换率不变
```

> **关键**:跨链只搬动 ltZEN,不触碰 `StLighter.issuedShares`,也不触碰 ZenStaker 头寸。因此兑换率完全不受跨链影响。Base 端 ltZEN 的"可兑换 ZEN 价值"始终引用 Horizen 的 `convertToAssets`。

---

## 5. Base 用户赎回(Phase 1 体验)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant LTB as LtZEN @Base
    participant Bridge as OFT 跨链(§4)
    participant LTH as LtZEN @Horizen
    participant SL as StLighter @Horizen

    Note over User,LTB: 用户在 Base 持有 ltZEN
    User->>LTB: send(dstEid=Horizen, to=self, amount)
    LTB->>Bridge: burn @Base
    Bridge->>LTH: mint @Horizen
    Note over User,LTH: 桥回完成,Horizen 上获得 ltZEN
    User->>SL: redeem(shares, receiver)
    SL-->>User: ZEN(见流程 3)
```

> Phase 1:Base 用户赎回需"先桥回 Horizen 再 redeem"两步。前端可编排为"一键桥回并赎回"引导(纯前端,非合约)。Base 端直接发起赎回属 Phase 2 的跨链写入范畴。
