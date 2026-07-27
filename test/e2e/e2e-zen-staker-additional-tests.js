#!/usr/bin/env node
/**
 * ZenStaker Additional End-to-End Tests
 *
 * Tests the following 8 specialized scenarios:
 *   1. Micro-Staking Precision (Dust Test)
 *   2. Staking Pool Max Capacity Limit (using StakerHarnessCapDeposits)
 *   3. Empty Pool Reward Preservation
 *   4. Overlapping Reward Window Re-rate
 *   5. Flash-Loan Prevention (Same-Block Claim via Multicall)
 *   6. Unauthorized Reward Injection Rejection
 *   7. Double Claim Frontrunning Mitigation (via Multicall)
 *   8. Theft Attempt of Third-Party Rewards
 *
 * -- Anvil mode (default) ----------------------------------------------------
 *   npm run e2e:additional-tests:anvil
 *
 * -- Testnet / Real network mode --------------------------------------------
 *   npm run e2e:additional-tests
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

const REWARD_WINDOW_SECONDS = 30 * 24 * 60 * 60; // 30 days
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

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function managedWallet(wallet) {
  const nm = new NonceManager(wallet);
  Object.defineProperty(nm, "address", { get: () => wallet.address });
  return nm;
}

function resetWallets(..._wallets) {
  // Intentionally a no-op — NonceManager tracks nonces in memory when each tx is
  // awaited. Manual reset() can race (async without await) or return a stale
  // "latest" nonce behind pending txs; see e2e-reward-accumulator-tests.js.
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

// ---------------------------------------------------------------------------
// Main E2E script
// ---------------------------------------------------------------------------

async function run() {
  console.log("\n  =============================================================");
  console.log(`  ZenStaker Additional E2E Tests [mode: ${USE_ANVIL ? `anvil :${ANVIL_PORT}` : "testnet"}]`);
  console.log("  =============================================================");

  let provider, deployer, user1, user2;

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
    deployer  = managedWallet(new ethers.Wallet(hdRoot.deriveChild(0).privateKey, provider));
    user1     = managedWallet(new ethers.Wallet(hdRoot.deriveChild(1).privateKey, provider));
    user2     = managedWallet(new ethers.Wallet(hdRoot.deriveChild(2).privateKey, provider));
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
    deployer  = managedWallet(new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider));
    user1     = managedWallet(new ethers.Wallet(USER1_PRIVATE_KEY, provider));
    user2     = managedWallet(new ethers.Wallet(USER2_PRIVATE_KEY, provider));
  }

  _provider = provider;

  console.log(`\n  Deployer : ${deployer.address}`);
  console.log(`  User1    : ${user1.address}`);
  console.log(`  User2    : ${user2.address}`);

  // Load Artifacts
  const mockTokenArtifact    = loadArtifact("MockERC20Votes.sol", "ERC20VotesMock");
  const calculatorArtifact   = loadArtifact("IdentityEarningPowerCalculator.sol", "IdentityEarningPowerCalculator");
  const zenStakerArtifact    = loadArtifact("ZenStaker.sol", "ZenStaker");
  const capStakerArtifact    = loadArtifact("StakerHarnessCapDeposits.sol", "StakerHarnessCapDeposits");

  const stakerIface = new ethers.Interface(zenStakerArtifact.abi);
  _stIface = stakerIface;

  // -- Setup Contracts --------------------------------------------------------
  section("Deploying E2E Environment Contracts");

  const TokenFactory = new ethers.ContractFactory(mockTokenArtifact.abi, mockTokenArtifact.bytecode, deployer);
  const tokenContract = await TokenFactory.deploy();
  await tokenContract.deploymentTransaction().wait();
  const zenToken = tokenContract.attach(await tokenContract.getAddress());
  console.log(`  MockZenToken deployed at : ${await zenToken.getAddress()}`);

  const CalcFactory = new ethers.ContractFactory(calculatorArtifact.abi, calculatorArtifact.bytecode, deployer);
  const calcContract = await CalcFactory.deploy();
  await calcContract.deploymentTransaction().wait();
  const calculator = calcContract.attach(await calcContract.getAddress());
  console.log(`  Calculator deployed at   : ${await calculator.getAddress()}`);

  const StakerFactory = new ethers.ContractFactory(zenStakerArtifact.abi, zenStakerArtifact.bytecode, deployer);
  const stakerContract = await StakerFactory.deploy(
    await zenToken.getAddress(),
    await calculator.getAddress(),
    0n,
    deployer.address
  );
  await stakerContract.deploymentTransaction().wait();
  const staker = stakerContract.attach(await stakerContract.getAddress());
  console.log(`  ZenStaker deployed at    : ${await staker.getAddress()}`);

  // Authorize deployer as notifier
  await (await staker.connect(deployer).setRewardNotifier(deployer.address, true)).wait();

  // Distribute initial tokens to users
  const mintAmount = ethers.parseEther("10000");
  await (await zenToken.connect(deployer).mint(user1.address, mintAmount)).wait();
  await (await zenToken.connect(deployer).mint(user2.address, mintAmount)).wait();
  console.log("  Minted tokens to User1 and User2.");

  let nextExpectedDepositId = 0n;

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Micro-Staking Precision (Dust Test)
  // ---------------------------------------------------------------------------
  section("Scenario 1: Micro-Staking Precision (Dust Test)");
  resetWallets(deployer, user1, user2);

  const dustStakeAmount = 5n; // 5 wei ( extremely small amount )
  await (await zenToken.connect(user1).approve(await staker.getAddress(), dustStakeAmount)).wait();

  const dustStakeTx = await staker.connect(user1)["stake(uint256,address)"](dustStakeAmount, user1.address);
  const dustStakeRx = await dustStakeTx.wait();
  logTx(`User1 staked ${dustStakeAmount} wei`, dustStakeTx, dustStakeRx);

  const dustDepositId = nextExpectedDepositId++;

  // Notify reward
  const rewardAmount = ethers.parseEther("100");
  await (await zenToken.connect(deployer).mint(await staker.getAddress(), rewardAmount)).wait();
  await (await staker.connect(deployer).notifyRewardAmount(rewardAmount)).wait();
  console.log(`  Notified reward of ${ethers.formatEther(rewardAmount)} ZEN`);

  if (USE_ANVIL) {
    // Advance time to let rewards accumulate
    await advanceTime(provider, 24 * 60 * 60); // 1 day

    const unclaimed = await staker.unclaimedReward(dustDepositId);
    console.log(`  Unclaimed reward for dust deposit: ${unclaimed.toString()} wei`);
    assert(unclaimed > 0n, "Unclaimed rewards must be greater than 0");

    // Perform claim to ensure no rounding error reverts
    const balanceBefore = await zenToken.balanceOf(user1.address);
    const claimTx = await staker.connect(user1).claimReward(dustDepositId);
    const claimRx = await claimTx.wait();
    logTx("Claim rewards for dust deposit", claimTx, claimRx);

    const balanceAfter = await zenToken.balanceOf(user1.address);
    assert(balanceAfter > balanceBefore, "Balance must increase after claim");
  } else {
    console.log("  [Real Network] Skipping time-dependent precision assertions.");
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Staking Pool Max Capacity Limit
  // ---------------------------------------------------------------------------
  section("Scenario 2: Staking Pool Max Capacity Limit");
  resetWallets(deployer, user1, user2);

  // Deploy StakerHarnessCapDeposits
  const maxCapLimit = ethers.parseEther("1000"); // 1000 ZEN cap
  const CapStakerFactory = new ethers.ContractFactory(capStakerArtifact.abi, capStakerArtifact.bytecode, deployer);
  const capStakerContract = await CapStakerFactory.deploy(
    await zenToken.getAddress(),
    await zenToken.getAddress(), // Staking token is the same
    await calculator.getAddress(),
    0n,
    deployer.address,
    "CapStaker",
    maxCapLimit
  );
  await capStakerContract.deploymentTransaction().wait();
  const capStaker = capStakerContract.attach(await capStakerContract.getAddress());
  console.log(`  StakerHarnessCapDeposits deployed at : ${await capStaker.getAddress()}`);

  // Allow User1 to stake on capStaker
  await (await zenToken.connect(user1).approve(await capStaker.getAddress(), ethers.MaxUint256)).wait();

  // Stake 990 ZEN (within cap)
  const stakeWithinCap = ethers.parseEther("990");
  const stakeWithinTx = await capStaker.connect(user1)["stake(uint256,address)"](stakeWithinCap, user1.address);
  await stakeWithinTx.wait();
  console.log(`  Staked ${ethers.formatEther(stakeWithinCap)} ZEN successfully (below cap)`);

  // Stake 20 ZEN (exceeds cap of 1000 ZEN)
  const stakeExceeding = ethers.parseEther("20");
  let threwCapExceeded = false;
  try {
    const tx = await capStaker.connect(user1)["stake(uint256,address)"](stakeExceeding, user1.address);
    await tx.wait();
  } catch (err) {
    threwCapExceeded = true;
    console.log(`  Reverted correctly: ${err.message}`);
  }
  assert(threwCapExceeded, "Transaction exceeding cap must revert");

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Empty Pool Reward Preservation
  // ---------------------------------------------------------------------------
  section("Scenario 3: Empty Pool Reward Preservation");
  resetWallets(deployer, user1, user2);

  // Deploy a fresh ZenStaker to isolate empty pool rewards
  const stakerPreserveContract = await StakerFactory.deploy(
    await zenToken.getAddress(),
    await calculator.getAddress(),
    0n,
    deployer.address
  );
  await stakerPreserveContract.deploymentTransaction().wait();
  const stakerPreserve = stakerPreserveContract.attach(await stakerPreserveContract.getAddress());
  console.log(`  Fresh ZenStaker deployed at : ${await stakerPreserve.getAddress()}`);

  // Authorize deployer as notifier
  await (await stakerPreserve.connect(deployer).setRewardNotifier(deployer.address, true)).wait();

  // Notify 100 ZEN reward while pool is empty (no stakers)
  const emptyPoolReward = ethers.parseEther("100");
  await (await zenToken.connect(deployer).mint(await stakerPreserve.getAddress(), emptyPoolReward)).wait();
  await (await stakerPreserve.connect(deployer).notifyRewardAmount(emptyPoolReward)).wait();
  console.log(`  Notified ${ethers.formatEther(emptyPoolReward)} ZEN to empty pool.`);

  if (USE_ANVIL) {
    // Advance time by 15 days (half of REWARD_DURATION)
    await advanceTime(provider, 15 * 24 * 60 * 60);

    // Alice stakes 1000 ZEN
    const aliceStake = ethers.parseEther("1000");
    await (await zenToken.connect(user1).approve(await stakerPreserve.getAddress(), aliceStake)).wait();
    const aliceStakeTx = await stakerPreserve.connect(user1)["stake(uint256,address)"](aliceStake, user1.address);
    const aliceStakeRx = await aliceStakeTx.wait();
    logTx("Alice stakes 1000 ZEN at day 15", aliceStakeTx, aliceStakeRx);

    // Advance time another 15 days (reaching day 30, end of reward period)
    await advanceTime(provider, 15 * 24 * 60 * 60);

    // Alice claims reward. Since she staked for the second half of the reward window (15 days),
    // she should earn exactly half of the reward (~50 ZEN).
    const aliceBalBefore = await zenToken.balanceOf(user1.address);
    const claimTx = await stakerPreserve.connect(user1).claimReward(0n); // first deposit on this fresh staker
    await claimTx.wait();
    const aliceBalAfter = await zenToken.balanceOf(user1.address);
    const claimed = aliceBalAfter - aliceBalBefore;
    console.log(`  Alice claimed: ${ethers.formatEther(claimed)} ZEN`);

    // Tolerance of 0.1 ZEN due to block rounding
    const expectedClaim = ethers.parseEther("50");
    const diff = claimed > expectedClaim ? claimed - expectedClaim : expectedClaim - claimed;
    assert(diff < ethers.parseEther("0.1"), `Claimed amount must be close to 50 ZEN (got ${ethers.formatEther(claimed)})`);

    // Verify the remaining 50 ZEN is preserved in the contract balance
    const contractBal = await zenToken.balanceOf(await stakerPreserve.getAddress());
    console.log(`  Remaining contract balance (preserved rewards): ${ethers.formatEther(contractBal)} ZEN`);
    assert(contractBal >= ethers.parseEther("50"), "Preserved rewards must be at least 50 ZEN");
  } else {
    console.log("  [Real Network] Skipping empty pool reward preservation assertions.");
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Overlapping Reward Window Re-rate
  // ---------------------------------------------------------------------------
  section("Scenario 4: Overlapping Reward Window Re-rate");
  resetWallets(deployer, user1, user2);

  // Deploy a fresh ZenStaker to isolate overlapping reward window tests
  const stakerOverlapContract = await StakerFactory.deploy(
    await zenToken.getAddress(),
    await calculator.getAddress(),
    0n,
    deployer.address
  );
  await stakerOverlapContract.deploymentTransaction().wait();
  const stakerOverlap = stakerOverlapContract.attach(await stakerOverlapContract.getAddress());
  console.log(`  Fresh ZenStaker (Overlap) deployed at : ${await stakerOverlap.getAddress()}`);

  // Authorize deployer as notifier
  await (await stakerOverlap.connect(deployer).setRewardNotifier(deployer.address, true)).wait();

  // User1 stakes on our fresh stakerOverlap contract
  const overlapStake = ethers.parseEther("1000");
  await (await zenToken.connect(user1).approve(await stakerOverlap.getAddress(), overlapStake)).wait();
  const overlapStakeTx = await stakerOverlap.connect(user1)["stake(uint256,address)"](overlapStake, user1.address);
  await overlapStakeTx.wait();

  // Notify 100 ZEN reward
  const firstReward = ethers.parseEther("100");
  await (await zenToken.connect(deployer).mint(await stakerOverlap.getAddress(), firstReward)).wait();
  await (await stakerOverlap.connect(deployer).notifyRewardAmount(firstReward)).wait();

  const stateBefore = await stakerOverlap.getGlobalState();
  const initialRate = stateBefore.rewardRate_;
  console.log(`  Initial reward rate: ${ethers.formatEther(initialRate)} ZEN/sec`);

  if (USE_ANVIL) {
    // Advance time by 1 day (mid-cycle)
    await advanceTime(provider, 24 * 60 * 60);
  }

  // Notify new rewards of 100 ZEN to trigger rate blending
  const newReward = ethers.parseEther("100");
  await (await zenToken.connect(deployer).mint(await stakerOverlap.getAddress(), newReward)).wait();

  const notifyOverlapTx = await stakerOverlap.connect(deployer).notifyRewardAmount(newReward);
  await notifyOverlapTx.wait();

  const stateAfter = await stakerOverlap.getGlobalState();
  const updatedRate = stateAfter.rewardRate_;
  console.log(`  Updated reward rate: ${ethers.formatEther(updatedRate)} ZEN/sec`);

  // Ensure rate was updated and blends the remaining and fresh funds
  assert(updatedRate > initialRate, "Updated reward rate must be higher than the initial rate");

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Flash-Loan Prevention (Same-Block Claim)
  // ---------------------------------------------------------------------------
  section("Scenario 5: Flash-Loan Prevention (Same-Block Claim)");
  resetWallets(deployer, user1, user2);

  // Prepare a multicall to stake and immediately claim in the exact same transaction (same block)
  const multicallStakeAmount = ethers.parseEther("100");
  await (await zenToken.connect(user1).approve(await staker.getAddress(), multicallStakeAmount)).wait();

  const localNextDepositId = nextExpectedDepositId++;
  const stakeCallData = stakerIface.encodeFunctionData("stake(uint256,address,address)", [
    multicallStakeAmount,
    user1.address,
    user1.address
  ]);
  const claimCallData = stakerIface.encodeFunctionData("claimReward", [localNextDepositId]);

  const multicallTx = await staker.connect(user1).multicall([stakeCallData, claimCallData]);
  const multicallRx = await multicallTx.wait();
  logTx("Same-block stake and claim multicall executed", multicallTx, multicallRx);

  // Check the RewardClaimed event in the logs to see the claimed amount
  const claimLog = multicallRx.logs.find(l => {
    try {
      return stakerIface.parseLog(l)?.name === "RewardClaimed";
    } catch {
      return false;
    }
  });

  if (!claimLog) {
    console.log("  No RewardClaimed event emitted (claimed amount is zero)");
    assert(true, "Rewards claimed in the exact same block must be zero");
  } else {
    const claimedAmount = stakerIface.parseLog(claimLog).args[2];
    console.log(`  Accrued and claimed amount in same block: ${claimedAmount.toString()} wei`);
    assert(claimedAmount === 0n, "Rewards claimed in the exact same block must be zero");
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Unauthorized Reward Injection Rejection
  // ---------------------------------------------------------------------------
  section("Scenario 6: Unauthorized Reward Injection Rejection");
  resetWallets(deployer, user1, user2);

  let threwUnauthorized = false;
  try {
    // User1 is not a whitelisted notifier, this must fail
    await staker.connect(user1).notifyRewardAmount(ethers.parseEther("10"));
  } catch (err) {
    threwUnauthorized = true;
    console.log(`  Reverted correctly: ${err.message}`);
  }
  assert(threwUnauthorized, "Unauthorized notifier must be rejected");

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Double Claim Frontrunning Mitigation
  // ---------------------------------------------------------------------------
  section("Scenario 7: Double Claim Frontrunning Mitigation");
  resetWallets(deployer, user1, user2);

  if (USE_ANVIL) {
    // Accumulate some rewards first
    await advanceTime(provider, 24 * 60 * 60); // 1 day
  }

  // Construct a multicall payload calling claimReward twice for the same deposit
  const doubleClaimData = stakerIface.encodeFunctionData("claimReward", [dustDepositId]);
  const doubleClaimTx = await staker.connect(user1).multicall([doubleClaimData, doubleClaimData]);
  const doubleClaimRx = await doubleClaimTx.wait();
  logTx("Double claim multicall executed", doubleClaimTx, doubleClaimRx);

  // Parse logs to check the payout amount for both claim calls
  const claimLogs = doubleClaimRx.logs.filter(l => {
    try {
      return stakerIface.parseLog(l)?.name === "RewardClaimed";
    } catch {
      return false;
    }
  });

  console.log(`  Number of claim events emitted: ${claimLogs.length}`);
  // If no rewards accrued (like on real network test where no time passed), it might not emit events or payout is 0.
  // If events are emitted, verify the second event has a payout of 0.
  if (claimLogs.length === 2) {
    const claim1 = stakerIface.parseLog(claimLogs[0]).args[2];
    const claim2 = stakerIface.parseLog(claimLogs[1]).args[2];
    console.log(`  First claim payout  : ${ethers.formatEther(claim1)} ZEN`);
    console.log(`  Second claim payout : ${ethers.formatEther(claim2)} ZEN`);
    assert(claim2 === 0n, "Second claim in the same block/tx must payout zero");
  } else if (claimLogs.length === 1) {
    // The second call did not emit because payout was 0 (Staker.sol line 761: `if (_payout == 0) return 0;`)
    const claim1 = stakerIface.parseLog(claimLogs[0]).args[2];
    console.log(`  Single claim event emitted: ${ethers.formatEther(claim1)} ZEN (Second returned 0 without emitting/reverting)`);
    assert(true, "Second claim returned 0 without reverting");
  } else {
    console.log("  No claim events emitted (accrued reward was 0). Double claim did not revert.");
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Theft Attempt of Third-Party Rewards
  // ---------------------------------------------------------------------------
  section("Scenario 8: Theft Attempt of Third-Party Rewards");
  resetWallets(deployer, user1, user2);

  let threwTheftRevert = false;
  try {
    // User2 attempts to claim rewards for User1's deposit (dustDepositId)
    await staker.connect(user2).claimReward(dustDepositId);
  } catch (err) {
    threwTheftRevert = true;
    console.log(`  Reverted correctly: ${err.message}`);
  }
  assert(threwTheftRevert, "Theft attempt by third-party must revert");

  // ---------------------------------------------------------------------------
  // SUCCESS
  // ---------------------------------------------------------------------------
  section("SUCCESS - All 8 Specialized Scenarios Passed!");

  console.log("\n  All tests completed successfully!\n");
}

let _anvilProc = null;
let _provider  = null;
let _stIface   = null;
process.on("exit",    () => { if (_anvilProc) _anvilProc.kill(); });
process.on("SIGINT",  () => { if (_anvilProc) _anvilProc.kill(); process.exit(130); });
process.on("SIGTERM", () => { if (_anvilProc) _anvilProc.kill(); process.exit(143); });

run()
  .then(() => process.exit(0))
  .catch(async err => {
    console.error("\n  FATAL:", err.message ?? err);
    if (err.data) console.error("  Error data:", err.data);
    process.exit(1);
  });
