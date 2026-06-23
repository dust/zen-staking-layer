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
    approve: "Approve ZEN",
    approving: "Approving…",
    depositing: "Staking…",
    max: "Max",
    getTestZen: "Get test ZEN",
    gettingTestZen: "Requesting…",
    switchToHorizen: "Switch to Horizen",
    fallbackToStandard: "Use a standard deposit instead",
  },

  // Stake page (uiux §4). All NET-NEW English (docs were Chinese).
  stake: {
    title: "Stake ZEN",
    subtitle: "Deposit ZEN and receive ltZEN. It compounds automatically — no claiming, no lockup.",
    amountLabel: "Amount",
    youReceive: "You receive",
    balance: "Balance",
    previewNote: "Estimated from the current exchange rate; settles on-chain.",
    needsApprovalNote: "First stake needs a one-time approval, then the deposit.",
    gaslessToggle: "Gasless deposit (relayer pays gas)",
    gaslessUnavailable: "Gasless isn't available right now — no relayer is configured. You can still stake normally.",
    gaslessMaxFee: "Max fee you authorize",
    gaslessEstFee: "Estimated relayer fee",
    gaslessNetStake: "Actually staked",
    gaslessSignNote: "You only sign — the relayer submits and the fee is taken from your deposit.",
    submitting: "Submitting to relayer…",
    relayerWaiting: "Waiting for the relayer to land on-chain…",
    signing: "Waiting for your signature…",
    pausedBanner: "Deposits are temporarily paused. Redeeming and viewing are unaffected.",
  },

  faucet: {
    note: "Mint test ZEN to try staking on Horizen.",
    success: "Test ZEN minted.",
  },

  // §8.2 error copy — one string per classified kind.
  errors: {
    rejected: "Canceled.",
    insufficientBalance: "Not enough balance.",
    needsApproval: "You need to approve ZEN first.",
    wrongChain: "Wrong network — switch to Horizen.",
    rateMoved: "The rate moved. Refreshing the estimate — please review and retry.",
    paused: "Deposits are temporarily paused. Redeeming and viewing are unaffected.",
    relayerTimeout: "The relayer timed out. You can switch to a standard deposit.",
    rpc: "Couldn't reach the network. Retry.",
    unknown: "Something went wrong. Retry.",
  },

  // Transaction lifecycle toasts (uiux §8.1).
  tx: {
    pending: "Transaction pending…",
    confirmed: "Confirmed.",
    failed: "Transaction failed.",
    approveConfirmed: "Approval confirmed.",
    depositConfirmed: "Stake confirmed.",
    inFlight: "in progress",
  },

  units: {
    zen: "ZEN",
    ltZen: "ltZEN",
  },
} as const;

export type Copy = typeof copy;
