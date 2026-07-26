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
    pausedBanner: "Deposits are temporarily paused. Redeeming and viewing are unaffected.",
    stakeFromBaseCta: "Stake from Base instead →",
    noFaucetOnHorizen:
      "Horizen ZEN is a native OFT — there's no faucet here. Mint test ZEN on Base, then stake via From Base (or bridge ZEN to Horizen first).",
  },

  // Cross-chain stake (Base ERC20 ZEN → OFTAdapter → InboundStation → StLighter). Path B; Wave A.
  crossStake: {
    title: "Stake from Base",
    subtitle:
      "Approve and bridge ZEN from Base via the OFT adapter, then stake into stLighter on Horizen. You pay Base gas for approve/send and the LayerZero fee; Horizen stake is signed and relayed.",
    notConfigured:
      "Cross-chain stake isn't configured yet. Set InboundStation, Base ZEN (ERC20), Base ZenTokenOFTAdapter, and LayerZero EIDs in env.",
    progressLabel: "Progress",
    stepAmount: "Amount",
    stepSignCredit: "Authorize credit",
    stepBridge: "Approve & bridge",
    stepWait: "Wait for credit",
    stepStake: "Stake on Horizen",
    stepDone: "Done",
    amountLabel: "Amount (Base ZEN)",
    balance: "Base ZEN balance",
    creditedLabel: "Credited on Horizen Station",
    creditNote:
      "You'll briefly switch to Horizen to sign the Station credit authorization (MetaMask requires the wallet chain to match the EIP-712 domain). Then switch back to Base to approve and bridge.",
    bridgeNote:
      "Base ZEN is a normal ERC20. If needed you approve the ZenTokenOFTAdapter, then send through the adapter (locks ZEN on Base). LayerZero deliver + compose can take a few minutes — you pay Base gas and the LZ native fee. This is not gasless.",
    approveNote: "First bridge needs a one-time approval of Base ZEN to the OFT adapter.",
    waitNote:
      "Polling Horizen for Station credit. Keep this tab open, or come back later — credited balance resumes at stake.",
    stakeNote:
      "Stake uses your Station credit as the ZEN payer. You sign DepositWithSig; a relayer submits on Horizen — you are not paying Horizen gas for this stake.",
    withdrawNote: "Don't want to stake? Withdraw credited ZEN to your Horizen wallet.",
    withdrawCta: "Withdraw credited ZEN",
    signingWithdraw: "Sign to withdraw credited ZEN…",
    withdrawConfirmed: "Credited ZEN withdrawn to Horizen.",
    signingCredit: "Switch to Horizen if needed, then sign credit authorization…",
    creditSigned: "Credit authorization signed.",
    approvingAdapter: "Approve ZEN for the OFT adapter…",
    bridging: "Sending ZEN via OFT adapter…",
    bridgeSent: "Bridge sent. Waiting for Horizen credit…",
    signingStake: "Sign to authorize the stake…",
    relayingStake: "Relayer submitting stake on Horizen…",
    stakeConfirmed: "Cross-chain stake confirmed — ltZEN minted on Horizen.",
    continueSignCredit: "Sign credit authorization",
    continueApprove: "Approve ZEN for adapter",
    continueBridge: "Bridge ZEN from Base",
    continueWait: "Still waiting for credit…",
    continueStake: "Stake credited ZEN",
    startOver: "Start over",
    switchToBase: "Switch to Base to start",
    guideOnHorizen:
      "Cross-chain stake starts on Base with your ZEN. Switch to Base to begin, or stake same-chain on Horizen from the Stake page.",
    guideOnBaseDeposit:
      "Same-chain staking happens on Horizen. Or stake from Base with the cross-chain flow — approve the adapter, bridge ZEN, then relay a Horizen deposit.",
  },

  faucet: {
    note: "Mint up to 256 test ZEN on Base (MockZEN). Then use Stake from Base.",
    success: "Test ZEN minted on Base.",
    guideOnHorizen:
      "The test ZEN faucet is on Base only. Horizen ZEN is a native OFT and cannot be minted from the faucet. Switch to Base to mint.",
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
    redeemToBaseCta: "Redeem to Base instead →",
  },

  // Redeem to Base (Horizen ltZEN → EgressStation → Base ZEN @ B1). Path C; Wave B.
  redeemToBase: {
    title: "Redeem to Base",
    subtitle:
      "Burn ltZEN on Horizen into the Egress Station (redeem + credit in one tx), then bridge ZEN to a Base address you confirm. L3 steps are signed and relayed; you pay only if using Direct submit.",
    notConfigured:
      "Redeem to Base isn't configured yet. Set EgressStation, ZenOftStationBridge, StLighter, Base ZEN, and Base EID in env.",
    progressLabel: "Progress",
    stepAmount: "Amount",
    stepDest: "Confirm Base dest",
    stepRedeem: "Redeem & credit",
    stepBridge: "Bridge to Base",
    stepWait: "Wait for Base",
    stepDone: "Done",
    amountLabel: "Amount (ltZEN)",
    holdings: "You hold",
    youReceiveEst: "Est. ZEN (before fee)",
    destLabel: "Base destination (B1)",
    destNote:
      "ZEN unlocks on Base to this address only. Changing it requires a new signature. Double-check before continuing.",
    destConfirmCta: "Confirm destination",
    destChangeWarn: "You changed the Base destination — confirm again before bridging.",
    creditedLabel: "Credited on Egress Station",
    recoverableNote:
      "Funds are held in the protocol Egress Station. Retry the bridge, or withdraw ZEN to your Horizen wallet.",
    withdrawCta: "Withdraw to Horizen instead",
    signingWithdraw: "Sign to withdraw credited ZEN…",
    withdrawConfirmed: "Credited ZEN withdrawn to Horizen.",
    signingRedeem: "Sign RedeemWithSig (receiver = Egress)…",
    relayingRedeem: "Relayer submitting redeemAndCredit on Horizen…",
    redeemConfirmed: "Redeem + credit confirmed on Egress.",
    signingBridge: "Sign BridgeToBase…",
    relayingBridge: "Relayer bridging ZEN to Base (pays LZ native fee)…",
    bridgeSent: "Bridge sent from Horizen. Waiting for Base ZEN…",
    waitNote: "Polling Base for ZEN at your B1 address. LayerZero delivery can take a few minutes.",
    done: "Redeem to Base complete — ZEN arrived on Base.",
    continueRedeem: "Redeem & credit",
    continueBridge: "Bridge to Base",
    continueWait: "Still waiting for Base…",
    markReceived: "I've received ZEN on Base",
    startOver: "Start over",
    switchToHorizen: "Switch to Horizen to continue",
    guideOnBase:
      "Redeem to Base starts on Horizen with your ltZEN. Switch to Horizen, or bridge ltZEN back from Base first.",
    linkFromRedeem: "Want ZEN on Base instead?",
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
      zen: "ZEN (Horizen OFT)",
      inboundStation: "InboundStation",
      egressStation: "EgressStation",
      zenOftStationBridge: "ZenOftStationBridge",
      baseLtZEN: "ltZEN (Base)",
      baseZen: "ZEN (Base ERC20)",
      baseZenOftAdapter: "ZenTokenOFTAdapter (Base)",
    },
    egressRefundNote: "Outbound LZ native fee refunds to EgressStation (never the relayer EOA).",
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
