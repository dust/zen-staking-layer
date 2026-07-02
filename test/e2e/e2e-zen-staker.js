#!/usr/bin/env node
/**
 * ZenStaker (non-upgradeable) End-to-End Script
 *
 * Deploys and exercises the full ZenStaker lifecycle on a live testnet or
 * against a local Anvil node (Foundry's built-in EVM).
 *
 *   1. Fund accounts with ETH if needed
 *   2. Deploy MockZenToken + mint to users
 *   3. Deploy IdentityEarningPowerCalculator + ZenStaker (direct, no proxy)
 *   4. Configure reward notifier (deployer acts as notifier for simplicity)
 *   5. User1 & User2 stake
 *   6. Distribute rewards (notifyRewardAmount)
 *   7. Claim rewards, stakeMore, alterDelegatee, alterClaimer
 *   8. permitAndStake (ERC-2612 gasless approval)
 *   9. Full withdrawals
 *  10. Verify final state
 *
 * -- Testnet mode (default) ------------------------------------------------
 *   cp .env.template .env   # fill in keys + RPC
 *   npm run e2e:non-upgradeable
 *
 *   Required .env vars:
 *     RPC_URL               testnet JSON-RPC endpoint
 *     DEPLOYER_PRIVATE_KEY
 *     USER1_PRIVATE_KEY
 *     USER2_PRIVATE_KEY
 *
 * -- Anvil mode ------------------------------------------------------------
 *   npm run e2e:non-upgradeable -- --anvil           (spawns anvil on default port 8545)
 *   npm run e2e:non-upgradeable -- --anvil 9545      (custom port)
 *   USE_ANVIL=true npm run e2e:non-upgradeable       (env var alternative)
 *
 *   Requires Foundry installed (https://getfoundry.sh).
 *   No .env vars needed — Anvil's built-in funded test accounts are used.
 *   Time is advanced 1 hour via evm_increaseTime so rewards accrue to a
 *   clearly visible amount instead of relying on real block timing.
 */

"use strict";

require("dotenv").config();
const { ethers, NonceManager } = require("ethers");
const { spawn }    = require("child_process");
const path         = require("path");
const fs           = require("fs");

// ---------------------------------------------------------------------------
// CLI / env flags
// ---------------------------------------------------------------------------

const argvAnvilIdx = process.argv.indexOf("--anvil");
const USE_ANVIL    = argvAnvilIdx !== -1 || process.env.USE_ANVIL === "true";
const ANVIL_PORT   = (() => {
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

const MIN_ETH_BALANCE = ethers.parseEther("0.001");
const TOP_UP_AMOUNT   = ethers.parseEther("0.005");

const INITIAL_MINT     = ethers.parseEther("100000"); // minted to each user
const REWARD_AMOUNT    = ethers.parseEther("86400");  // 86 400 ZEN -> ~1 ZEN/s over 30 days
const USER1_STAKE      = ethers.parseEther("1000");
const USER2_STAKE      = ethers.parseEther("500");
const USER1_STAKE_MORE = ethers.parseEther("500");

// Anvil HD derivation path (standard BIP-44 for Ethereum)
const ANVIL_HD_PATH = "m/44'/60'/0'/0";

// ---------------------------------------------------------------------------
// Anvil helpers
// ---------------------------------------------------------------------------

/**
 * Spawn a local Anvil node and resolve once it is ready to accept connections.
 * Returns the child process so the caller can kill it when done.
 * Pass a mnemonic to override Anvil's default funded accounts.
 */
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

/**
 * Advance the Anvil chain by `seconds` using evm_increaseTime + evm_mine.
 * No-op when connected to a real network.
 */
async function advanceTime(provider, seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
  console.log(`\n  [Anvil] Advanced time by ${seconds} s and mined 1 block`);
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a Wallet in a NonceManager (prevents nonce collisions on fast local
 * nodes like Anvil) while keeping the synchronous `.address` getter intact.
 */
function managedWallet(wallet) {
  const nm = new NonceManager(wallet);
  Object.defineProperty(nm, "address", { get: () => wallet.address });
  return nm;
}

function loadArtifact(solFile, contractName) {
  const p = path.resolve(__dirname, "../..", "out", solFile, `${contractName}.json`);
  if (!fs.existsSync(p))
    throw new Error(`Artifact not found: ${p}\nRun 'forge build' first.`);
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return { abi: raw.abi, bytecode: raw.bytecode.object };
}

function logTx(label, tx, receipt) {
  console.log(`\n  OK  ${label}`);
  console.log(`      tx hash : ${tx.hash}`);
  console.log(`      block   : ${receipt.blockNumber}   gas used: ${receipt.gasUsed.toLocaleString()}`);
}

function fmt(wei) {
  const e = ethers.formatEther(wei);
  const [int, dec = ""] = e.split(".");
  return `${int}.${dec.padEnd(4, "0").slice(0, 4)} ZEN`;
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

async function printGlobalState(staker, label) {
  const [totalStaked, totalEarningPower, rewardRate, rewardEndTime, , rewardPerTokenAccumulated] =
    await staker.getGlobalState();
  console.log(`\n  [Global State - ${label}]`);
  console.log(`    totalStaked         : ${fmt(totalStaked)}`);
  console.log(`    totalEarningPower   : ${fmt(totalEarningPower)}`);
  console.log(`    rewardRate (ZEN/s)  : ${ethers.formatEther(rewardRate)}`);
  console.log(`    rewardEndTime       : ${rewardEndTime === 0n ? "not set" : new Date(Number(rewardEndTime) * 1000).toISOString()}`);
  console.log(`    rewardPerTokenAccum : ${rewardPerTokenAccumulated}`);
  return { totalStaked, totalEarningPower, rewardRate, rewardEndTime };
}

async function printDepositInfo(staker, depositId, label) {
  const [balance, owner, earningPower, delegatee, claimer, unclaimedRewards] =
    await staker.getDepositInfo(depositId);
  console.log(`\n  [Deposit #${depositId} - ${label}]`);
  console.log(`    balance       : ${fmt(balance)}`);
  console.log(`    owner         : ${owner}`);
  console.log(`    earningPower  : ${fmt(earningPower)}`);
  console.log(`    delegatee     : ${delegatee}`);
  console.log(`    claimer       : ${claimer}`);
  console.log(`    unclaimedRwds : ${fmt(unclaimedRewards)}`);
  return { balance, owner, earningPower, delegatee, claimer, unclaimedRewards };
}

async function printDepositorSummary(staker, addr, depositIds, label) {
  const [totalStaked, totalEarningPower, totalUnclaimed] =
    await staker.getDepositorFullSummary(addr, depositIds);
  console.log(`\n  [Depositor ${addr.slice(0, 10)}... - ${label}]`);
  console.log(`    totalStaked        : ${fmt(totalStaked)}`);
  console.log(`    totalEarningPower  : ${fmt(totalEarningPower)}`);
  console.log(`    totalUnclaimed     : ${fmt(totalUnclaimed)}`);
  return { totalStaked, totalEarningPower, totalUnclaimed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await run();
}

async function run() {
  console.log("\n  =============================================================");
  console.log(`  ZenStaker (non-upgradeable) - End-to-End Script  [mode: ${USE_ANVIL ? `anvil :${ANVIL_PORT}` : "testnet"}]`);
  console.log("  =============================================================");

  // -- Provider & accounts setup -----------------------------------------------
  let provider, deployer, user1, user2;

  if (USE_ANVIL) {
    // Generate a fresh random mnemonic so each run gets unique accounts.
    // Anvil pre-funds the derived addresses with 10 000 ETH automatically.
    const mnemonic = ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(16));
    console.log(`\n  Mnemonic : ${mnemonic}`);

    _anvilProc = await startAnvil(ANVIL_PORT, mnemonic);

    provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${ANVIL_PORT}`);
    // Add a 1.5× gas safety buffer — Anvil's eth_estimateGas returns the
    // exact minimum, leaving no headroom for minor state divergences between
    // estimation and execution (e.g., block-timestamp drift, warm-slot bias).
    const _origEstGas = provider.estimateGas.bind(provider);
    provider.estimateGas = async (tx) => {
      const est = await _origEstGas(tx);
      return est + est / 2n; // 1.5×
    };

    const hdRoot = ethers.HDNodeWallet.fromPhrase(mnemonic, "", ANVIL_HD_PATH);
    deployer  = managedWallet(new ethers.Wallet(hdRoot.deriveChild(0).privateKey, provider));
    user1     = managedWallet(new ethers.Wallet(hdRoot.deriveChild(1).privateKey, provider));
    user2     = managedWallet(new ethers.Wallet(hdRoot.deriveChild(2).privateKey, provider));
  } else {
    // Testnet mode: read everything from .env
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
    deployer  = managedWallet(new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider));
    user1     = managedWallet(new ethers.Wallet(USER1_PRIVATE_KEY, provider));
    user2     = managedWallet(new ethers.Wallet(USER2_PRIVATE_KEY, provider));
  }

  _provider = provider; // expose for error diagnostics

  const network = await provider.getNetwork();
  console.log(`\n  Network  : ${network.name} (chainId ${network.chainId})`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  User1    : ${user1.address}`);
  console.log(`  User2    : ${user2.address}`);

  // -- Load Foundry artifacts --------------------------------------------------
  const mockTokenArtifact  = loadArtifact("MockERC20Votes.sol", "ERC20VotesMock");
  const calculatorArtifact = loadArtifact("IdentityEarningPowerCalculator.sol", "IdentityEarningPowerCalculator");
  const zenStakerArtifact  = loadArtifact("ZenStaker.sol", "ZenStaker");

  // -- 1: ETH Balance Check & Top-Up ------------------------------------------
  section("1 - ETH Balance Check & Top-Up");

  const [balDep, balU1, balU2] = await Promise.all([
    provider.getBalance(deployer.address),
    provider.getBalance(user1.address),
    provider.getBalance(user2.address),
  ]);
  console.log(`\n  Deployer : ${ethers.formatEther(balDep)} ETH`);
  console.log(`  User1    : ${ethers.formatEther(balU1)} ETH`);
  console.log(`  User2    : ${ethers.formatEther(balU2)} ETH`);

  if (USE_ANVIL) {
    console.log("\n  Anvil mode: accounts are pre-funded with 10 000 ETH each, no top-up needed");
  } else {
    for (const [idx, wallet, bal] of [[1, user1, balU1], [2, user2, balU2]]) {
      if (bal < MIN_ETH_BALANCE) {
        console.log(`\n  User${idx} has < 0.001 ETH - topping up ${ethers.formatEther(TOP_UP_AMOUNT)} ETH...`);
        const tx      = await deployer.sendTransaction({ to: wallet.address, value: TOP_UP_AMOUNT });
        const receipt = await tx.wait();
        logTx(`Top-up User${idx}`, tx, receipt);
      } else {
        console.log(`  User${idx} has sufficient ETH - no top-up needed`);
      }
    }
  }

  // -- 2: Deploy MockZenToken --------------------------------------------------
  section("2 - Deploy MockZenToken (simulates ZEN ERC20)");

  const TokenFactory = new ethers.ContractFactory(
    mockTokenArtifact.abi, mockTokenArtifact.bytecode, deployer
  );
  const tokenContract  = await TokenFactory.deploy();
  const tokenReceipt   = await tokenContract.deploymentTransaction().wait();
  const zenToken       = tokenContract.attach(await tokenContract.getAddress());

  logTx("Deploy MockZenToken", tokenContract.deploymentTransaction(), tokenReceipt);
  console.log(`  Contract : ${await zenToken.getAddress()}`);

  for (const [wallet, label] of [[user1, "User1"], [user2, "User2"]]) {
    const tx      = await zenToken.connect(deployer).mint(wallet.address, INITIAL_MINT);
    const receipt = await tx.wait();
    logTx(`Mint ${ethers.formatEther(INITIAL_MINT)} ZEN -> ${label}`, tx, receipt);
  }
  const tx0 = await zenToken.connect(deployer).mint(deployer.address, REWARD_AMOUNT);
  await tx0.wait();
  console.log(`\n  Minted ${ethers.formatEther(REWARD_AMOUNT)} ZEN to deployer (reward reserve)`);

  const [b1, b2, bd] = await Promise.all([
    zenToken.balanceOf(user1.address),
    zenToken.balanceOf(user2.address),
    zenToken.balanceOf(deployer.address),
  ]);
  console.log(`\n  Balances: User1=${fmt(b1)}  User2=${fmt(b2)}  Deployer=${fmt(bd)}`);
  assert(b1 === INITIAL_MINT,  `User1 ZEN balance = ${ethers.formatEther(INITIAL_MINT)} ZEN`);
  assert(b2 === INITIAL_MINT,  `User2 ZEN balance = ${ethers.formatEther(INITIAL_MINT)} ZEN`);
  assert(bd === REWARD_AMOUNT, `Deployer ZEN balance = ${ethers.formatEther(REWARD_AMOUNT)} ZEN`);

  // -- 3: Deploy IdentityEarningPowerCalculator --------------------------------
  section("3 - Deploy IdentityEarningPowerCalculator");

  const CalcFactory   = new ethers.ContractFactory(
    calculatorArtifact.abi, calculatorArtifact.bytecode, deployer
  );
  const calcContract  = await CalcFactory.deploy();
  const calcReceipt   = await calcContract.deploymentTransaction().wait();
  const calculator    = calcContract.attach(await calcContract.getAddress());

  logTx("Deploy IdentityEarningPowerCalculator", calcContract.deploymentTransaction(), calcReceipt);
  console.log(`  Contract : ${await calculator.getAddress()}`);

  // -- 4: Deploy ZenStaker (direct, non-upgradeable) ---------------------------
  section("4 - Deploy ZenStaker (direct, non-upgradeable)");

  const stakerIface   = new ethers.Interface(zenStakerArtifact.abi);
  _stIface = stakerIface; // expose for error diagnostics

  const StakerFactory = new ethers.ContractFactory(
    zenStakerArtifact.abi, zenStakerArtifact.bytecode, deployer
  );
  const stakerContract = await StakerFactory.deploy(
    await zenToken.getAddress(),      // _token (both reward and stake)
    await calculator.getAddress(),    // _earningPowerCalculator
    0n,                               // _maxBumpTip
    deployer.address                  // _admin
  );
  const stakerReceipt = await stakerContract.deploymentTransaction().wait();
  const stakerAddress = await stakerContract.getAddress();
  logTx("Deploy ZenStaker", stakerContract.deploymentTransaction(), stakerReceipt);
  console.log(`  Contract : ${stakerAddress}`);

  const staker = new ethers.Contract(stakerAddress, zenStakerArtifact.abi, deployer);

  assert(await staker.REWARD_TOKEN() === await zenToken.getAddress(), "REWARD_TOKEN == MockZenToken");
  assert(await staker.STAKE_TOKEN()  === await zenToken.getAddress(), "STAKE_TOKEN == MockZenToken");
  assert(await staker.REWARD_TOKEN() === await staker.STAKE_TOKEN(), "REWARD_TOKEN == STAKE_TOKEN (ZEN-on-ZEN enforced)");
  assert(await staker.admin()        === deployer.address,            "admin == deployer");

  // -- 5: Configure Reward Notifier --------------------------------------------
  section("5 - Configure Reward Notifier (deployer as direct notifier)");

  const setNotifierTx = await staker.connect(deployer).setRewardNotifier(deployer.address, true);
  const setNotifierRx = await setNotifierTx.wait();
  logTx("setRewardNotifier(deployer, true)", setNotifierTx, setNotifierRx);
  assert(await staker.isRewardNotifier(deployer.address), "deployer is reward notifier");

  await printGlobalState(staker, "after setup, before any stakes");

  // -- 6: User1 stakes 1 000 ZEN -----------------------------------------------
  section("6 - User1 stakes 1 000 ZEN");

  const approveTx1 = await zenToken.connect(user1).approve(await staker.getAddress(), USER1_STAKE);
  const approveRx1 = await approveTx1.wait();
  logTx(`User1 approve(staker, ${ethers.formatEther(USER1_STAKE)} ZEN)`, approveTx1, approveRx1);

  const stakeTx1 = await staker.connect(user1)["stake(uint256,address)"](USER1_STAKE, deployer.address);
  const stakeRx1 = await stakeTx1.wait();
  logTx(`User1 stake(${ethers.formatEther(USER1_STAKE)} ZEN)`, stakeTx1, stakeRx1);

  // event StakeDeposited(address indexed owner, DepositIdentifier indexed depositId, ...)
  const depositId1  = stakerIface.parseLog(
    stakeRx1.logs.find(l => { try { return stakerIface.parseLog(l)?.name === "StakeDeposited"; } catch { return false; } })
  ).args[1];
  console.log(`\n  Deposit ID (user1) : ${depositId1}`);

  const dep1 = await printDepositInfo(staker, depositId1, "after user1 stake");
  assert(dep1.balance      === USER1_STAKE,   `deposit1.balance == ${ethers.formatEther(USER1_STAKE)} ZEN`);
  assert(dep1.owner        === user1.address, "deposit1.owner == user1");
  assert(dep1.earningPower === USER1_STAKE,   "deposit1.earningPower == stake (identity 1:1)");

  const sum1Early = await printDepositorSummary(staker, user1.address, [depositId1], "after user1 stake");
  assert(sum1Early.totalStaked === USER1_STAKE, "getDepositorFullSummary: user1 totalStaked correct after stake");

  const gs1 = await printGlobalState(staker, "after user1 stake");
  assert(gs1.totalStaked === USER1_STAKE, `totalStaked == ${ethers.formatEther(USER1_STAKE)} ZEN`);

  // -- 7: User2 stakes 500 ZEN --------------------------------------------------
  section("7 - User2 stakes 500 ZEN");

  const approveTx2 = await zenToken.connect(user2).approve(await staker.getAddress(), USER2_STAKE);
  const approveRx2 = await approveTx2.wait();
  logTx(`User2 approve(staker, ${ethers.formatEther(USER2_STAKE)} ZEN)`, approveTx2, approveRx2);

  const stakeTx2 = await staker.connect(user2)["stake(uint256,address)"](USER2_STAKE, deployer.address);
  const stakeRx2 = await stakeTx2.wait();
  logTx(`User2 stake(${ethers.formatEther(USER2_STAKE)} ZEN)`, stakeTx2, stakeRx2);

  const depositId2 = stakerIface.parseLog(
    stakeRx2.logs.find(l => { try { return stakerIface.parseLog(l)?.name === "StakeDeposited"; } catch { return false; } })
  ).args[1];
  console.log(`\n  Deposit ID (user2) : ${depositId2}`);

  const dep2 = await printDepositInfo(staker, depositId2, "after user2 stake");
  assert(dep2.balance === USER2_STAKE,     `deposit2.balance == ${ethers.formatEther(USER2_STAKE)} ZEN`);
  assert(dep2.owner   === user2.address,   "deposit2.owner == user2");

  const gs2 = await printGlobalState(staker, "after user1+user2 stakes");
  assert(gs2.totalStaked === USER1_STAKE + USER2_STAKE, "totalStaked == 1500 ZEN");

  // -- 7b: Batch read -----------------------------------------------------------
  section("7b - Batch read getDepositsInfo([id1, id2])");

  const [batchBal, batchOwners, batchEp, batchUncl] =
    await staker.getDepositsInfo([depositId1, depositId2]);
  console.log("\n  Batch result:");
  console.log(`    deposit1  bal=${fmt(batchBal[0])}  owner=${batchOwners[0].slice(0, 10)}...  ep=${fmt(batchEp[0])}  uncl=${fmt(batchUncl[0])}`);
  console.log(`    deposit2  bal=${fmt(batchBal[1])}  owner=${batchOwners[1].slice(0, 10)}...  ep=${fmt(batchEp[1])}  uncl=${fmt(batchUncl[1])}`);
  assert(batchBal[0] === USER1_STAKE, "batch: deposit1 balance correct");
  assert(batchBal[1] === USER2_STAKE, "batch: deposit2 balance correct");

  // -- 8: Distribute rewards ----------------------------------------------------
  section("8 - Distribute rewards via notifyRewardAmount");

  const transferRwdTx = await zenToken.connect(deployer).transfer(await staker.getAddress(), REWARD_AMOUNT);
  const transferRwdRx = await transferRwdTx.wait();
  logTx(`Transfer ${ethers.formatEther(REWARD_AMOUNT)} ZEN to staker`, transferRwdTx, transferRwdRx);

  const notifyTx = await staker.connect(deployer).notifyRewardAmount(REWARD_AMOUNT);
  const notifyRx = await notifyTx.wait();
  logTx(`notifyRewardAmount(${ethers.formatEther(REWARD_AMOUNT)} ZEN)`, notifyTx, notifyRx);

  const gsRewards = await printGlobalState(staker, "after notifyRewardAmount");
  assert(gsRewards.rewardRate    > 0n, "rewardRate > 0 after notification");
  assert(gsRewards.rewardEndTime > 0n, "rewardEndTime set");
  console.log(`\n  Expected rate ~${ethers.formatEther(REWARD_AMOUNT / (30n * 86400n))} ZEN/s`);
  console.log(`  Actual   rate  ${ethers.formatEther(gsRewards.rewardRate)} ZEN/s`);

  // -- 9: Let rewards accrue ----------------------------------------------------
  section("9 - Let rewards accrue");

  if (USE_ANVIL) {
    // Jump forward 1 hour: rewards accrued = 3600s * ~1 ZEN/s * share
    // User1 (~66.7%): ~2400 ZEN  |  User2 (~33.3%): ~1200 ZEN
    await advanceTime(provider, 3600);
    console.log("  Expected accrued (approx): User1 ~2400 ZEN, User2 ~1200 ZEN");
  } else {
    // On a real testnet we can't manipulate time - use a dust stakeMore to
    // trigger an on-chain checkpoint and let natural block time do the rest
    console.log("\n  Testnet mode: stakeMore(1 ZEN) to trigger reward checkpoint...");
    const dustAmount = ethers.parseEther("1");
    const appDust = await zenToken.connect(user1).approve(await staker.getAddress(), dustAmount);
    await appDust.wait();
    const dustTx = await staker.connect(user1).stakeMore(depositId1, dustAmount);
    const dustRx = await dustTx.wait();
    logTx("User1 stakeMore(1 ZEN) - checkpoint trigger", dustTx, dustRx);
  }

  const uncl1Before = await staker.unclaimedReward(depositId1);
  const uncl2Before = await staker.unclaimedReward(depositId2);
  console.log(`\n  Unclaimed before claim:`);
  console.log(`    User1 : ${fmt(uncl1Before)}`);
  console.log(`    User2 : ${fmt(uncl2Before)}`);
  assert(uncl1Before > 0n, "user1 has accrued rewards");
  assert(uncl2Before > 0n, "user2 has accrued rewards");

  // -- 9b: getDepositorFullSummary reflects accrued rewards ---------------------
  section("9b - getDepositorFullSummary shows accrued unclaimed rewards");

  const sum1Accrued = await printDepositorSummary(staker, user1.address, [depositId1], "after rewards accrued");
  const sum2Accrued = await printDepositorSummary(staker, user2.address, [depositId2], "after rewards accrued");
  assert(sum1Accrued.totalUnclaimed > 0n, "getDepositorFullSummary: user1 has unclaimed rewards");
  assert(sum2Accrued.totalUnclaimed > 0n, "getDepositorFullSummary: user2 has unclaimed rewards");
  assert(sum1Accrued.totalUnclaimed > sum2Accrued.totalUnclaimed,
    "getDepositorFullSummary: user1 unclaimed > user2 unclaimed (proportional to larger stake)");

  // Verify duplicate ID dedup: passing the same depositId twice must not double the result.
  const [, , noDoubleCount] = await staker.getDepositorFullSummary(user1.address, [depositId1, depositId1]);
  assert(
    noDoubleCount === sum1Accrued.totalUnclaimed,
    "getDepositorFullSummary: duplicate depositId does not double-count rewards"
  );

  // -- 10: Claim rewards --------------------------------------------------------
  section("10 - Users claim rewards");

  const u1BalBefore = await zenToken.balanceOf(user1.address);
  const claimTx1    = await staker.connect(user1).claimReward(depositId1);
  const claimRx1    = await claimTx1.wait();
  logTx("User1 claimReward(depositId1)", claimTx1, claimRx1);

  const u1BalAfter  = await zenToken.balanceOf(user1.address);
  const u1Claimed   = u1BalAfter - u1BalBefore;
  console.log(`\n  User1  before=${fmt(u1BalBefore)}  after=${fmt(u1BalAfter)}  claimed=${fmt(u1Claimed)}`);
  assert(u1Claimed > 0n, "user1 received > 0 ZEN rewards");

  const u2BalBefore = await zenToken.balanceOf(user2.address);
  const claimTx2    = await staker.connect(user2).claimReward(depositId2);
  const claimRx2    = await claimTx2.wait();
  logTx("User2 claimReward(depositId2)", claimTx2, claimRx2);

  const u2BalAfter  = await zenToken.balanceOf(user2.address);
  const u2Claimed   = u2BalAfter - u2BalBefore;
  console.log(`  User2  before=${fmt(u2BalBefore)}  after=${fmt(u2BalAfter)}  claimed=${fmt(u2Claimed)}`);
  assert(u2Claimed > 0n, "user2 received > 0 ZEN rewards");
  assert(u1Claimed > u2Claimed, "user1 rewards > user2 rewards (proportional to larger stake)");

  const uncl1After = await staker.unclaimedReward(depositId1);
  const uncl2After = await staker.unclaimedReward(depositId2);
  console.log(`\n  Unclaimed after claim (should be ~0):  User1=${fmt(uncl1After)}  User2=${fmt(uncl2After)}`);

  await printDepositInfo(staker, depositId1, "after user1 claim");
  await printDepositInfo(staker, depositId2, "after user2 claim");

  // -- 11: User1 stakeMore ------------------------------------------------------
  section("11 - User1 stakeMore 500 ZEN");

  const approveMoreTx = await zenToken.connect(user1).approve(await staker.getAddress(), USER1_STAKE_MORE);
  await approveMoreTx.wait();
  const stakeMoreTx = await staker.connect(user1).stakeMore(depositId1, USER1_STAKE_MORE);
  const stakeMoreRx = await stakeMoreTx.wait();
  logTx(`User1 stakeMore(${ethers.formatEther(USER1_STAKE_MORE)} ZEN)`, stakeMoreTx, stakeMoreRx);

  const depAfterMore = await printDepositInfo(staker, depositId1, "after stakeMore");
  // In testnet mode the deposit also includes the 1 ZEN dust from section 9
  const dustInDeposit = USE_ANVIL ? 0n : ethers.parseEther("1");
  const expectedBal   = USER1_STAKE + dustInDeposit + USER1_STAKE_MORE;
  assert(
    depAfterMore.balance === expectedBal,
    `deposit1.balance == ${ethers.formatEther(expectedBal)} ZEN`
  );

  // -- 12: alterDelegatee -------------------------------------------------------
  section("12 - User2 alterDelegatee -> user1");

  const alterDelTx = await staker.connect(user2).alterDelegatee(depositId2, user1.address);
  const alterDelRx = await alterDelTx.wait();
  logTx("User2 alterDelegatee(depositId2, user1)", alterDelTx, alterDelRx);

  const depAltDel = await printDepositInfo(staker, depositId2, "after alterDelegatee");
  assert(depAltDel.delegatee === user1.address, "deposit2.delegatee == user1");

  // -- 13: alterClaimer + cross-account claim -----------------------------------
  section("13 - User2 alterClaimer -> user1, then user1 claims deposit2");

  const alterClTx = await staker.connect(user2).alterClaimer(depositId2, user1.address);
  const alterClRx = await alterClTx.wait();
  logTx("User2 alterClaimer(depositId2, user1)", alterClTx, alterClRx);

  const depAltCl = await printDepositInfo(staker, depositId2, "after alterClaimer");
  assert(depAltCl.claimer === user1.address, "deposit2.claimer == user1");

  if (USE_ANVIL) {
    // Advance another hour so there are fresh rewards to claim cross-account
    await advanceTime(provider, 3600);
  }

  const u1BalBeforeCross = await zenToken.balanceOf(user1.address);
  const claimCrossTx = await staker.connect(user1).claimReward(depositId2);
  const claimCrossRx = await claimCrossTx.wait();
  logTx("User1 claimReward(depositId2) - as claimer on behalf of user2", claimCrossTx, claimCrossRx);

  const u1BalAfterCross = await zenToken.balanceOf(user1.address);
  assert(u1BalAfterCross > u1BalBeforeCross, "user1 balance increased claiming deposit2 as claimer");

  // -- 14: permitAndStake (ERC-2612 gasless approval) ---------------------------
  section("14 - permitAndStake (ERC-2612 gasless approval)");

  // Use user2 to test permitAndStake with a fresh stake
  const permitAmount = ethers.parseEther("200");
  await (await zenToken.connect(deployer).mint(user2.address, permitAmount)).wait();

  // Build the EIP-712 permit signature using signTypedData
  const tokenAddr    = await zenToken.getAddress();
  const stakerAddr   = await staker.getAddress();
  const nonce        = await zenToken.nonces(user2.address);
  const latestBlock  = await provider.getBlock("latest");
  const deadline     = BigInt(latestBlock.timestamp) + 3600n;
  const chainId      = (await provider.getNetwork()).chainId;

  // ERC20Permit EIP-712 domain — matches OpenZeppelin's ERC20Permit implementation
  const tokenName = await zenToken.name();
  const domain = {
    name: tokenName,
    version: "1",
    chainId: chainId,
    verifyingContract: tokenAddr,
  };

  const types = {
    Permit: [
      { name: "owner",    type: "address" },
      { name: "spender",  type: "address" },
      { name: "value",    type: "uint256" },
      { name: "nonce",    type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const value = {
    owner:    user2.address,
    spender:  stakerAddr,
    value:    permitAmount,
    nonce:    nonce,
    deadline: deadline,
  };

  // Extract the underlying Wallet from the NonceManager wrapper to sign
  const user2RawWallet = user2.signer || user2;

  const rawSig   = await user2RawWallet.signTypedData(domain, types, value);
  const sig      = ethers.Signature.from(rawSig);

  const permitStakeTx = await staker.connect(user2).permitAndStake(
    permitAmount,
    user2.address,   // delegatee
    user2.address,   // claimer
    deadline,
    sig.v,
    sig.r,
    sig.s
  );
  const permitStakeRx = await permitStakeTx.wait();
  logTx("User2 permitAndStake(200 ZEN)", permitStakeTx, permitStakeRx);

  const depositId3 = stakerIface.parseLog(
    permitStakeRx.logs.find(l => { try { return stakerIface.parseLog(l)?.name === "StakeDeposited"; } catch { return false; } })
  ).args[1];
  console.log(`\n  Deposit ID (user2 permitAndStake) : ${depositId3}`);

  const dep3 = await printDepositInfo(staker, depositId3, "after permitAndStake");
  assert(dep3.balance === permitAmount, `permitAndStake deposit balance == ${ethers.formatEther(permitAmount)} ZEN`);
  assert(dep3.owner   === user2.address, "permitAndStake deposit owner == user2");

  // -- 15: Full depositor summaries ---------------------------------------------
  section("15 - Full depositor summaries (getDepositorFullSummary assertions)");

  const sum1Final = await printDepositorSummary(staker, user1.address, [depositId1], "user1 before withdraw");
  const sum2Final = await printDepositorSummary(staker, user2.address, [depositId2, depositId3], "user2 before withdraw");

  const expectedU1Bal = USE_ANVIL ? USER1_STAKE + USER1_STAKE_MORE : USER1_STAKE + ethers.parseEther("1") + USER1_STAKE_MORE;
  assert(sum1Final.totalStaked === expectedU1Bal,
    `getDepositorFullSummary: user1 totalStaked == ${ethers.formatEther(expectedU1Bal)} ZEN`);
  assert(sum2Final.totalStaked === USER2_STAKE + permitAmount,
    `getDepositorFullSummary: user2 totalStaked == ${ethers.formatEther(USER2_STAKE + permitAmount)} ZEN`);

  // -- 16: User1 full withdrawal ------------------------------------------------
  section("16 - User1 full withdrawal");

  const { balance: u1DepBal } = await printDepositInfo(staker, depositId1, "pre-withdraw");
  const u1TokBefore = await zenToken.balanceOf(user1.address);

  const withdrawTx1 = await staker.connect(user1).withdraw(depositId1, u1DepBal);
  const withdrawRx1 = await withdrawTx1.wait();
  logTx(`User1 withdraw(${fmt(u1DepBal)})`, withdrawTx1, withdrawRx1);

  const u1TokAfter = await zenToken.balanceOf(user1.address);
  console.log(`\n  User1  before=${fmt(u1TokBefore)}  after=${fmt(u1TokAfter)}  delta=${fmt(u1TokAfter - u1TokBefore)}`);
  assert(u1TokAfter > u1TokBefore, "user1 ZEN balance increased after withdraw");
  assert(u1TokAfter - u1TokBefore === u1DepBal, "user1 received exact stake back");

  const dep1Final = await printDepositInfo(staker, depositId1, "after withdraw");
  assert(dep1Final.balance === 0n, "deposit1.balance == 0 after full withdraw");

  // -- 17: User2 final claim + withdrawal (both deposits) -----------------------
  section("17 - User2: restore claimer, claim remaining rewards, then withdraw both deposits");

  const restoreClTx = await staker.connect(user2).alterClaimer(depositId2, user2.address);
  const restoreClRx = await restoreClTx.wait();
  logTx("User2 alterClaimer(depositId2, user2) - restore", restoreClTx, restoreClRx);

  const u2TokBefore = await zenToken.balanceOf(user2.address);

  const claimFinalTx = await staker.connect(user2).claimReward(depositId2);
  const claimFinalRx = await claimFinalTx.wait();
  logTx("User2 claimReward(depositId2) - final claim", claimFinalTx, claimFinalRx);

  const withdrawTx2 = await staker.connect(user2).withdraw(depositId2, USER2_STAKE);
  const withdrawRx2 = await withdrawTx2.wait();
  logTx(`User2 withdraw(${fmt(USER2_STAKE)}) - deposit2`, withdrawTx2, withdrawRx2);

  // Also withdraw the permitAndStake deposit
  const claimFinalTx3 = await staker.connect(user2).claimReward(depositId3);
  const claimFinalRx3 = await claimFinalTx3.wait();
  logTx("User2 claimReward(depositId3) - permitAndStake deposit", claimFinalTx3, claimFinalRx3);

  const withdrawTx3 = await staker.connect(user2).withdraw(depositId3, permitAmount);
  const withdrawRx3 = await withdrawTx3.wait();
  logTx(`User2 withdraw(${fmt(permitAmount)}) - deposit3 (permitAndStake)`, withdrawTx3, withdrawRx3);

  const u2TokAfter = await zenToken.balanceOf(user2.address);
  console.log(`\n  User2  before=${fmt(u2TokBefore)}  after=${fmt(u2TokAfter)}  delta=${fmt(u2TokAfter - u2TokBefore)}`);
  assert(u2TokAfter > u2TokBefore, "user2 balance increased (claim + withdraw)");

  await printDepositInfo(staker, depositId2, "after user2 full withdraw (deposit2)");
  await printDepositInfo(staker, depositId3, "after user2 full withdraw (deposit3)");

  // -- 18: Final state verification ---------------------------------------------
  section("18 - Final global state verification");

  const gsFinal = await printGlobalState(staker, "after all withdrawals");
  assert(gsFinal.totalStaked       === 0n, "totalStaked == 0");
  assert(gsFinal.totalEarningPower === 0n, "totalEarningPower == 0");

  const stakerBal = await zenToken.balanceOf(await staker.getAddress());
  console.log(`\n  ZenStaker remaining ZEN balance (undistributed rewards): ${fmt(stakerBal)}`);

  // -- Summary ------------------------------------------------------------------
  section("SUCCESS - End-to-End Test PASSED");

  console.log(`\n  Mode     : ${USE_ANVIL ? `Anvil (local, port ${ANVIL_PORT})` : "Testnet"}`);
  console.log(`  Network  : ${(await provider.getNetwork()).name}`);
  console.log("\n  Contracts deployed:");
  console.log(`    MockZenToken                    : ${await zenToken.getAddress()}`);
  console.log(`    IdentityEarningPowerCalc        : ${await calculator.getAddress()}`);
  console.log(`    ZenStaker                       : ${await staker.getAddress()}`);
  console.log("\n  Deposits:");
  console.log(`    User1 depositId          : ${depositId1}`);
  console.log(`    User2 depositId          : ${depositId2}`);
  console.log(`    User2 depositId (permit) : ${depositId3}`);
  console.log("\n  All assertions passed. ZenStaker full lifecycle verified on-chain.\n");
}

// Module-level handle so process exit handlers can reach it
let _anvilProc = null;
// Module-level provider + ABI — populated in run() for use by the error handler
let _provider  = null;
let _stIface   = null;
process.on("exit",    () => { if (_anvilProc) _anvilProc.kill(); });
process.on("SIGINT",  () => { if (_anvilProc) _anvilProc.kill(); process.exit(130); });
process.on("SIGTERM", () => { if (_anvilProc) _anvilProc.kill(); process.exit(143); });

main()
  .then(() => process.exit(0))
  .catch(async err => {
    console.error("\n  FATAL:", err.message ?? err);
    if (err.data) console.error("  Error data:", err.data);

    // Fetch full tx and simulate to decode the revert reason
    const hash = err.receipt?.hash;
    if (_provider && hash) {
      try {
        const fullTx = await _provider.getTransaction(hash);
        if (fullTx) {
          const isOog = fullTx.gasLimit === err.receipt.gasUsed;
          console.error(
            `\n  [DIAG] gasLimit=${fullTx.gasLimit}  gasUsed=${err.receipt.gasUsed}` +
            `  OOG=${isOog}`
          );
          console.error("  [DIAG] simulating call to decode revert…");
          try {
            await _provider.call({
              to:   fullTx.to,
              from: fullTx.from,
              data: fullTx.data,
            });
            console.error("  [DIAG] simulation passed (state changed since tx was mined)");
          } catch (simErr) {
            if (simErr.data) {
              console.error("  [DIAG] revert bytes:", simErr.data);
              // Try staker ABI first
              if (_stIface) {
                try {
                  const e = _stIface.parseError(simErr.data);
                  console.error("  [DIAG] decoded:", e.name, [...e.args].map(a => a.toString()).join(", "));
                } catch { /* not in staker ABI */ }
              }
              // Common ERC-20 / Panic selectors
              const sel = simErr.data.slice(0, 10);
              const KNOWN = {
                "0x7939f424": "ERC20InsufficientAllowance",
                "0xfb8f41b2": "ERC20InsufficientBalance",
                "0x4e487b71": "Panic (arithmetic/OOG in sub-call)",
              };
              if (KNOWN[sel]) console.error("  [DIAG] known selector:", KNOWN[sel]);
            } else {
              console.error("  [DIAG] simulation failed, no revert data:", simErr.message);
            }
          }
        }
      } catch (diagErr) {
        console.error("  [DIAG] diagnostic error:", diagErr.message);
      }
    }
    process.exit(1);
  });
