# Terms & Conditions

> **Draft for legal review.** This template was drafted to reflect the stLighter / ltZEN protocol as described in the project documentation, and to align with the Horizen Foundation's **ZEN Staking Terms** (https://horizen.io/staking-terms), on top of which this protocol is built. It is **not legal advice** and must be reviewed and adapted by qualified counsel for the operator's jurisdiction before publication. Bracketed items — e.g. **[Operator Legal Entity]**, **[Governing Jurisdiction]**, **[legal@…]** — must be completed prior to going live.

**Last updated: [DATE]**
**Version: 1.0 (Phase 1 — Horizen hub + Base spoke)**

---

## 1. Agreement to Terms

These Terms & Conditions ("**Terms**") form a binding agreement between you ("**you**", "**your**", or "**User**") and **[Operator Legal Entity]** ("**we**", "**us**", "**our**", or the "**Operator**") governing your access to and use of:

- the stLighter web application, dashboard, and any related interface hosted at **[app URL]** (collectively, the "**Interface**"); and
- the stLighter smart-contract protocol, the ltZEN token, and any associated tooling (collectively, the "**Protocol**").

The Interface and the Protocol are together referred to as the "**Service**".

**By accessing or using the Service — including connecting a wallet, signing a message, or submitting a transaction — you accept these Terms in full. If you do not agree, do not use the Service.**

Your use of the Service also depends on, and is subject to, the terms of parties we do not control, including: the **Horizen Foundation's ZEN Staking Terms** (Section 3), the Horizen network and the ZenStaker staking contracts, LayerZero messaging, and any third-party wallet, bridge, or DeFi application.

---

## 2. Definitions

- **ZEN** — the native staking asset of the Horizen network.
- **Foundation** — the **Horizen Foundation**, which operates the underlying ZEN Staking Program described in Section 3. The Operator is **not** the Foundation and is independent of it.
- **ZEN Staking Program / Program** — the discretionary staking-rewards program operated by the Foundation, governed by the Foundation's ZEN Staking Terms at https://horizen.io/staking-terms.
- **ZenStaker** — the audited base staking contract on Horizen into which the Protocol deposits ZEN on behalf of all Users. The Protocol is an external caller of ZenStaker and does not modify it.
- **Protocol / stLighter** — the liquid-staking contracts that act as the single aggregated depositor into ZenStaker, mint and burn ltZEN, and auto-compound rewards.
- **ltZEN** — the liquid-staking token you receive when you deposit ZEN. ltZEN is a **share token** (ERC-4626-style accounting) and a **LayerZero V2 Omnichain Fungible Token (OFT)** that circulates natively on Horizen and Base.
- **Exchange Rate** — the amount of ZEN redeemable per ltZEN share, defined solely on Horizen and increasing as rewards are compounded.
- **Relayer** — any third party who submits a gasless (meta-transaction) on your behalf using a signature you produced.
- **Governance** — the multi-signature and timelock authority holding the Protocol's administrative and upgrade keys.

---

## 3. Relationship to the Horizen ZEN Staking Program

The Protocol is an **independent, third-party liquid-staking layer** built on top of the Foundation's ZEN Staking Program. You acknowledge and agree that:

1. **The Program is the Foundation's, not ours.** The underlying staking rewards originate from the Program operated by the Foundation. **All aspects of the Program are entirely discretionary.** The Foundation may modify, suspend, or discontinue the Program, and change reward rates or funding, at any time and without liability to you or to us.

2. **Reward funding is external and variable.** The Program's rewards pool is funded from sources determined by the Foundation, which may include DAO contributions, ecosystem protocols, validator emissions, and sequencer revenue. We do not fund, set, guarantee, or control these rewards, and they may decrease or cease entirely.

3. **We pass through, we do not promise.** The Protocol passively receives Program rewards through ZenStaker and compounds them. Our operation of the Protocol creates no obligation on the Foundation, and no representation by us as to the Program's continuation, rate, or funding.

4. **The Foundation's terms also apply.** Your participation is additionally subject to the Foundation's ZEN Staking Terms. In case of conflict regarding the underlying Program itself, the Foundation's terms govern the Program; these Terms govern your use of the Protocol and Interface.

---

## 4. Eligibility

By using the Service you represent and warrant that:

1. you are at least 18 years old (or the age of majority in your jurisdiction) and have full legal capacity to enter into these Terms;
2. you are **not** a resident of, located in, or a citizen of any country or region subject to comprehensive sanctions, and you are **not** a Prohibited Person (Section 5);
3. you are not accessing the Service from, and will not use it in, any jurisdiction where doing so would be illegal or would require registration or licensing we have not obtained;
4. your use of the Service complies with all laws, rules, and regulations applicable to you, including tax and securities laws; and
5. you are solely responsible for determining whether your use of the Service is lawful in your jurisdiction.

We may restrict or block access from certain jurisdictions or addresses at our discretion, but we are under no obligation to monitor or enforce eligibility, and the Protocol's smart contracts are permissionless and operate independently of the Interface.

---

## 5. Prohibited Persons and Uses

You may not use the Service if you are subject to sanctions administered by the U.S. Office of Foreign Assets Control (OFAC), the U.N., the E.U., the U.K., or any other applicable authority, or if you are listed on any such sanctions list (a "**Prohibited Person**").

You agree not to use the Service to:

- violate any applicable law or regulation, including anti-money-laundering (AML), counter-terrorism-financing (CTF), or sanctions rules;
- launder funds, finance illicit activity, or conceal the proceeds of crime;
- engage in market manipulation, fraud, or any deceptive practice;
- infringe our or any third party's intellectual-property or other rights;
- interfere with, disrupt, or attempt to gain unauthorized access to the Service or its infrastructure; or
- circumvent any access restriction or geoblock we implement.

---

## 6. Nature of the Service — Non-Custodial Software

**The Service is non-custodial.** We do not hold, control, or have access to your ZEN, ltZEN, private keys, seed phrases, or wallet. All transactions execute directly on-chain through smart contracts and are initiated by you (or by a Relayer acting on your signed instruction).

The Interface is a convenience front-end that helps you construct transactions and read on-chain state. It is not required to interact with the Protocol; the smart contracts are open-source and can be accessed independently. We do not act as your broker, exchange, custodian, financial institution, fiduciary, or advisor, and no such relationship is created by your use of the Service.

You are solely responsible for the security of your wallet and keys, for verifying every transaction and signature before approving it, and for any transaction you (or a Relayer on your behalf) submit. **Blockchain transactions are generally irreversible; we cannot cancel, reverse, or recover them.**

---

## 7. ltZEN Token — What It Is and Is Not

1. **Not a security; no expectation of profit.** ltZEN is a utility token representing a proportional share of the Protocol's aggregated ZEN staking position. Consistent with the Foundation's ZEN Staking Terms, participation in staking (directly or via the Protocol) **does not constitute an offer or sale of securities, an investment product, a profit-sharing arrangement, or a financial instrument of any kind**, and is designed as an **alignment and ecosystem participation initiative**. **Participation should not be undertaken with any expectation of profit, financial return, or economic benefit.** Rewards and reward rates are not guaranteed.

2. **Share-based accounting.** ltZEN uses ERC-4626-style share accounting. Your ltZEN balance stays constant while the amount of ZEN each share can redeem changes over time with rewards. Your redeemable value is determined by the Exchange Rate, not by your raw share count.

3. **Display convention (decimals offset).** The Protocol applies a virtual `DECIMALS_OFFSET` for inflation-attack protection. As a result, the raw ltZEN balance shown by a wallet is denominated on a larger scale than the underlying ZEN and **does not equal the ZEN amount you can redeem.** Always rely on the Interface's "redeemable ZEN" value (computed via `convertToAssets`) rather than the raw token balance.

4. **Rewards are external and variable.** As described in Section 3, rewards originate from the Foundation's discretionary Program and are compounded by the Protocol. We do not fund, set, guarantee, or control the reward rate, and it may decrease to zero.

5. **No principal guarantee.** The value redeemable per ltZEN can be affected by smart-contract behavior, network conditions, rounding, and other risks described in Section 12. We do not guarantee that you will be able to redeem any particular amount of ZEN. **You should conduct your own research and should not stake more than you can afford to lose.**

---

## 8. Deposits, Redemptions, and Compounding

- **Deposit.** When you deposit ZEN, the Protocol stakes it into its aggregated ZenStaker position and mints ltZEN to you at the current Exchange Rate.
- **Redemption.** You may redeem ltZEN for ZEN at the current Exchange Rate. Redemption is immediate, with no lockup or queue imposed by the Protocol, subject to network conditions and smart-contract state. **Redemption occurs on Horizen only.** If you hold ltZEN on Base, you must bridge it back to Horizen before redeeming.
- **Compounding.** Rewards are compounded back into the staking position automatically and via a permissionless `harvest` function callable by anyone. The Operator does not guarantee any particular compounding frequency.
- **Rounding.** Share/asset conversions may round in the Protocol's favor by de-minimis amounts to preserve solvency, consistent with the Protocol's design.

---

## 9. Fees

- **Protocol fee.** The Protocol includes a configurable fee that is **set to zero at launch**. Governance may adjust it, subject to a hard cap of **2000 basis points (20%)**. Any change is subject to the timelock described in Section 13, giving you a window to exit.
- **Gasless (meta-transaction) fee.** If you use a gasless flow, a Relayer pays the network gas (in the network's native asset) and, where applicable, cross-chain messaging fees, and is reimbursed in **ZEN**, deducted from your deposit, redemption, or bridge proceeds. **You cap this fee** by signing a `maxFeeZen` value; the Relayer cannot charge more than that amount, and the Protocol applies its own additional cap. Fee estimates shown before you sign are indicative and may change if network conditions move before submission.
- **Network (gas) fees.** Standard on-chain transactions require you to pay network gas directly. Fee estimates shown in the Interface are indicative and not guaranteed.

You are responsible for reviewing all fees and signed values before approving any transaction.

---

## 10. Gasless Transactions and Relayers

The Protocol supports optional gasless operations via EIP-712 signed messages, per-signer nonces, and expiries ("**meta-transactions**"). By signing such a message you authorize any Relayer to submit the corresponding transaction on your behalf, subject to the `maxFeeZen` cap you signed.

You acknowledge that:

- Relaying is **permissionless and best-effort** — no Relayer is obligated to submit your transaction, and we do not guarantee that any transaction will be relayed, included, or executed within any timeframe;
- Relayers are independent third parties; where we or an affiliate operate a Relayer, we still make no availability or performance guarantee;
- a signed but unsubmitted message may be submitted later until it expires or its nonce is consumed — you should treat signatures with the same care as transactions; and
- if a Relayer does not act, you may submit the transaction yourself (paying gas directly) or use a different Relayer.

---

## 11. Cross-Chain / Bridging (LayerZero OFT)

ltZEN moves between Horizen and Base as a LayerZero V2 OFT (burn on the source chain, mint on the destination chain; aggregate supply is conserved). You acknowledge and accept that:

- cross-chain transfers depend on LayerZero messaging and its configured Decentralized Verifier Networks (DVNs), which are third-party infrastructure we do not control;
- bridging carries risks including message failure, delay, misconfiguration, or compromise of the messaging layer or DVNs, which could result in **loss of funds**;
- the Exchange Rate is defined solely on Horizen; ltZEN on Base is a mirror representation and **cannot be redeemed on Base** — you must bridge back to Horizen to redeem; and
- cross-chain transfer is intentionally **not pausable**, so that Base-side holders can always bridge back to Horizen to redeem.

---

## 12. Assumption of Risk

You understand and accept the following risks. This list is illustrative, not exhaustive:

- **Discretionary program risk.** The underlying ZEN Staking Program is entirely discretionary and may be modified, suspended, or discontinued by the Foundation at any time; rewards may be significantly less than anticipated or may not materialize at all.
- **Smart-contract risk.** The Protocol consists of software that may contain bugs, vulnerabilities, or economic flaws despite testing and any audit. Audits reduce but do not eliminate risk.
- **No guaranteed returns.** Rewards are variable, externally funded, and may cease. Past performance does not indicate future results.
- **Exchange-rate and rounding effects.** Redeemable value per share fluctuates; near-empty pool states can cause transient mathematical fluctuations that do not represent loss to a continuous holder.
- **Upgradeability and governance risk.** The Protocol is upgradeable under Governance (multisig + timelock). ltZEN itself is non-upgradeable. Governance actions could change parameters or logic subject to the timelock delay.
- **Bridging / cross-chain risk.** See Section 11.
- **Network risk.** Horizen, Base, RPC providers, and other infrastructure may experience downtime, congestion, reorganizations, or forks.
- **Regulatory risk.** Laws affecting digital assets, staking, and DeFi are evolving and may adversely affect the Service or your ability to use it.
- **Key-management risk.** Loss or compromise of your keys results in irreversible loss of assets we cannot recover.
- **Third-party risk.** Wallets, bridges, relayers, oracles, indexers, and other integrations may fail or behave unexpectedly.
- **Tax risk.** The tax treatment of staking, rewards, and token transfers is uncertain in many jurisdictions.

**You use the Service entirely at your own risk. You should conduct your own research and should not stake more than you can afford to lose.**

---

## 13. Governance, Upgrades, and Emergency Pause

The Protocol's administrative and upgrade authority is held by Governance (a multi-signature wallet subject to a timelock). Privileged actions — fee changes, contract upgrades, and parameter changes — must be initiated by the multisig and take effect only after the timelock delay, giving Users a window to exit before changes apply.

Governance may implement an **emergency pause that freezes deposits/minting only**. **Redemptions (burn/withdraw) and harvesting remain available at all times**, and cross-chain transfers remain non-pausable, so you can always exit your position. There is no instant single-party guardian pause; pause actions go through Governance and the timelock.

---

## 14. No Professional Advice

Nothing in the Service or these Terms constitutes financial, investment, legal, tax, accounting, or other professional advice. Information provided through the Interface (including APR estimates, exchange rates, and historical figures) is for general and illustrative purposes, may be inaccurate or delayed, and should not be relied upon as the sole basis for any decision. **Consult your own qualified advisors before using the Service.** You are solely responsible for your decisions.

---

## 15. Taxes

You are solely responsible for determining, reporting, and paying any taxes, duties, or levies applicable to your use of the Service, including on staking rewards and token transactions. We do not withhold taxes and do not provide tax advice or reporting on your behalf.

---

## 16. Third-Party Services and Content

The Service may integrate with or link to third-party products (wallets, RPC nodes, block explorers, bridges, indexers such as the project's subgraph, and DeFi applications). We do not control, endorse, or assume responsibility for any third-party service, and your use of them is at your own risk and subject to their terms. Data displayed from third-party sources (including indexers) may be delayed or inaccurate and is not authoritative; on-chain state is the source of truth.

---

## 17. Intellectual Property and Open Source

The Protocol smart contracts are open-source and licensed under their respective license(s) as published in the project repository; your use of that code is governed by those licenses. Except as expressly licensed, the Interface, its design, trademarks, logos, and brand elements (including the Lighter / ltZEN marks) remain the property of their respective owners and may not be used without permission. Nothing in these Terms grants you any right in our trademarks.

---

## 18. Disclaimer of Warranties

**THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND.** To the fullest extent permitted by law, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, title, and non-infringement. We do not warrant that the Service will be uninterrupted, secure, error-free, or free of harmful components, that any defect will be corrected, or that the Service, the Protocol, or any smart contract will meet your expectations or produce any particular result.

---

## 19. Limitation of Liability

**To the fullest extent permitted by law, the Operator and its affiliates, contributors, officers, employees, and agents will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, revenue, data, tokens, or digital assets, arising out of or relating to the Service, whether based in contract, tort, strict liability, or otherwise, even if advised of the possibility of such damages.**

**To the extent liability cannot be fully excluded, our aggregate liability arising out of or relating to the Service will not exceed the greater of (a) the total fees you paid to the Operator for the Service in the [three (3)] months preceding the event giving rise to the claim, or (b) [USD 100].**

Some jurisdictions do not allow certain limitations; in those cases the limitations apply to the maximum extent permitted.

---

## 20. Indemnification

You agree to indemnify and hold harmless the Operator and its affiliates, contributors, officers, employees, and agents from any claim, demand, loss, liability, or expense (including reasonable legal fees) arising out of or related to your use of the Service, your violation of these Terms, your violation of any law or third-party right, or any transaction you initiate or authorize (including via a Relayer).

---

## 21. Changes to the Service and Terms

We may modify, suspend, or discontinue the Interface (in whole or in part) at any time. Because the Protocol is deployed on-chain, the smart contracts may continue to operate independently of the Interface. We may update these Terms from time to time; the updated version will be indicated by the "Last updated" date, and your continued use of the Service after changes take effect constitutes acceptance. If you do not agree to the updated Terms, stop using the Service.

---

## 22. Governing Law and Dispute Resolution

These Terms are governed by the laws of **[Governing Jurisdiction]**, without regard to conflict-of-laws principles. Any dispute arising out of or relating to these Terms or the Service will be resolved by **[binding arbitration / the competent courts of [venue]]**, and you agree to submit to that forum. **[Include or omit a class-action waiver and arbitration clause per counsel's guidance for the chosen jurisdiction.]**

---

## 23. Miscellaneous

- **Severability.** If any provision is held unenforceable, the remaining provisions stay in effect and the unenforceable provision is modified to the minimum extent necessary.
- **No waiver.** Our failure to enforce any provision is not a waiver of it.
- **Assignment.** You may not assign these Terms without our consent; we may assign them to an affiliate or successor.
- **Entire agreement.** These Terms constitute the entire agreement between you and us regarding the Service and supersede prior agreements on that subject.
- **Language.** If these Terms are translated, the **[English]** version prevails in case of conflict.

---

## 24. Contact

Questions about these Terms: **[legal@…]** — **[Operator Legal Entity]**, **[address, if required]**.

---

## 25. Acknowledgment

By using the Service, you acknowledge that you have read, understood, and agree to these Terms; that you understand the underlying ZEN Staking Program is discretionary and operated by the Horizen Foundation, not by us; that rewards are not guaranteed and carry no expectation of profit, financial return, or economic benefit; and that you should not stake more than you can afford to lose.

---

*This document reflects the stLighter / ltZEN Phase 1 design (Horizen hub, Base spoke) and aligns with the Horizen Foundation's ZEN Staking Terms (https://horizen.io/staking-terms). It is a starting template and requires review by qualified legal counsel before publication.*
