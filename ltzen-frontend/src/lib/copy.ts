/**
 * Centralized English UI copy (tone-guide §3; frontend-plan §2 lib/copy.ts).
 *
 * All UI text lives here for one-pass review and consistency. Brand spelling is invariant
 * (tone §0): `stLighter` (lowercase initial), `ltZEN`, `ZEN` (all caps), `ZenStaker`,
 * `Horizen`, `Base`, `LayerZero`. No `$` prefix on token names. UI is 100% English.
 *
 * Strings marked NET-NEW were authored to satisfy the all-English rule where the docs only
 * gave Chinese (tone §6) — flagged in comments.
 */

export const copy = {
  brand: {
    name: "ltZEN",
    tagline: "Stake ZEN. Stay liquid. Your ltZEN keeps compounding — no lockups, no claiming.",
    marketing: "Put your ZEN to work — get liquid ltZEN you can use anywhere.",
  },

  labels: {
    exchangeRate: "Exchange Rate",
    apy: "APY (trailing)",
    yourBalance: "Your Balance",
    ltZenShares: "ltZEN shares",
    totalEarned: "Total Earned",
    totalStaked: "Total Staked",
    lastHarvest: "Last Harvest",
    rewardPerTokenRaw: "Reward-per-token (raw)",
  },

  tooltips: {
    exchangeRate: "Updates every block as rewards compound.",
    apy: "Based on realized rate growth, not a guarantee.",
    yourBalance: "Value in ZEN, redeemable on Horizen.",
    ltZenShares: "Accounting units; value shown in ZEN above.",
    totalEarned: "Estimated from your deposit history on this chain.",
    lastHarvest: "Rewards are auto-compounded into the pool.",
    rewardPerTokenRaw: "On-chain accumulator, scaled by 1e36. For verification.",
  },

  microcopy: {
    compounding:
      "Your ltZEN balance stays the same — each one just redeems for more ZEN over time.",
    harvest:
      "Harvests don't bump your value instantly. They make it grow faster from here.",
  },

  states: {
    // NET-NEW (docs only had Chinese "曲线积累中" / "数据积累中"); on-tone English.
    chartAccumulating: "Just getting started — the curve is still filling in.",
    apyAccumulating: "Accumulating data…",
    loadError: "Couldn't load data. Retry.",
    notConfigured: "Not configured yet.",
    connectToView: "Connect your wallet to view your position.",
    noPosition: "You don't hold any ltZEN yet.",
    sessionSampleNote: "Sampled this session — full history coming soon.",
  },

  cta: {
    connect: "Connect Wallet",
    stake: "Stake ZEN",
    redeem: "Redeem",
    viewExplorer: "View on Explorer",
    retry: "Retry",
  },

  units: {
    zen: "ZEN",
    ltZen: "ltZEN",
  },
} as const;

export type Copy = typeof copy;
