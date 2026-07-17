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
  In-scope testnet deployment (see also
  [`docs/explorer-guide.md`](docs/explorer-guide.md)):
  - ZenStaker: [`0x6BF7CF29a8bcE11Aa62Cf593d165C244fA4d3E31`](https://horizen-testnet.explorer.caldera.xyz/address/0x6BF7CF29a8bcE11Aa62Cf593d165C244fA4d3E31)
  - RewardAccumulator: [`0x06f5555fee73EDdc385b6d76FE00DB2D96ccDaE8`](https://horizen-testnet.explorer.caldera.xyz/address/0x06f5555fee73EDdc385b6d76FE00DB2D96ccDaE8)
  <!-- TODO: add mainnet addresses and re-pin the in-scope commit when the
  mainnet deployment goes live -->
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

1. **RewardAccumulator open mode & permissionless contribution** — the
   RewardAccumulator is deployed with `whitelistEnabled = false`, so any
   address may contribute ZEN via `transferAndNotifyRewards` /
   `notifyAlreadyTransferredRewards`, and any address may call
   `sendRewardsToStaker` once the time window has elapsed. Consequences that
   follow *solely* from this permissionless design are accepted: influencing
   the timing of a reward flush within the window-gated schedule (one flush
   per `timeWindow`); blending a new contribution into the ongoing
   `REWARD_DURATION` rate; calling `sendRewardsToStaker` with zero
   accumulated rewards (transfers nothing, advances the schedule grid); and
   crediting ZEN transferred directly to the accumulator as a notification
   (`notifyAlreadyTransferredRewards` validates
   `balanceOf(accumulator) − accumulatedRewards ≥ amount`). Tokens only ever
   flow contributor → accumulator → staker → stakers, so none of these cause
   loss. **Still in scope and NOT excluded by this note:** any path that
   causes loss or incorrect attribution of principal or rewards, permanent
   denial of reward distribution (bricking), extraction of more than was
   contributed, or theft of any funds — regardless of the whitelist setting.
2. **Phase 1 configuration** — bumping is disabled (`maxBumpTip = 0`), claim
   fees are 0 and immutable (`MAX_CLAIM_FEE = 0`), earning power is identity
   (earning power == staked balance), delegation surrogates are non-voting,
   and governance delegation is not surfaced. Reports assuming a non-Phase-1
   configuration are invalid.
3. **Admin/owner privileges** — the ZenStaker admin and RewardAccumulator
   owner are Horizen Safe multisigs. Findings requiring a malicious or
   compromised admin/owner are out of scope (standard trusted-role
   assumption).
4. **`permitAndStake` behavior with production ZEN** — the `permitAndStake` /
   `permitAndStakeMore` entry points are inherited from the Staker framework.
   The production ZEN token does not implement EIP-2612 `permit`, but the
   inherited code wraps the `permit` call in `try/catch`, so a failed or
   unsupported permit does not itself revert — execution falls through to
   the staking step. Consequently: (a) with no allowance, the subsequent
   `transferFrom` reverts (expected — the gasless single-tx path is simply
   unavailable on a non-permit token); (b) with a pre-existing ERC-20
   allowance, `permitAndStake` succeeds and stakes correctly even with dummy
   signature parameters. Both outcomes are expected and not vulnerabilities;
   reports that "permit is ignored / silently swallowed" describe this
   documented, audited try/catch design.
5. **Same-block accrual and idempotent claims** — staking and claiming in the
   same block yields zero rewards by design (flash-stake prevention); a
   second claim in the same block/multicall returns zero instead of
   reverting.
6. **Delegation is bookkeeping-only in Phase 1** — `alterDelegatee` updates
   the deposit's delegatee and surrogate assignment, but Phase 1 surrogates
   are non-voting, so no governance power is conferred or movable.
7. **Empty-pool reward semantics** — while total earning power is zero, the
   reward-per-token accumulator does not advance; rewards attributable to
   such intervals are not distributed to any staker, are not rolled into
   subsequent reward periods, and remain undistributed in the contract
   balance. This is inherited, documented behavior of the audited Staker
   framework, made practically unreachable by the RewardAccumulator's
   scheduled release into a funded pool.
8. **Event schema delta from the audited base** — `StakeDeposited.owner` and
   `StakeWithdrawn.owner` were made `indexed` in the base `Staker.sol`. This
   changes only the EVM log layout (data field → topic slot); no function
   body, storage, or observable on-chain behavior differs from the audited
   version. See [`AUDIT_DELTA.md`](AUDIT_DELTA.md) for the full delta.
