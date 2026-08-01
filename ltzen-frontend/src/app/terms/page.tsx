import type { Metadata } from "next";

/**
 * Terms & Conditions (/terms). Static legal page — no wallet, never chain-gated. Content mirrors
 * docs/legal/terms-and-conditions.md and aligns with the Horizen Foundation's ZEN Staking Terms
 * (https://horizen.io/staking-terms), on top of which this protocol is built.
 *
 * Rendered with lightweight inline typography (no @tailwindcss/typography dependency), reusing the
 * brand surface/display idioms. Bracketed placeholders ([Operator Legal Entity], [Governing
 * Jurisdiction], [legal@…], [DATE]) must be filled in by counsel before public launch.
 */

export const metadata: Metadata = {
  title: "Terms & Conditions — ltZEN",
  description:
    "Terms governing use of the stLighter / ltZEN liquid-staking protocol and interface.",
};

// Fill these in before public launch (see docs/legal/terms-and-conditions.md).
const LAST_UPDATED = "2026-08-01";
const VERSION = "1.0 (Phase 1 — Horizen hub + Base spoke)";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 font-display text-lg font-semibold tracking-tight text-white scroll-mt-20">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-zinc-300">{children}</p>;
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-white">{children}</strong>;
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-3 space-y-2 pl-5 text-sm leading-relaxed text-zinc-300 [&>li]:list-disc [&>li]:marker:text-zinc-600">
      {children}
    </ul>
  );
}

function OL({ children }: { children: React.ReactNode }) {
  return (
    <ol className="mt-3 space-y-2 pl-5 text-sm leading-relaxed text-zinc-300 [&>li]:list-decimal [&>li]:marker:text-zinc-600">
      {children}
    </ol>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-teal underline decoration-brand-teal/40 underline-offset-2 transition hover:decoration-brand-teal"
    >
      {children}
    </a>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="border-b border-white/[0.10] pb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">
          Terms &amp; Conditions
        </h1>
        <p className="mt-2 text-xs text-zinc-500">
          Last updated: {LAST_UPDATED} · Version {VERSION}
        </p>
      </header>

      <div className="pb-4">
        <H2>1. Agreement to Terms</H2>
        <P>
          These Terms &amp; Conditions (<Strong>&ldquo;Terms&rdquo;</Strong>) form a binding
          agreement between you (<Strong>&ldquo;you&rdquo;</Strong>,{" "}
          <Strong>&ldquo;your&rdquo;</Strong>, or <Strong>&ldquo;User&rdquo;</Strong>) and{" "}
          <Strong>Lighter.IM Protocol</Strong> (<Strong>&ldquo;we&rdquo;</Strong>,{" "}
          <Strong>&ldquo;us&rdquo;</Strong>, <Strong>&ldquo;our&rdquo;</Strong>, or the{" "}
          <Strong>&ldquo;Operator&rdquo;</Strong>) governing your access to and use of:
        </P>
        <UL>
          <li>
            the stLighter web application, dashboard, and any related interface hosted at{" "}
            <Strong>https://staking.lighter.im</Strong> (collectively, the <Strong>&ldquo;Interface&rdquo;</Strong>);
            and
          </li>
          <li>
            the stLighter smart-contract protocol, the ltZEN token, and any associated tooling
            (collectively, the <Strong>&ldquo;Protocol&rdquo;</Strong>).
          </li>
        </UL>
        <P>
          The Interface and the Protocol are together referred to as the{" "}
          <Strong>&ldquo;Service&rdquo;</Strong>.
        </P>
        <P>
          <Strong>
            By accessing or using the Service — including connecting a wallet, signing a message, or
            submitting a transaction — you accept these Terms in full. If you do not agree, do not
            use the Service.
          </Strong>
        </P>
        <P>
          Your use of the Service also depends on, and is subject to, the terms of parties we do not
          control, including: the Horizen Foundation&apos;s ZEN Staking Terms (Section 3), the
          Horizen network and the ZenStaker staking contracts, LayerZero messaging, and any
          third-party wallet, bridge, or DeFi application.
        </P>

        <H2>2. Definitions</H2>
        <UL>
          <li>
            <Strong>ZEN</Strong> — the native staking asset of the Horizen network.
          </li>
          <li>
            <Strong>Foundation</Strong> — the Horizen Foundation, which operates the underlying ZEN
            Staking Program described in Section 3. The Operator is <Strong>not</Strong> the
            Foundation and is independent of it.
          </li>
          <li>
            <Strong>ZEN Staking Program / Program</Strong> — the discretionary staking-rewards
            program operated by the Foundation, governed by the Foundation&apos;s ZEN Staking Terms
            at <ExtLink href="https://horizen.io/staking-terms">horizen.io/staking-terms</ExtLink>.
          </li>
          <li>
            <Strong>ZenStaker</Strong> — the audited base staking contract on Horizen into which the
            Protocol deposits ZEN on behalf of all Users. The Protocol is an external caller of
            ZenStaker and does not modify it.
          </li>
          <li>
            <Strong>Protocol / stLighter</Strong> — the liquid-staking contracts that act as the
            single aggregated depositor into ZenStaker, mint and burn ltZEN, and auto-compound
            rewards.
          </li>
          <li>
            <Strong>ltZEN</Strong> — the liquid-staking token you receive when you deposit ZEN.
            ltZEN is a share token (ERC-4626-style accounting) and a LayerZero V2 Omnichain Fungible
            Token (OFT) that circulates natively on Horizen and Base.
          </li>
          <li>
            <Strong>Exchange Rate</Strong> — the amount of ZEN redeemable per ltZEN share, defined
            solely on Horizen and increasing as rewards are compounded.
          </li>
          <li>
            <Strong>Relayer</Strong> — any third party who submits a gasless (meta-transaction) on
            your behalf using a signature you produced.
          </li>
          <li>
            <Strong>Governance</Strong> — the multi-signature and timelock authority holding the
            Protocol&apos;s administrative and upgrade keys.
          </li>
        </UL>

        <H2>3. Relationship to the Horizen ZEN Staking Program</H2>
        <P>
          The Protocol is an <Strong>independent, third-party liquid-staking layer</Strong> built on
          top of the Foundation&apos;s ZEN Staking Program. You acknowledge and agree that:
        </P>
        <OL>
          <li>
            <Strong>The Program is the Foundation&apos;s, not ours.</Strong> The underlying staking
            rewards originate from the Program operated by the Foundation.{" "}
            <Strong>All aspects of the Program are entirely discretionary.</Strong> The Foundation
            may modify, suspend, or discontinue the Program, and change reward rates or funding, at
            any time and without liability to you or to us.
          </li>
          <li>
            <Strong>Reward funding is external and variable.</Strong> The Program&apos;s rewards pool
            is funded from sources determined by the Foundation, which may include DAO
            contributions, ecosystem protocols, validator emissions, and sequencer revenue. We do
            not fund, set, guarantee, or control these rewards, and they may decrease or cease
            entirely.
          </li>
          <li>
            <Strong>We pass through, we do not promise.</Strong> The Protocol passively receives
            Program rewards through ZenStaker and compounds them. Our operation of the Protocol
            creates no obligation on the Foundation, and no representation by us as to the
            Program&apos;s continuation, rate, or funding.
          </li>
          <li>
            <Strong>The Foundation&apos;s terms also apply.</Strong> Your participation is
            additionally subject to the Foundation&apos;s ZEN Staking Terms. In case of conflict
            regarding the underlying Program itself, the Foundation&apos;s terms govern the Program;
            these Terms govern your use of the Protocol and Interface.
          </li>
        </OL>

        <H2>4. Eligibility</H2>
        <P>By using the Service you represent and warrant that:</P>
        <OL>
          <li>
            you are at least 18 years old (or the age of majority in your jurisdiction) and have
            full legal capacity to enter into these Terms;
          </li>
          <li>
            you are <Strong>not</Strong> a resident of, located in, or a citizen of any country or
            region subject to comprehensive sanctions, and you are <Strong>not</Strong> a Prohibited
            Person (Section 5);
          </li>
          <li>
            you are not accessing the Service from, and will not use it in, any jurisdiction where
            doing so would be illegal or would require registration or licensing we have not
            obtained;
          </li>
          <li>
            your use of the Service complies with all laws, rules, and regulations applicable to
            you, including tax and securities laws; and
          </li>
          <li>
            you are solely responsible for determining whether your use of the Service is lawful in
            your jurisdiction.
          </li>
        </OL>
        <P>
          We may restrict or block access from certain jurisdictions or addresses at our discretion,
          but we are under no obligation to monitor or enforce eligibility, and the Protocol&apos;s
          smart contracts are permissionless and operate independently of the Interface.
        </P>

        <H2>5. Prohibited Persons and Uses</H2>
        <P>
          You may not use the Service if you are subject to sanctions administered by the U.S.
          Office of Foreign Assets Control (OFAC), the U.N., the E.U., the U.K., or any other
          applicable authority, or if you are listed on any such sanctions list (a{" "}
          <Strong>&ldquo;Prohibited Person&rdquo;</Strong>).
        </P>
        <P>You agree not to use the Service to:</P>
        <UL>
          <li>
            violate any applicable law or regulation, including anti-money-laundering (AML),
            counter-terrorism-financing (CTF), or sanctions rules;
          </li>
          <li>
            launder funds, finance illicit activity, or conceal the proceeds of crime;
          </li>
          <li>engage in market manipulation, fraud, or any deceptive practice;</li>
          <li>infringe our or any third party&apos;s intellectual-property or other rights;</li>
          <li>
            interfere with, disrupt, or attempt to gain unauthorized access to the Service or its
            infrastructure; or
          </li>
          <li>circumvent any access restriction or geoblock we implement.</li>
        </UL>

        <H2>6. Nature of the Service — Non-Custodial Software</H2>
        <P>
          <Strong>The Service is non-custodial.</Strong> We do not hold, control, or have access to
          your ZEN, ltZEN, private keys, seed phrases, or wallet. All transactions execute directly
          on-chain through smart contracts and are initiated by you (or by a Relayer acting on your
          signed instruction).
        </P>
        <P>
          The Interface is a convenience front-end that helps you construct transactions and read
          on-chain state. It is not required to interact with the Protocol; the smart contracts are
          open-source and can be accessed independently. We do not act as your broker, exchange,
          custodian, financial institution, fiduciary, or advisor, and no such relationship is
          created by your use of the Service.
        </P>
        <P>
          You are solely responsible for the security of your wallet and keys, for verifying every
          transaction and signature before approving it, and for any transaction you (or a Relayer
          on your behalf) submit.{" "}
          <Strong>
            Blockchain transactions are generally irreversible; we cannot cancel, reverse, or
            recover them.
          </Strong>
        </P>

        <H2>7. ltZEN Token — What It Is and Is Not</H2>
        <OL>
          <li>
            <Strong>Not a security; no expectation of profit.</Strong> ltZEN is a utility token
            representing a proportional share of the Protocol&apos;s aggregated ZEN staking
            position. Consistent with the Foundation&apos;s ZEN Staking Terms, participation in
            staking (directly or via the Protocol){" "}
            <Strong>
              does not constitute an offer or sale of securities, an investment product, a
              profit-sharing arrangement, or a financial instrument of any kind
            </Strong>
            , and is designed as an <Strong>alignment and ecosystem participation initiative</Strong>
            .{" "}
            <Strong>
              Participation should not be undertaken with any expectation of profit, financial
              return, or economic benefit.
            </Strong>{" "}
            Rewards and reward rates are not guaranteed.
          </li>
          <li>
            <Strong>Share-based accounting.</Strong> ltZEN uses ERC-4626-style share accounting.
            Your ltZEN balance stays constant while the amount of ZEN each share can redeem changes
            over time with rewards. Your redeemable value is determined by the Exchange Rate, not by
            your raw share count.
          </li>
          <li>
            <Strong>Display convention (decimals offset).</Strong> The Protocol applies a virtual
            decimals offset for inflation-attack protection. As a result, the raw ltZEN balance
            shown by a wallet is denominated on a larger scale than the underlying ZEN and{" "}
            <Strong>does not equal the ZEN amount you can redeem.</Strong> Always rely on the
            Interface&apos;s &ldquo;redeemable ZEN&rdquo; value rather than the raw token balance.
          </li>
          <li>
            <Strong>Rewards are external and variable.</Strong> As described in Section 3, rewards
            originate from the Foundation&apos;s discretionary Program and are compounded by the
            Protocol. We do not fund, set, guarantee, or control the reward rate, and it may decrease
            to zero.
          </li>
          <li>
            <Strong>No principal guarantee.</Strong> The value redeemable per ltZEN can be affected
            by smart-contract behavior, network conditions, rounding, and other risks described in
            Section 12. We do not guarantee that you will be able to redeem any particular amount of
            ZEN.{" "}
            <Strong>
              You should conduct your own research and should not stake more than you can afford to
              lose.
            </Strong>
          </li>
        </OL>

        <H2>8. Deposits, Redemptions, and Compounding</H2>
        <UL>
          <li>
            <Strong>Deposit.</Strong> When you deposit ZEN, the Protocol stakes it into its
            aggregated ZenStaker position and mints ltZEN to you at the current Exchange Rate.
          </li>
          <li>
            <Strong>Redemption.</Strong> You may redeem ltZEN for ZEN at the current Exchange Rate.
            Redemption is immediate, with no lockup or queue imposed by the Protocol, subject to
            network conditions and smart-contract state. <Strong>Redemption occurs on Horizen only.</Strong>{" "}
            If you hold ltZEN on Base, you must bridge it back to Horizen before redeeming.
          </li>
          <li>
            <Strong>Compounding.</Strong> Rewards are compounded back into the staking position
            automatically and via a permissionless harvest function callable by anyone. The Operator
            does not guarantee any particular compounding frequency.
          </li>
          <li>
            <Strong>Rounding.</Strong> Share/asset conversions may round in the Protocol&apos;s favor
            by de-minimis amounts to preserve solvency, consistent with the Protocol&apos;s design.
          </li>
        </UL>

        <H2>9. Fees</H2>
        <UL>
          <li>
            <Strong>Protocol fee.</Strong> The Protocol includes a configurable fee that is set to
            zero at launch. Governance may adjust it, subject to a hard cap of{" "}
            <Strong>2000 basis points (20%)</Strong>. Any change is subject to the timelock described
            in Section 13, giving you a window to exit.
          </li>
          <li>
            <Strong>Gasless (meta-transaction) fee.</Strong> If you use a gasless flow, a Relayer
            pays the network gas (in the network&apos;s native asset) and is reimbursed in ZEN,
            deducted from your deposit or redemption proceeds. <Strong>You cap this fee</Strong> by
            signing a <code className="font-mono text-xs text-brand-teal">maxFeeZen</code> value; the
            Relayer cannot charge more than that amount, and the Protocol applies its own additional
            cap.
          </li>
          <li>
            <Strong>Network (gas) fees.</Strong> Standard on-chain transactions require you to pay
            network gas directly. Fee estimates shown in the Interface are indicative and not
            guaranteed.
          </li>
        </UL>
        <P>
          You are responsible for reviewing all fees and signed values before approving any
          transaction.
        </P>

        <H2>10. Gasless Transactions and Relayers</H2>
        <P>
          The Protocol supports optional gasless operations via EIP-712 signed messages, per-signer
          nonces, and expiries (<Strong>&ldquo;meta-transactions&rdquo;</Strong>). By signing such a
          message you authorize any Relayer to submit the corresponding transaction on your behalf,
          subject to the <code className="font-mono text-xs text-brand-teal">maxFeeZen</code> cap you
          signed. You acknowledge that:
        </P>
        <UL>
          <li>
            Relaying is <Strong>permissionless and best-effort</Strong> — no Relayer is obligated to
            submit your transaction, and we do not guarantee that any transaction will be relayed,
            included, or executed within any timeframe;
          </li>
          <li>
            Relayers are independent third parties; where we or an affiliate operate a Relayer, we
            still make no availability or performance guarantee;
          </li>
          <li>
            a signed but unsubmitted message may be submitted later until it expires or its nonce is
            consumed — you should treat signatures with the same care as transactions; and
          </li>
          <li>
            if a Relayer does not act, you may submit the transaction yourself (paying gas directly)
            or use a different Relayer.
          </li>
        </UL>

        <H2>11. Cross-Chain / Bridging (LayerZero OFT)</H2>
        <P>
          ltZEN moves between Horizen and Base as a LayerZero V2 OFT (burn on the source chain, mint
          on the destination chain; aggregate supply is conserved). You acknowledge and accept that:
        </P>
        <UL>
          <li>
            cross-chain transfers depend on LayerZero messaging and its configured Decentralized
            Verifier Networks (DVNs), which are third-party infrastructure we do not control;
          </li>
          <li>
            bridging carries risks including message failure, delay, misconfiguration, or compromise
            of the messaging layer or DVNs, which could result in <Strong>loss of funds</Strong>;
          </li>
          <li>
            the Exchange Rate is defined solely on Horizen; ltZEN on Base is a mirror representation
            and <Strong>cannot be redeemed on Base</Strong> — you must bridge back to Horizen to
            redeem; and
          </li>
          <li>
            cross-chain transfer is intentionally <Strong>not pausable</Strong>, so that Base-side
            holders can always bridge back to Horizen to redeem.
          </li>
        </UL>

        <H2>12. Assumption of Risk</H2>
        <P>
          You understand and accept the following risks. This list is illustrative, not exhaustive:
        </P>
        <UL>
          <li>
            <Strong>Discretionary program risk.</Strong> The underlying ZEN Staking Program is
            entirely discretionary and may be modified, suspended, or discontinued by the Foundation
            at any time; rewards may be significantly less than anticipated or may not materialize at
            all.
          </li>
          <li>
            <Strong>Smart-contract risk.</Strong> The Protocol consists of software that may contain
            bugs, vulnerabilities, or economic flaws despite testing and any audit. Audits reduce but
            do not eliminate risk.
          </li>
          <li>
            <Strong>No guaranteed returns.</Strong> Rewards are variable, externally funded, and may
            cease. Past performance does not indicate future results.
          </li>
          <li>
            <Strong>Exchange-rate and rounding effects.</Strong> Redeemable value per share
            fluctuates; near-empty pool states can cause transient mathematical fluctuations that do
            not represent loss to a continuous holder.
          </li>
          <li>
            <Strong>Upgradeability and governance risk.</Strong> The Protocol is upgradeable under
            Governance (multisig + timelock). ltZEN itself is non-upgradeable. Governance actions
            could change parameters or logic subject to the timelock delay.
          </li>
          <li>
            <Strong>Bridging / cross-chain risk.</Strong> See Section 11.
          </li>
          <li>
            <Strong>Network risk.</Strong> Horizen, Base, RPC providers, and other infrastructure
            may experience downtime, congestion, reorganizations, or forks.
          </li>
          <li>
            <Strong>Regulatory risk.</Strong> Laws affecting digital assets, staking, and DeFi are
            evolving and may adversely affect the Service or your ability to use it.
          </li>
          <li>
            <Strong>Key-management risk.</Strong> Loss or compromise of your keys results in
            irreversible loss of assets we cannot recover.
          </li>
          <li>
            <Strong>Third-party risk.</Strong> Wallets, bridges, relayers, oracles, indexers, and
            other integrations may fail or behave unexpectedly.
          </li>
          <li>
            <Strong>Tax risk.</Strong> The tax treatment of staking, rewards, and token transfers is
            uncertain in many jurisdictions.
          </li>
        </UL>
        <P>
          <Strong>
            You use the Service entirely at your own risk. You should conduct your own research and
            should not stake more than you can afford to lose.
          </Strong>
        </P>

        <H2>13. Governance, Upgrades, and Emergency Pause</H2>
        <P>
          The Protocol&apos;s administrative and upgrade authority is held by Governance (a
          multi-signature wallet subject to a timelock). Privileged actions — fee changes, contract
          upgrades, and parameter changes — must be initiated by the multisig and take effect only
          after the timelock delay, giving Users a window to exit before changes apply.
        </P>
        <P>
          Governance may implement an{" "}
          <Strong>emergency pause that freezes deposits/minting only</Strong>.{" "}
          <Strong>Redemptions (burn/withdraw) and harvesting remain available at all times</Strong>,
          and cross-chain transfers remain non-pausable, so you can always exit your position. There
          is no instant single-party guardian pause; pause actions go through Governance and the
          timelock.
        </P>

        <H2>14. No Professional Advice</H2>
        <P>
          Nothing in the Service or these Terms constitutes financial, investment, legal, tax,
          accounting, or other professional advice. Information provided through the Interface
          (including APR estimates, exchange rates, and historical figures) is for general and
          illustrative purposes, may be inaccurate or delayed, and should not be relied upon as the
          sole basis for any decision. <Strong>Consult your own qualified advisors before using the
          Service.</Strong> You are solely responsible for your decisions.
        </P>

        <H2>15. Taxes</H2>
        <P>
          You are solely responsible for determining, reporting, and paying any taxes, duties, or
          levies applicable to your use of the Service, including on staking rewards and token
          transactions. We do not withhold taxes and do not provide tax advice or reporting on your
          behalf.
        </P>

        <H2>16. Third-Party Services and Content</H2>
        <P>
          The Service may integrate with or link to third-party products (wallets, RPC nodes, block
          explorers, bridges, indexers such as the project&apos;s subgraph, and DeFi applications).
          We do not control, endorse, or assume responsibility for any third-party service, and your
          use of them is at your own risk and subject to their terms. Data displayed from
          third-party sources (including indexers) may be delayed or inaccurate and is not
          authoritative; on-chain state is the source of truth.
        </P>

        <H2>17. Intellectual Property and Open Source</H2>
        <P>
          The Protocol smart contracts are open-source and licensed under their respective
          license(s) as published in the project repository; your use of that code is governed by
          those licenses. Except as expressly licensed, the Interface, its design, trademarks, logos,
          and brand elements (including the Lighter / ltZEN marks) remain the property of their
          respective owners and may not be used without permission. Nothing in these Terms grants you
          any right in our trademarks.
        </P>

        <H2>18. Disclaimer of Warranties</H2>
        <P>
          <Strong>
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT
            WARRANTY OF ANY KIND.
          </Strong>{" "}
          To the fullest extent permitted by law, we disclaim all warranties, express or implied,
          including merchantability, fitness for a particular purpose, title, and non-infringement.
          We do not warrant that the Service will be uninterrupted, secure, error-free, or free of
          harmful components, that any defect will be corrected, or that the Service, the Protocol,
          or any smart contract will meet your expectations or produce any particular result.
        </P>

        <H2>19. Limitation of Liability</H2>
        <P>
          <Strong>
            To the fullest extent permitted by law, the Operator and its affiliates, contributors,
            officers, employees, and agents will not be liable for any indirect, incidental, special,
            consequential, exemplary, or punitive damages, or for any loss of profits, revenue, data,
            tokens, or digital assets, arising out of or relating to the Service, whether based in
            contract, tort, strict liability, or otherwise, even if advised of the possibility of
            such damages.
          </Strong>
        </P>
        <P>
          <Strong>
            To the extent liability cannot be fully excluded, our aggregate liability arising out of
            or relating to the Service will not exceed the greater of (a) the total fees you paid to
            the Operator for the Service in the [three (3)] months preceding the event giving rise to
            the claim, or (b) [USD 100].
          </Strong>{" "}
          Some jurisdictions do not allow certain limitations; in those cases the limitations apply
          to the maximum extent permitted.
        </P>

        <H2>20. Indemnification</H2>
        <P>
          You agree to indemnify and hold harmless the Operator and its affiliates, contributors,
          officers, employees, and agents from any claim, demand, loss, liability, or expense
          (including reasonable legal fees) arising out of or related to your use of the Service,
          your violation of these Terms, your violation of any law or third-party right, or any
          transaction you initiate or authorize (including via a Relayer).
        </P>

        <H2>21. Changes to the Service and Terms</H2>
        <P>
          We may modify, suspend, or discontinue the Interface (in whole or in part) at any time.
          Because the Protocol is deployed on-chain, the smart contracts may continue to operate
          independently of the Interface. We may update these Terms from time to time; the updated
          version will be indicated by the &ldquo;Last updated&rdquo; date, and your continued use of
          the Service after changes take effect constitutes acceptance. If you do not agree to the
          updated Terms, stop using the Service.
        </P>

        <H2>22. Governing Law and Dispute Resolution</H2>
        <P>
          These Terms are governed by the laws of <Strong>[Governing Jurisdiction]</Strong>, without
          regard to conflict-of-laws principles. Any dispute arising out of or relating to these
          Terms or the Service will be resolved by{" "}
          <Strong>[binding arbitration / the competent courts of [venue]]</Strong>, and you agree to
          submit to that forum. <Strong>[Include or omit a class-action waiver and arbitration
          clause per counsel&apos;s guidance for the chosen jurisdiction.]</Strong>
        </P>

        <H2>23. Miscellaneous</H2>
        <UL>
          <li>
            <Strong>Severability.</Strong> If any provision is held unenforceable, the remaining
            provisions stay in effect and the unenforceable provision is modified to the minimum
            extent necessary.
          </li>
          <li>
            <Strong>No waiver.</Strong> Our failure to enforce any provision is not a waiver of it.
          </li>
          <li>
            <Strong>Assignment.</Strong> You may not assign these Terms without our consent; we may
            assign them to an affiliate or successor.
          </li>
          <li>
            <Strong>Entire agreement.</Strong> These Terms constitute the entire agreement between
            you and us regarding the Service and supersede prior agreements on that subject.
          </li>
          <li>
            <Strong>Language.</Strong> If these Terms are translated, the [English] version prevails
            in case of conflict.
          </li>
        </UL>

        <H2>24. Contact</H2>
        <P>
          Questions about these Terms: <Strong>lighterim@proton.me</Strong>.
        </P>

        <H2>25. Acknowledgment</H2>
        <P>
          By using the Service, you acknowledge that you have read, understood, and agree to these
          Terms; that you understand the underlying ZEN Staking Program is discretionary and operated
          by the Horizen Foundation, not by us; that rewards are not guaranteed and carry no
          expectation of profit, financial return, or economic benefit; and that you should not stake
          more than you can afford to lose.
        </P>
      </div>
    </div>
  );
}
