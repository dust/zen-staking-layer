# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

A bug bounty program covering the Horizen staking system runs on
[Immunefi](https://immunefi.com/).

<!-- TODO: replace with the public Immunefi program link once published -->

For reports outside the bounty scope — or before the program page is live —
use GitHub's private vulnerability reporting on this repository
(*Security → Report a vulnerability*).

## Scope

| Period | Scope |
|---|---|
| Jul 15 – Jul 27, 2026 | **Testnet** deployment (Horizen Testnet, chain ID 2651420) |
| From Jul 27, 2026 | Extended to the **mainnet** deployment (Horizen, chain ID 26514) |

- **Staking contracts & subgraph** — this repository (`src/`, `subgraphs/`).
  In-scope testnet deployment: ZenStaker
  [`0x6BF7CF29a8bcE11Aa62Cf593d165C244fA4d3E31`](https://horizen-testnet.explorer.caldera.xyz/address/0x6BF7CF29a8bcE11Aa62Cf593d165C244fA4d3E31)
  <!-- TODO: add the testnet RewardAccumulator address; add mainnet addresses
  and re-pin the in-scope commit when the mainnet deployment goes live -->
- **Staking dApp** — https://github.com/HorizenOfficial/staker-services,
  deployed at https://staking-testnet.horizen.io

The authoritative scope, impacts, rewards, and rules of engagement are defined
on the Immunefi program page; where this file and the program page differ, the
program page wins.

## Rules of engagement

**Proof-of-concept execution is local-only.** Run PoCs against a local node or
a local fork of testnet/mainnet state (e.g. Anvil/Foundry/Hardhat).
Broadcasting exploit transactions to **any public network — testnet
included — is prohibited**: a public transaction is public disclosure of the
exploit and can be replayed by anyone. Reading public state and forking it
locally is fine.

## Previous audits

The contracts build on the audited Tally/ScopeLift
[Staker](https://github.com/withtally/staker) framework; the audit reports are
in [`audits/`](audits/). Unfixed issues already documented in those reports
are ineligible for the bounty.

## Known behaviors (not vulnerabilities)

The following are documented, intended behaviors of the Phase 1 deployment;
reports based on them are invalid.

1. **RewardAccumulator direct-donation notification** —
   `notifyAlreadyTransferredRewards` only checks that
   `balanceOf(accumulator) − accumulatedRewards ≥ amount`, so tokens sent
   directly to the accumulator by a third party can be "claimed" as a
   notification by any whitelisted caller. Whitelisted notifiers are trusted
   Horizen multisigs; this is accepted behavior.
2. **RewardAccumulator open mode** — if the owner disables the whitelist,
   `transferAndNotifyRewards` becomes permissionless by design (anyone may
   donate rewards). Reward *timing* remains fixed to the schedule grid, so
   reward-rate manipulation via high-frequency notifications is not possible.
3. **Phase 1 configuration** — bumping is disabled (`maxBumpTip = 0`), claim
   fees are 0 and immutable (`MAX_CLAIM_FEE = 0`), earning power is identity
   (earning power == staked balance), delegation surrogates are non-voting,
   and governance delegation is not surfaced. Reports assuming a non-Phase-1
   configuration are invalid.
4. **Admin/owner privileges** — the ZenStaker admin and RewardAccumulator
   owner are Horizen Safe multisigs. Findings requiring a malicious or
   compromised admin/owner are out of scope (standard trusted-role
   assumption).
5. **`permitAndStake` non-functional with production ZEN** — the entry point
   is inherited from the Staker framework, but the production ZEN token does
   not implement EIP-2612 `permit`; the function reverting with the real
   token is expected.
6. **Same-block accrual and idempotent claims** — staking and claiming in the
   same block yields zero rewards by design (flash-stake prevention); a
   second claim in the same block/multicall returns zero instead of
   reverting.
7. **Permissionless, time-gated reward release** — `sendRewardsToStaker` is
   callable by anyone once the time window has elapsed; calling it with zero
   accumulated rewards transfers nothing and advances the schedule grid to
   the latest elapsed window.
8. **Delegation is bookkeeping-only in Phase 1** — `alterDelegatee` updates
   the deposit's delegatee and surrogate assignment, but Phase 1 surrogates
   are non-voting, so no governance power is conferred or movable.
9. **Empty-pool reward semantics** — rewards notified while total earning
   power is zero are handled as documented intentional behavior.
   <!-- TODO: state the exact intended behavior (how such rewards are
   preserved / how the reward timeline extends) -->
