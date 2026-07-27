#!/usr/bin/env node
/**
 * RewardAccumulator End-to-End Tests
 *
 * Tests the following 21 scenarios:
 *   1.  Constructor Time Window Upper Limit
 *   2.  Constructor Time Window Zero Rejection
 *   3.  Successful Initial Deployment State
 *   4.  Admin Set Time Window Success
 *   5.  Admin Set Time Window Limits
 *   6.  Admin Whitelist Toggle Control
 *   7.  Admin Whitelist Address Configuration
 *   8.  Non-Owner Admin Actions Restriction
 *   9.  Next Reward Time Calculation
 *   10. Standard Transfer and Notify Accumulation
 *   11. Manual Transfer Notification Validation
 *   12. Manual Transfer Notification Shortfall Rejection
 *   13. Whitelist Enforcement on Direct Transfer
 *   14. Whitelist Enforcement on Manual Notification
 *   15. Bypassed Whitelist Verification
 *   16. Staker Release Time-Lock Enforcement
 *   17. Public Release Trigger Success
 *   18. Zero-Reward Time Release Execution
 *   19. Reward Transfer and Staker Notification
 *   20. Accumulated Balance Reset on Release
 *   21. Time Grid Snapping on Release Delay
 *
 * -- Anvil mode (default) ----------------------------------------------------
 *   npm run e2e:reward-accumulator:anvil
 *
 * -- Testnet / Real network mode --------------------------------------------
 *   npm run e2e:reward-accumulator
 
 */

"use strict";

require("dotenv").config();
const { ethers } = require("ethers");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------------
// CLI / env flags
// ---------------------------------------------------------------------------

const argvAnvilIdx = process.argv.indexOf("--anvil");
const USE_ANVIL = argvAnvilIdx !== -1 || process.env.USE_ANVIL === "true";
const ANVIL_PORT = (() => {
  if (argvAnvilIdx !== -1) {
    const next = process.argv[argvAnvilIdx + 1];
    const n = parseInt(next, 10);
    return Number.isFinite(n) ? n : 8545;
  }
  return parseInt(process.env.ANVIL_PORT || "8545", 10);
})();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ONE_DAY = 24 * 60 * 60;

// On anvil we can fast-forward time for free, so we use a "realistic" 7 day
// window. On a real testnet there is no evm_increaseTime, so tests actually
// have to wait in wall-clock time -- default to a short window (overridable
// via TIME_WINDOW_SECONDS) so the suite finishes in a reasonable time.
const DEFAULT_ANVIL_WINDOW = 7 * ONE_DAY;
const DEFAULT_TESTNET_WINDOW = 30; // seconds
const TIME_WINDOW = parseInt(
  process.env.TIME_WINDOW_SECONDS || (USE_ANVIL ? DEFAULT_ANVIL_WINDOW : DEFAULT_TESTNET_WINDOW),
  10
);
// A little extra buffer added on top of the raw window when waiting for it
// to elapse on a real network, to absorb block-time / RPC latency jitter.
const TESTNET_WAIT_BUFFER_SECONDS = parseInt(process.env.TESTNET_WAIT_BUFFER_SECONDS || "15", 10);

const MAX_TIME_WINDOW = BigInt(90 * ONE_DAY); // must match the contract constant
const ANVIL_HD_PATH = "m/44'/60'/0'/0";

// ---------------------------------------------------------------------------
// Anvil helpers
// ---------------------------------------------------------------------------

function startAnvil(port, mnemonic) {
  return new Promise((resolve, reject) => {
    console.log(`\n  Spawning anvil on port ${port}…`);

    const args = ["--port", String(port)];
    if (mnemonic) args.push("--mnemonic", mnemonic);

    const proc = spawn("anvil", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let ready = false;

    const timeout = setTimeout(() => {
      if (!ready) {
        proc.kill();
        reject(new Error("Anvil did not become ready within 15 s"));
      }
    }, 15_000);

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (!ready && text.includes("Listening on")) {
        ready = true;
        clearTimeout(timeout);
        console.log(`  Anvil ready  : http://127.0.0.1:${port}`);
        resolve(proc);
      }
    });

    proc.stderr.on("data", (chunk) => {
      if (!ready) console.error("  [anvil]", chunk.toString().trim());
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      const hint = err.code === "ENOENT"
        ? " — is Foundry installed? https://getfoundry.sh"
        : "";
      reject(new Error(`Failed to spawn anvil: ${err.message}${hint}`));
    });

    proc.on("exit", (code) => {
      if (!ready) {
        clearTimeout(timeout);
        reject(new Error(`Anvil exited with code ${code} before becoming ready`));
      }
    });
  });
}

async function advanceTime(provider, seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
  console.log(`  [Anvil] Advanced time by ${seconds} s and mined 1 block`);
}

async function currentTimestamp(provider) {
  const block = await provider.getBlock("latest");
  return block.timestamp;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Advances the chain past `seconds` worth of time.
 * On anvil this is instant (evm_increaseTime). On a real network there is no
 * such RPC, so we actually sleep in wall-clock time (plus a small buffer)
 * and let real blocks accumulate on their own.
 */
async function advanceOrWait(provider, seconds) {
  if (USE_ANVIL) {
    await advanceTime(provider, seconds);
    return;
  }
  const waitSeconds = seconds + TESTNET_WAIT_BUFFER_SECONDS;
  console.log(`  [Testnet] Waiting ${waitSeconds} s in real time for the window to elapse…`);
  await sleep(waitSeconds * 1000);
  // nudge a block through so getBlock("latest") reflects fresh time, if the
  // chain is idle
  try { await provider.getBlockNumber(); } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function managedWallet(wallet) {
  // Custom, minimal nonce tracking -- deliberately not ethers' built-in
  // NonceManager, and deliberately not "just query provider.getTransactionCount
  // fresh every time" either. Both of those failed in practice:
  //
  //  - Plain wallets (no manager at all) re-fetch the "pending" nonce from
  //    the node on every send. Right after a tx.wait() resolves, the very
  //    next send can still race the node's own internal nonce bookkeeping
  //    and get back a stale (already-used) count -> "nonce has already
  //    been used".
  //
  //  - ethers' NonceManager avoids that race by tracking the nonce purely
  //    in memory, but it increments its counter *before* knowing whether
  //    the send actually reached the mempool. If gas estimation reverts
  //    before broadcast (e.g. a constructor that's expected to revert),
  //    the counter is still incremented even though no nonce was consumed
  //    on-chain, leaving a permanent gap -- every later tx from that
  //    signer then hangs forever waiting for the missing nonce.
  //
  // This version fetches the starting nonce once, tracks it in memory
  // (no more races), and rolls the counter back on a failed send so a
  // pre-broadcast revert never leaves a gap.
  let noncePromise = null;

  const nextNonce = () => {
    if (noncePromise === null) {
      noncePromise = wallet.provider.getTransactionCount(wallet.address, "pending");
    }
    const reserved = noncePromise;
    noncePromise = reserved.then((n) => n + 1);
    return reserved;
  };

  const originalSendTransaction = wallet.sendTransaction.bind(wallet);
  wallet.sendTransaction = async (tx) => {
    const hasExplicitNonce = tx && tx.nonce !== undefined && tx.nonce !== null;
    const nonce = hasExplicitNonce ? tx.nonce : await nextNonce();
    const txWithNonce = { ...tx, nonce };
    try {
      return await originalSendTransaction(txWithNonce);
    } catch (err) {
      if (!hasExplicitNonce) {
        // The reservation was never actually consumed on-chain (e.g. gas
        // estimation reverted before broadcast) -- give the same nonce
        // back so the next transaction reuses it instead of leaving a gap.
        noncePromise = Promise.resolve(nonce);
      }
      throw err;
    }
  };

  return wallet;
}

function resetWallets(..._wallets) {
  // Intentionally a no-op.
  //
  // ethers' NonceManager already tracks each wallet's nonce correctly in
  // memory across every transaction we send, as long as we always await
  // tx.wait() before moving on (which this script does everywhere).
  //
  // Forcing a manual .reset() between scenarios re-fetches the nonce from
  // the RPC's "latest" view. On anvil (single local node) that's harmless,
  // but on a real testnet behind a load-balanced/public RPC it can return a
  // slightly stale nonce (eventual consistency across read replicas),
  // which then collides with a nonce we already used -> "nonce has already
  // been used". Kept as a no-op (rather than deleted) so existing call
  // sites throughout the scenarios don't need to change.
  return;
}

function loadArtifact(solFile, contractName) {
  const p = path.resolve(__dirname, "../..", "out", solFile, `${contractName}.json`);
  if (!fs.existsSync(p))
    throw new Error(`Artifact not found: ${p}\nRun 'forge build' first.`);
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return { abi: raw.abi, bytecode: raw.bytecode.object };
}

function logTx(label, tx, receipt) {
  console.log(`  OK  ${label}`);
  console.log(`      tx hash : ${tx.hash}`);
  console.log(`      block   : ${receipt.blockNumber}   gas used: ${receipt.gasUsed.toLocaleString()}`);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`\n  FAIL  ${message}`);
    process.exit(1);
  }
  console.log(`  pass  ${message}`);
}

function section(title) {
  const bar = "-".repeat(62);
  console.log(`\n${bar}\n  ${title}\n${bar}`);
}

async function expectRevert(promiseFactory, label) {
  let threw = false;
  try {
    const tx = await promiseFactory();
    await tx.wait();
  } catch (err) {
    threw = true;
    console.log(`  Reverted correctly (${label}): ${err.shortMessage || err.message}`);
  }
  return threw;
}

// ---------------------------------------------------------------------------
// Main E2E script
// ---------------------------------------------------------------------------

async function run() {
  console.log("\n  =============================================================");
  console.log(`  RewardAccumulator E2E Tests [mode: ${USE_ANVIL ? `anvil :${ANVIL_PORT}` : "testnet"}]`);
  console.log("  =============================================================");

  let provider, deployer, notWhitelisted, thirdParty;

  if (USE_ANVIL) {
    const mnemonic = ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(16));
    console.log(`\n  Mnemonic : ${mnemonic}`);

    _anvilProc = await startAnvil(ANVIL_PORT, mnemonic);

    provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${ANVIL_PORT}`);
    const _origEstGas = provider.estimateGas.bind(provider);
    provider.estimateGas = async (tx) => {
      const est = await _origEstGas(tx);
      return est + est / 2n; // 1.5x
    };

    const hdRoot = ethers.HDNodeWallet.fromPhrase(mnemonic, "", ANVIL_HD_PATH);
    deployer = managedWallet(new ethers.Wallet(hdRoot.deriveChild(0).privateKey, provider));
    notWhitelisted = managedWallet(new ethers.Wallet(hdRoot.deriveChild(1).privateKey, provider));
    thirdParty = managedWallet(new ethers.Wallet(hdRoot.deriveChild(2).privateKey, provider));
  } else {
    const { RPC_URL, DEPLOYER_PRIVATE_KEY, USER1_PRIVATE_KEY, USER2_PRIVATE_KEY } = process.env;
    for (const [k, v] of Object.entries({ RPC_URL, DEPLOYER_PRIVATE_KEY, USER1_PRIVATE_KEY, USER2_PRIVATE_KEY })) {
      if (!v) { console.error(`  Missing env var: ${k}`); process.exit(1); }
    }
    provider = new ethers.JsonRpcProvider(RPC_URL);
    const _origEstGasT = provider.estimateGas.bind(provider);
    provider.estimateGas = async (tx) => {
      const est = await _origEstGasT(tx);
      return est + est / 2n;
    };
    deployer = managedWallet(new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider));
    notWhitelisted = managedWallet(new ethers.Wallet(USER1_PRIVATE_KEY, provider));
    thirdParty = managedWallet(new ethers.Wallet(USER2_PRIVATE_KEY, provider));
  }

  _provider = provider;

  console.log(`\n  Deployer       : ${deployer.address}`);
  console.log(`  NotWhitelisted : ${notWhitelisted.address}`);
  console.log(`  ThirdParty     : ${thirdParty.address}`);

  // Load Artifacts
  const mockTokenArtifact = loadArtifact("MockERC20Votes.sol", "ERC20VotesMock");
  const calculatorArtifact = loadArtifact("IdentityEarningPowerCalculator.sol", "IdentityEarningPowerCalculator");
  const zenStakerArtifact = loadArtifact("ZenStaker.sol", "ZenStaker");
  const accumulatorArtifact = loadArtifact("RewardAccumulator.sol", "RewardAccumulator");

  const accIface = new ethers.Interface(accumulatorArtifact.abi);
  _accIface = accIface;

  const TokenFactory = new ethers.ContractFactory(mockTokenArtifact.abi, mockTokenArtifact.bytecode, deployer);
  const CalcFactory = new ethers.ContractFactory(calculatorArtifact.abi, calculatorArtifact.bytecode, deployer);
  const StakerFactory = new ethers.ContractFactory(zenStakerArtifact.abi, zenStakerArtifact.bytecode, deployer);
  const AccumulatorFactory = new ethers.ContractFactory(accumulatorArtifact.abi, accumulatorArtifact.bytecode, deployer);

  // -- Setup shared contracts ---------------------------------------------
  section("Deploying E2E Environment Contracts");

  const tokenContract = await TokenFactory.deploy();
  await tokenContract.deploymentTransaction().wait();
  const rewardToken = tokenContract.attach(await tokenContract.getAddress());
  console.log(`  MockRewardToken deployed at : ${await rewardToken.getAddress()}`);

  const calcContract = await CalcFactory.deploy();
  await calcContract.deploymentTransaction().wait();
  const calculator = calcContract.attach(await calcContract.getAddress());
  console.log(`  Calculator deployed at      : ${await calculator.getAddress()}`);

  const stakerContract = await StakerFactory.deploy(
    await rewardToken.getAddress(),
    await calculator.getAddress(),
    0n,
    deployer.address
  );
  await stakerContract.deploymentTransaction().wait();
  const staker = stakerContract.attach(await stakerContract.getAddress());
  console.log(`  ZenStaker deployed at        : ${await staker.getAddress()}`);

  // Mint some tokens to test accounts, used across scenarios
  const mintAmount = ethers.parseEther("10000");
  await (await rewardToken.connect(deployer).mint(deployer.address, mintAmount)).wait();
  await (await rewardToken.connect(deployer).mint(notWhitelisted.address, mintAmount)).wait();
  console.log("  Minted reward tokens to Deployer and NotWhitelisted.");

  // Helper: deploy a fresh RewardAccumulator instance
  async function deployAccumulator(timeWindow, whitelistEnabled) {
    const c = await AccumulatorFactory.deploy(
      await staker.getAddress(),
      await rewardToken.getAddress(),
      timeWindow,
      whitelistEnabled
    );
    const deployReceipt = await c.deploymentTransaction().wait();
    const deployBlock = await provider.getBlock(deployReceipt.blockNumber);
    const instance = c.attach(await c.getAddress());
    // Authorize the accumulator to notify rewards on the staker
    await (await staker.connect(deployer).setRewardNotifier(await instance.getAddress(), true)).wait();
    return { instance, deployTimestamp: BigInt(deployBlock.timestamp) };
  }

  // =========================================================================
  // SCENARIO 1: Constructor Time Window Upper Limit
  // =========================================================================
  section("Scenario 1: Constructor Time Window Upper Limit");
  resetWallets(deployer);
  {
    const oversizedWindow = MAX_TIME_WINDOW + 1n;
    const threw = await expectRevert(
      async () => AccumulatorFactory.deploy(
        await staker.getAddress(),
        await rewardToken.getAddress(),
        oversizedWindow,
        false
      ),
      "TimeWindowTooLarge"
    );
    assert(threw, "Deployment with time window > 90 days must revert");
  }

  // =========================================================================
  // SCENARIO 2: Constructor Time Window Zero Rejection
  // =========================================================================
  section("Scenario 2: Constructor Time Window Zero Rejection");
  resetWallets(deployer);
  {
    const threw = await expectRevert(
      async () => AccumulatorFactory.deploy(
        await staker.getAddress(),
        await rewardToken.getAddress(),
        0n,
        false
      ),
      "TimeWindowCannotBeZero"
    );
    assert(threw, "Deployment with time window == 0 must revert");
  }

  // =========================================================================
  // SCENARIO 3: Successful Initial Deployment State
  // =========================================================================
  section("Scenario 3: Successful Initial Deployment State");
  resetWallets(deployer);
  const { instance: mainAccumulator, deployTimestamp: deployBlockTs } = await deployAccumulator(TIME_WINDOW, false);

  assert((await mainAccumulator.staker()).toLowerCase() === (await staker.getAddress()).toLowerCase(),
    "staker() must equal the deployed ZenStaker address");
  assert((await mainAccumulator.rewardToken()).toLowerCase() === (await rewardToken.getAddress()).toLowerCase(),
    "rewardToken() must equal the deployed reward token address");
  assert((await mainAccumulator.timeWindow()) === BigInt(TIME_WINDOW), "timeWindow() must equal constructor argument");
  assert((await mainAccumulator.whitelistEnabled()) === false, "whitelistEnabled() must equal constructor argument");
  const initialLastRewardTime = await mainAccumulator.lastRewardTime();
  assert(
    initialLastRewardTime === deployBlockTs,
    `lastRewardTime must be set to the exact deployment block timestamp (expected ${deployBlockTs}, got ${initialLastRewardTime})`
  );

  // =========================================================================
  // SCENARIO 4: Admin Set Time Window Success
  // =========================================================================
  section("Scenario 4: Admin Set Time Window Success");
  resetWallets(deployer);
  {
    const newWindow = 3n * BigInt(ONE_DAY);
    const tx = await mainAccumulator.connect(deployer).setTimeWindow(newWindow);
    const rx = await tx.wait();
    logTx("Owner updated time window", tx, rx);
    assert((await mainAccumulator.timeWindow()) === newWindow, "timeWindow() must reflect the new value");
    // restore for subsequent scenarios
    await (await mainAccumulator.connect(deployer).setTimeWindow(BigInt(TIME_WINDOW))).wait();
  }

  // =========================================================================
  // SCENARIO 5: Admin Set Time Window Limits
  // =========================================================================
  section("Scenario 5: Admin Set Time Window Limits");
  resetWallets(deployer);
  {
    const threwZero = await expectRevert(
      () => mainAccumulator.connect(deployer).setTimeWindow(0n),
      "TimeWindowCannotBeZero"
    );
    assert(threwZero, "Owner setting time window to 0 must revert");

    const threwOversized = await expectRevert(
      () => mainAccumulator.connect(deployer).setTimeWindow(MAX_TIME_WINDOW + 1n),
      "TimeWindowTooLarge"
    );
    assert(threwOversized, "Owner setting time window above 90 days must revert");
  }

  // =========================================================================
  // SCENARIO 6: Admin Whitelist Toggle Control
  // =========================================================================
  section("Scenario 6: Admin Whitelist Toggle Control");
  resetWallets(deployer);
  {
    await (await mainAccumulator.connect(deployer).setWhitelistEnabled(true)).wait();
    assert((await mainAccumulator.whitelistEnabled()) === true, "whitelistEnabled() must be true after enabling");

    await (await mainAccumulator.connect(deployer).setWhitelistEnabled(false)).wait();
    assert((await mainAccumulator.whitelistEnabled()) === false, "whitelistEnabled() must be false after disabling");
  }

  // =========================================================================
  // SCENARIO 7: Admin Whitelist Address Configuration
  // =========================================================================
  section("Scenario 7: Admin Whitelist Address Configuration");
  resetWallets(deployer);
  {
    await (await mainAccumulator.connect(deployer).setWhitelist(deployer.address, true)).wait();
    assert((await mainAccumulator.whitelist(deployer.address)) === true, "Address must be whitelisted after enabling");

    await (await mainAccumulator.connect(deployer).setWhitelist(deployer.address, false)).wait();
    assert((await mainAccumulator.whitelist(deployer.address)) === false, "Address must be removed from whitelist after disabling");
  }

  // =========================================================================
  // SCENARIO 8: Non-Owner Admin Actions Restriction
  // =========================================================================
  section("Scenario 8: Non-Owner Admin Actions Restriction");
  resetWallets(deployer, notWhitelisted);
  {
    const threwTimeWindow = await expectRevert(
      () => mainAccumulator.connect(notWhitelisted).setTimeWindow(BigInt(ONE_DAY)),
      "OwnableUnauthorizedAccount (setTimeWindow)"
    );
    assert(threwTimeWindow, "Non-owner must not be able to set the time window");

    const threwToggle = await expectRevert(
      () => mainAccumulator.connect(notWhitelisted).setWhitelistEnabled(true),
      "OwnableUnauthorizedAccount (setWhitelistEnabled)"
    );
    assert(threwToggle, "Non-owner must not be able to toggle whitelist enforcement");

    const threwWhitelist = await expectRevert(
      () => mainAccumulator.connect(notWhitelisted).setWhitelist(notWhitelisted.address, true),
      "OwnableUnauthorizedAccount (setWhitelist)"
    );
    assert(threwWhitelist, "Non-owner must not be able to modify the whitelist");
  }

  // =========================================================================
  // SCENARIO 9: Next Reward Time Calculation
  // =========================================================================
  section("Scenario 9: Next Reward Time Calculation");
  resetWallets(deployer);
  {
    const lastRewardTime = await mainAccumulator.lastRewardTime();
    const timeWindow = await mainAccumulator.timeWindow();
    const next = await mainAccumulator.nextRewardTime();
    assert(next === lastRewardTime + timeWindow, "nextRewardTime() must equal lastRewardTime + timeWindow");
  }

  // =========================================================================
  // SCENARIO 10: Standard Transfer and Notify Accumulation
  // =========================================================================
  section("Scenario 10: Standard Transfer and Notify Accumulation");
  resetWallets(deployer);
  {
    await (await mainAccumulator.connect(deployer).setWhitelist(deployer.address, true)).wait();

    const transferAmount = ethers.parseEther("50");
    await (await rewardToken.connect(deployer).approve(await mainAccumulator.getAddress(), transferAmount)).wait();

    const accumulatedBefore = await mainAccumulator.accumulatedRewards();
    const balanceBefore = await rewardToken.balanceOf(await mainAccumulator.getAddress());

    const tx = await mainAccumulator.connect(deployer).transferAndNotifyRewards(transferAmount);
    const rx = await tx.wait();
    logTx("Whitelisted user transferred and notified rewards", tx, rx);

    const accumulatedAfter = await mainAccumulator.accumulatedRewards();
    const balanceAfter = await rewardToken.balanceOf(await mainAccumulator.getAddress());

    assert(accumulatedAfter === accumulatedBefore + transferAmount, "accumulatedRewards must increase by transferred amount");
    assert(balanceAfter === balanceBefore + transferAmount, "Contract token balance must increase by transferred amount");
  }

  // =========================================================================
  // SCENARIO 11: Manual Transfer Notification Validation
  // =========================================================================
  section("Scenario 11: Manual Transfer Notification Validation");
  resetWallets(deployer);
  {
    const manualAmount = ethers.parseEther("20");
    // Manually transfer tokens directly to the accumulator, bypassing transferAndNotifyRewards
    await (await rewardToken.connect(deployer).transfer(await mainAccumulator.getAddress(), manualAmount)).wait();

    const accumulatedBefore = await mainAccumulator.accumulatedRewards();
    const tx = await mainAccumulator.connect(deployer).notifyAlreadyTransferredRewards(manualAmount);
    const rx = await tx.wait();
    logTx("Whitelisted user notified a manual transfer", tx, rx);

    const accumulatedAfter = await mainAccumulator.accumulatedRewards();
    assert(accumulatedAfter === accumulatedBefore + manualAmount, "accumulatedRewards must increase by the notified amount");
  }

  // =========================================================================
  // SCENARIO 12: Manual Transfer Notification Shortfall Rejection
  // =========================================================================
  section("Scenario 12: Manual Transfer Notification Shortfall Rejection");
  resetWallets(deployer);
  {
    // Claim a much larger amount than was actually transferred in -> balance - accumulated < amount
    const shortfallAmount = ethers.parseEther("999999");
    const threw = await expectRevert(
      () => mainAccumulator.connect(deployer).notifyAlreadyTransferredRewards(shortfallAmount),
      "TransferNotFound"
    );
    assert(threw, "Notifying an amount that was not actually transferred in must revert");
  }

  // =========================================================================
  // SCENARIO 13: Whitelist Enforcement on Direct Transfer
  // =========================================================================
  section("Scenario 13: Whitelist Enforcement on Direct Transfer");
  resetWallets(deployer, notWhitelisted);
  {
    await (await mainAccumulator.connect(deployer).setWhitelistEnabled(true)).wait();
    // notWhitelisted was never added to the whitelist
    const smallAmount = ethers.parseEther("1");
    await (await rewardToken.connect(notWhitelisted).approve(await mainAccumulator.getAddress(), smallAmount)).wait();

    const threw = await expectRevert(
      () => mainAccumulator.connect(notWhitelisted).transferAndNotifyRewards(smallAmount),
      "NotWhitelisted"
    );
    assert(threw, "Non-whitelisted address must not be able to transfer and notify rewards");
  }

  // =========================================================================
  // SCENARIO 14: Whitelist Enforcement on Manual Notification
  // =========================================================================
  section("Scenario 14: Whitelist Enforcement on Manual Notification");
  resetWallets(notWhitelisted);
  {
    const smallAmount = ethers.parseEther("1");
    const threw = await expectRevert(
      () => mainAccumulator.connect(notWhitelisted).notifyAlreadyTransferredRewards(smallAmount),
      "NotWhitelisted"
    );
    assert(threw, "Non-whitelisted address must not be able to notify manually transferred rewards");
  }

  // =========================================================================
  // SCENARIO 15: Bypassed Whitelist Verification
  // =========================================================================
  section("Scenario 15: Bypassed Whitelist Verification");
  resetWallets(deployer, notWhitelisted);
  {
    await (await mainAccumulator.connect(deployer).setWhitelistEnabled(false)).wait();

    const amount = ethers.parseEther("5");
    await (await rewardToken.connect(notWhitelisted).approve(await mainAccumulator.getAddress(), amount)).wait();

    const accumulatedBefore = await mainAccumulator.accumulatedRewards();
    const tx = await mainAccumulator.connect(notWhitelisted).transferAndNotifyRewards(amount);
    const rx = await tx.wait();
    logTx("Non-whitelisted address transferred rewards while whitelist disabled", tx, rx);

    const accumulatedAfter = await mainAccumulator.accumulatedRewards();
    assert(accumulatedAfter === accumulatedBefore + amount, "Transfer must succeed for any address when whitelist is disabled");
  }

  // =========================================================================
  // SCENARIO 16: Staker Release Time-Lock Enforcement
  // =========================================================================
  section("Scenario 16: Staker Release Time-Lock Enforcement");
  resetWallets(deployer, thirdParty);
  {
    // Deploy fresh so elapsed wall-clock time from earlier scenarios (relevant
    // on a real testnet, where every tx takes real seconds) can't accidentally
    // let the window elapse before we get here.
    const { instance: freshAccumulator } = await deployAccumulator(BigInt(TIME_WINDOW), false);
    const threw = await expectRevert(
      () => freshAccumulator.connect(thirdParty).sendRewardsToStaker(),
      "WaitForNextRewardTime"
    );
    assert(threw, "Releasing rewards before the time-lock window elapses must revert");
  }

  // =========================================================================
  // SCENARIO 17 + 19 + 20: Public Release Trigger Success / Reward Transfer
  //                        and Staker Notification / Accumulated Balance Reset
  // =========================================================================
  section("Scenario 17/19/20: Public Release Trigger, Staker Notification, Balance Reset");
  resetWallets(deployer, thirdParty);
  {
    const windowUsed = await mainAccumulator.timeWindow();
    await advanceOrWait(provider, Number(windowUsed));

    const accumulatedBefore = await mainAccumulator.accumulatedRewards();
    assert(accumulatedBefore > 0n, "Sanity check: accumulator should hold pending rewards before release");

    const stakerBalanceBefore = await rewardToken.balanceOf(await staker.getAddress());

    // Triggered by a random third party, not the owner
    const tx = await mainAccumulator.connect(thirdParty).sendRewardsToStaker();
    const rx = await tx.wait();
    logTx("Third party triggered public release", tx, rx);

    const releasedLog = rx.logs.find(l => {
      try { return accIface.parseLog(l)?.name === "RewardsSentToStaker"; } catch { return false; }
    });
    assert(!!releasedLog, "RewardsSentToStaker event must be emitted");
    const releasedAmount = accIface.parseLog(releasedLog).args[0];
    assert(releasedAmount === accumulatedBefore, "Released amount must equal the previously accumulated rewards");

    const stakerBalanceAfter = await rewardToken.balanceOf(await staker.getAddress());
    assert(stakerBalanceAfter === stakerBalanceBefore + accumulatedBefore, "Staker contract balance must increase by the released amount");

    const accumulatedAfter = await mainAccumulator.accumulatedRewards();
    assert(accumulatedAfter === 0n, "accumulatedRewards must reset to zero after a successful release");
  }

  // =========================================================================
  // SCENARIO 18: Zero-Reward Time Release Execution
  // =========================================================================
  section("Scenario 18: Zero-Reward Time Release Execution");
  resetWallets(deployer, thirdParty);
  {
    const { instance: zeroRewardAccumulator } = await deployAccumulator(BigInt(TIME_WINDOW), false);

    await advanceOrWait(provider, TIME_WINDOW);

    const lastRewardBefore = await zeroRewardAccumulator.lastRewardTime();
    const tx = await zeroRewardAccumulator.connect(thirdParty).sendRewardsToStaker();
    const rx = await tx.wait();
    logTx("Released with zero accumulated rewards", tx, rx);

    const lastRewardAfter = await zeroRewardAccumulator.lastRewardTime();
    assert(lastRewardAfter > lastRewardBefore, "lastRewardTime must still advance even with zero accumulated rewards");

    const releasedLog = rx.logs.find(l => {
      try { return accIface.parseLog(l)?.name === "RewardsSentToStaker"; } catch { return false; }
    });
    assert(!!releasedLog, "RewardsSentToStaker event must still be emitted with amount 0");
    const releasedAmount = accIface.parseLog(releasedLog).args[0];
    assert(releasedAmount === 0n, "Released amount must be zero when no rewards were accumulated");
  }

  // =========================================================================
  // SCENARIO 21: Time Grid Snapping on Release Delay
  // =========================================================================
  section("Scenario 21: Time Grid Snapping on Release Delay");
  resetWallets(deployer, thirdParty);
  {
    const { instance: gridAccumulator } = await deployAccumulator(BigInt(TIME_WINDOW), false);

    const startLastRewardTime = await gridAccumulator.lastRewardTime();
    const timeWindow = await gridAccumulator.timeWindow();

    // Let 3.5 windows elapse before triggering release, to force multiple grid snaps
    const elapsedSeconds = Number(timeWindow) * 3 + Math.floor(Number(timeWindow) / 2);
    await advanceOrWait(provider, elapsedSeconds);

    const tx = await gridAccumulator.connect(thirdParty).sendRewardsToStaker();
    const rx = await tx.wait();
    logTx("Delayed release triggered after multiple elapsed windows", tx, rx);

    const releasedLog = rx.logs.find(l => {
      try { return accIface.parseLog(l)?.name === "RewardsSentToStaker"; } catch { return false; }
    });
    assert(!!releasedLog, "RewardsSentToStaker event must be emitted");
    const emittedLastRewardTime = accIface.parseLog(releasedLog).args[1];

    const blockTs = BigInt(await currentTimestamp(provider));
    const expectedElapsedWindows = (blockTs - startLastRewardTime) / timeWindow;
    const expectedLastRewardTime = startLastRewardTime + expectedElapsedWindows * timeWindow;

    assert(
      emittedLastRewardTime === expectedLastRewardTime,
      `lastRewardTime must snap to the grid (expected ${expectedLastRewardTime}, got ${emittedLastRewardTime})`
    );
    assert(
      emittedLastRewardTime <= blockTs,
      "Snapped lastRewardTime must never be in the future relative to the release block"
    );
    assert(
      (emittedLastRewardTime - startLastRewardTime) % timeWindow === 0n,
      "Snapped lastRewardTime must remain aligned to the original schedule grid"
    );
  }

  // ---------------------------------------------------------------------------
  // SUCCESS
  // ---------------------------------------------------------------------------
  section("SUCCESS - All 21 RewardAccumulator Scenarios Passed!");

  console.log("\n  All tests completed successfully!\n");
}

let _anvilProc = null;
let _provider = null;
let _accIface = null;
process.on("exit", () => { if (_anvilProc) _anvilProc.kill(); });
process.on("SIGINT", () => { if (_anvilProc) _anvilProc.kill(); process.exit(130); });
process.on("SIGTERM", () => { if (_anvilProc) _anvilProc.kill(); process.exit(143); });

run()
  .then(() => process.exit(0))
  .catch(async err => {
    console.error("\n  FATAL:", err.message ?? err);
    if (err.data) console.error("  Error data:", err.data);
    process.exit(1);
  });