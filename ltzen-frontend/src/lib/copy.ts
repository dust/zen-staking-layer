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
    redeeming: "Redeeming…",
    max: "Max",
    getTestZen: "Get test ZEN",
    gettingTestZen: "Requesting…",
    switchToHorizen: "Switch to Horizen",
    fallbackToStandard: "Use a standard deposit instead",
    fallbackToStandardRedeem: "Use a standard redeem instead",
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
    gaslessToggle: "Gasless deposit (sign instead of approve)",
    gaslessUnavailable:
      "Gasless isn't available in production until a relayer is configured. Use a standard deposit.",
    gaslessMaxFee: "Max fee you authorize",
    gaslessEstFee: "Estimated relayer fee",
    gaslessNetStake: "Actually staked",
    gaslessSignNote:
      "Two signatures, no approve transaction. On testnet you confirm one final tx; in production a relayer submits for you.",
    gaslessSuccess: "Gasless stake confirmed.",
    signingDeposit: "Sign to authorize the deposit…",
    signingPermit: "Sign to permit ZEN transfer…",
    submitting: "Submitting to relayer…",
    relayerWaiting: "Waiting for the relayer to land on-chain…",
    pausedBanner: "Deposits are temporarily paused. Redeeming and viewing are unaffected.",
  },

  faucet: {
    note: "Mint test ZEN to try staking on Horizen.",
    success: "Test ZEN minted.",
  },

  // Redeem page (uiux §5.1). All NET-NEW English (docs were Chinese).
  redeem: {
    title: "Redeem ZEN",
    subtitle: "Burn ltZEN and receive ZEN on Horizen. Unsettled rewards are compounded first.",
    amountLabel: "Amount",
    holdings: "You hold",
    youReceive: "You receive",
    byShares: "By ltZEN",
    byZen: "By ZEN",
    inputModeNote: "Enter ltZEN shares, or switch to enter a target ZEN amount.",
    fullRedeemNote: "This redeems your entire position and clears your ltZEN balance.",
    harvestNote: "Pending rewards are auto-compounded into the pool before you redeem.",
    gaslessToggle: "Gasless redeem (sign instead of send)",
    gaslessUnavailable:
      "Gasless isn't available in production until a relayer is configured. Use a standard redeem.",
    gaslessMaxFee: "Max fee you authorize",
    gaslessEstFee: "Estimated relayer fee",
    gaslessNetReceive: "You receive (after fee)",
    gaslessSignNote:
      "One signature, no send transaction. On testnet you confirm one final tx; in production a relayer submits for you.",
    gaslessSuccess: "Gasless redeem confirmed.",
    signing: "Sign to authorize the redeem…",
    submitting: "Submitting to relayer…",
    relayerWaiting: "Waiting for the relayer to land on-chain…",
    confirmed: "Redeem confirmed.",
    noShares: "You don't hold any ltZEN to redeem.",
  },

  // Transparency page (uiux §7). All NET-NEW English (docs were Chinese). Tone: present data
  // raw, state plainly that the frontend only displays values that can be verified on-chain.
  transparency: {
    title: "Transparency",
    subtitle:
      "Every number here is read straight from the contracts. This page only displays it — verify any value on-chain yourself via the explorer links.",
    metricsHeading: "On-chain metrics",
    metricsNote: "Read live from the Horizen hub. Tap any row to open it on the explorer.",
    addressesHeading: "Contracts",
    addressesNote: "Proxy addresses where applicable. Copy or open on the explorer.",
    harvestHeading: "Harvest history",
    harvestPlaceholder:
      "Harvest events will appear here once the indexer is live. Harvests compound rewards into the pool and never move the exchange rate.",
    verifyHint: "Frontend display only — independently verifiable on-chain.",
    copy: "Copy",
    copied: "Copied",
    openExplorer: "Open on explorer",
    metricLabels: {
      rewardPerToken: "Reward-per-token accumulated",
      totalAssets: "Total assets (TVL)",
      issuedShares: "Issued ltZEN shares",
      feeBps: "Fee",
      paused: "Deposits paused",
      implementation: "Implementation",
      minter: "ltZEN minter",
    },
    metricHints: {
      rewardPerToken: "ZenStaker accumulator, raw value scaled by 1e36.",
      totalAssets: "ZEN staked in the vault, in wei.",
      issuedShares: "Total ltZEN accounting units outstanding.",
      feeBps: "Protocol fee in basis points (100 bps = 1%).",
      paused: "When true, deposits are halted; redeeming and viewing are unaffected.",
      implementation: "Current logic contract behind the proxy (ERC-1967 slot).",
      minter: "Address authorized to mint/burn ltZEN (the stLighter vault).",
    },
    addressLabels: {
      stLighterProxy: "stLighter (proxy)",
      stLighterImpl: "stLighter (implementation)",
      ltZEN: "ltZEN",
      zenStaker: "ZenStaker",
      zen: "ZEN",
      baseLtZEN: "ltZEN (Base)",
    },
    paused: { yes: "Yes", no: "No" },
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
    invalidSignature: "Signature rejected — refresh and try again.",
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
    redeemConfirmed: "Redeem confirmed.",
    inFlight: "in progress",
  },

  units: {
    zen: "ZEN",
    ltZen: "ltZEN",
  },
} as const;

export type Copy = typeof copy;
