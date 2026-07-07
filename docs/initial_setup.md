# Initial Setup Guide (Infra)

This document describes the on-chain components of the ZEN staking system and the procedure to deploy and bootstrap them.

## 1. Components

### ZenStaker

`ZenStaker` (`src/ZenStaker.sol`) is the staking contract users interact with. It is a thin concrete implementation of the audited Tally `Staker` base contract: users stake ZEN and earn ZEN rewards (ZEN-on-ZEN staking).

Reward distribution works as follows:

- Rewards enter the contract through `notifyRewardAmount(amount)`. Only addresses enabled via `setRewardNotifier(address, true)` (admin-only) may call it, and the tokens must already have been transferred to the staker before the call.
- Each notification spreads the amount linearly over `REWARD_DURATION` (**30 days**). If a distribution is already in progress, the remaining rewards are combined with the new amount and re-spread over a fresh 30-day period.
- Stakers accrue rewards proportionally to their stake and claim them at any time.

Administration (setting reward notifiers, transferring the admin role, etc.) is gated to a single `admin` address, set in the constructor and transferable via `setAdmin(newAdmin)`.

### RewardAccumulator

`RewardAccumulator` (`src/RewardAccumulator.sol`) is an upstream collection contract that sits in front of the staker. Its purpose is to let **multiple entities** — the Foundation (protocol rewards) and a set of partners — deposit rewards independently over time, and have them delivered to the staker in a single batch at predefined intervals (**windows**) instead of each entity notifying the staker directly.
We added this because we want the reward window intervals to be fixed: entities must not call the ZenStaker `notifyRewardAmount()` method directly, since every such call would restart the 30-day distribution period.

Funding functions (both optionally restricted to whitelisted addresses):

- `transferAndNotifyRewards(amount)` — pulls `amount` of ZEN from the caller (requires prior ERC20 approval) and records it in `accumulatedRewards`.
- `notifyAlreadyTransferredRewards(amount)` — records tokens that were already transferred to the accumulator manually. The `amount` must not exceed the tokens transferred since the last accounting update.

Configuration functions (owner-only, `Ownable`): `setTimeWindow`, `setWhitelistEnabled`, `setWhitelist(address, bool)`.

### The window mechanism

- At deployment the accumulator records `lastRewardTime = block.timestamp`. The next flush becomes possible at `nextRewardTime() = lastRewardTime + timeWindow`.
- During a window, entities deposit rewards into the accumulator; nothing reaches the staker yet.
- Once the window has elapsed, **anyone** can call `sendRewardsToStaker()`. It transfers the whole `accumulatedRewards` balance to the staker, calls `notifyRewardAmount` on it (the accumulator must therefore be an enabled reward notifier on the staker), resets the accumulated amount to zero, and advances `lastRewardTime` by one window.
- The staker then redistributes the batch to stakers over its standard 30-day `REWARD_DURATION`.

An important consequence: **the first window is empty by construction.** The accumulator can flush funds only after the first `timeWindow` has fully elapsed, so rewards routed through the accumulator reach stakers no earlier than one window after deployment. The bootstrap procedure below covers the first reward.

## 2. Deployment procedure

Roles involved:

- **Deployer** — a developer EOA that performs the initial deployment, then hands over control.
- **Infra multisig** — the maintainer multisig that permanently holds the staker `admin` role and the accumulator ownership after handover.
- **Foundation** — entity funding protocol rewards (also enabled as a direct notifier on the staker for the first reward).
- **Partners** — additional reward sources funding the accumulator.

Steps:

- The deployer deploys the contracts.  The script also enables the accumulator and the Foundation as reward notifiers on the staker. 
  Initial settings will be:
  - window lenght: 30 days
  - accumulator whitelist: disabled
- The Foundation performs the first reward directly on the staker: it transfers the reward amount to the staker, then calls `notifyRewardAmount(amount)` on it.
- Optionally, the deployer removes the Foundation from the staker's reward notifiers (`setRewardNotifier(foundation, false)`) so all subsequent rewards flow only through the accumulator.
- Handover: the deployer transfers the staker `admin` role (`setAdmin(multisig)`) and the accumulator ownership (`transferOwnership(multisig)`) to the infra multisig. After this the deployer key has no privileges.

Steady state:

- During each window, the Foundation and partners deposit rewards into the accumulator (`approve` + `transferAndNotifyRewards(amount)`, or manual transfer + `notifyAlreadyTransferredRewards(amount)`).
- When the window elapses, anyone (typically an infra keeper/cron) calls `sendRewardsToStaker()` on the accumulator.
- The staker spreads each batch over the following WINDOW.
- If needed later, the multisig can enable the accumulator whitelist (`setWhitelistEnabled(true)` + `setWhitelist(entity, true)`) to restrict who can fund rewards on the accumulator.
