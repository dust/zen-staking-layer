// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Staker} from "../src/Staker.sol";
import {ZenStakerUpgradeable} from "../src/ZenStakerUpgradeable.sol";
import {IdentityEarningPowerCalculator} from "../src/calculators/IdentityEarningPowerCalculator.sol";
import {ERC20VotesMock} from "./mocks/MockERC20Votes.sol";

/// @dev Base test contract — deploys the proxy and wires up shared helpers.
contract ZenStakerUpgradeableTest is Test {
  ERC20VotesMock zenToken;
  IdentityEarningPowerCalculator calculator;
  ZenStakerUpgradeable implementation;
  ZenStakerUpgradeable staker; // the proxy, typed as ZenStakerUpgradeable

  address admin = makeAddr("admin");
  address rewardNotifier = makeAddr("rewardNotifier");
  address alice = makeAddr("alice");
  address bob = makeAddr("bob");

  bytes32 constant PERMIT_TYPEHASH =
    keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

  function setUp() public virtual {
    vm.warp(1_000_000);

    zenToken = new ERC20VotesMock();
    vm.label(address(zenToken), "ZEN");

    calculator = new IdentityEarningPowerCalculator();

    // Deploy implementation (immutables only; initializers locked)
    implementation = new ZenStakerUpgradeable(IERC20(address(zenToken)));

    // Deploy proxy and initialize in one step
    bytes memory initData = abi.encodeCall(
      ZenStakerUpgradeable.initialize,
      (admin, calculator, 0)
    );
    ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
    staker = ZenStakerUpgradeable(address(proxy));
    vm.label(address(staker), "ZenStakerProxy");

    vm.prank(admin);
    staker.setRewardNotifier(rewardNotifier, true);
  }

  function _mintAndApprove(address _user, uint256 _amount) internal {
    zenToken.mint(_user, _amount);
    vm.prank(_user);
    zenToken.approve(address(staker), _amount);
  }

  function _notifyReward(uint256 _amount) internal {
    zenToken.mint(rewardNotifier, _amount);
    vm.startPrank(rewardNotifier);
    zenToken.transfer(address(staker), _amount);
    staker.notifyRewardAmount(_amount);
    vm.stopPrank();
  }

  function _stake(address _user, uint256 _amount, address _delegatee)
    internal
    returns (Staker.DepositIdentifier)
  {
    _mintAndApprove(_user, _amount);
    vm.prank(_user);
    return staker.stake(_amount, _delegatee);
  }
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

contract Initialize is ZenStakerUpgradeableTest {
  function test_SetsRewardAndStakeTokenToSameAddress() public view {
    assertEq(address(staker.REWARD_TOKEN()), address(zenToken));
    assertEq(address(staker.STAKE_TOKEN()), address(zenToken));
  }

  function test_SetsAdmin() public view {
    assertEq(staker.admin(), admin);
  }

  function test_SetsMaxClaimFeeToZero() public view {
    assertEq(staker.MAX_CLAIM_FEE(), 0);
  }

  function test_SetsClaimFeeParametersToZero() public view {
    (uint96 feeAmount, address feeCollector) = staker.claimFeeParameters();
    assertEq(feeAmount, 0);
    assertEq(feeCollector, address(0));
  }

  function test_SetsMaxBumpTipToZero() public view {
    assertEq(staker.maxBumpTip(), 0);
  }

  function test_CannotInitializeImplementationDirectly() public {
    vm.expectRevert();
    implementation.initialize(admin, calculator, 0);
  }

  function test_CannotReinitializeProxy() public {
    vm.expectRevert();
    staker.initialize(admin, calculator, 0);
  }
}

// ---------------------------------------------------------------------------
// Upgrade
// ---------------------------------------------------------------------------

contract Upgrade is ZenStakerUpgradeableTest {
  function test_NonAdminCannotUpgrade() public {
    ZenStakerUpgradeable newImpl = new ZenStakerUpgradeable(IERC20(address(zenToken)));
    vm.prank(alice);
    vm.expectRevert(
      abi.encodeWithSelector(Staker.Staker__Unauthorized.selector, bytes32("not admin"), alice)
    );
    staker.upgradeToAndCall(address(newImpl), "");
  }

  function test_AdminCanUpgrade() public {
    ZenStakerUpgradeable newImpl = new ZenStakerUpgradeable(IERC20(address(zenToken)));
    vm.prank(admin);
    staker.upgradeToAndCall(address(newImpl), "");
    // No revert means upgrade succeeded
  }

  function test_StatePreservedAfterUpgrade() public {
    uint256 stakeAmount = 1000e18;
    Staker.DepositIdentifier depositId = _stake(alice, stakeAmount, alice);
    _notifyReward(100e18);

    uint256 totalStakedBefore = staker.totalStaked();
    uint256 rewardEndTimeBefore = staker.rewardEndTime();

    // Upgrade to a new implementation
    ZenStakerUpgradeable newImpl = new ZenStakerUpgradeable(IERC20(address(zenToken)));
    vm.prank(admin);
    staker.upgradeToAndCall(address(newImpl), "");

    // Storage state is preserved in the proxy
    assertEq(staker.totalStaked(), totalStakedBefore);
    assertEq(staker.rewardEndTime(), rewardEndTimeBefore);
    assertEq(staker.admin(), admin);

    // Deposits are intact
    (uint96 balance, address owner,,,,) = staker.getDepositInfo(depositId);
    assertEq(balance, stakeAmount);
    assertEq(owner, alice);
  }

  function test_AdminPreservedAfterUpgrade() public {
    ZenStakerUpgradeable newImpl = new ZenStakerUpgradeable(IERC20(address(zenToken)));
    vm.prank(admin);
    staker.upgradeToAndCall(address(newImpl), "");
    assertEq(staker.admin(), admin);
  }
}

// ---------------------------------------------------------------------------
// Full lifecycle (mirrors ZenStaker.t.sol FullFlow)
// ---------------------------------------------------------------------------

contract FullFlow is ZenStakerUpgradeableTest {
  function test_StakeTimePassClaimWithdraw() public {
    uint256 stakeAmount = 1000e18;
    uint256 rewardAmount = 100e18;

    Staker.DepositIdentifier depositId = _stake(alice, stakeAmount, alice);
    assertEq(staker.totalStaked(), stakeAmount);

    _notifyReward(rewardAmount);

    vm.warp(block.timestamp + staker.REWARD_DURATION());

    uint256 unclaimed = staker.unclaimedReward(depositId);
    assertGt(unclaimed, 0);
    assertApproxEqAbs(unclaimed, rewardAmount, 1e15);

    uint256 balanceBefore = zenToken.balanceOf(alice);
    vm.prank(alice);
    uint256 claimed = staker.claimReward(depositId);
    assertGt(claimed, 0);
    assertEq(zenToken.balanceOf(alice), balanceBefore + claimed);

    assertEq(staker.unclaimedReward(depositId), 0);

    vm.prank(alice);
    staker.withdraw(depositId, stakeAmount);
    assertEq(staker.totalStaked(), 0);
  }

  function test_ZenOnZenStakingAccruesRewards() public {
    assertEq(address(staker.REWARD_TOKEN()), address(staker.STAKE_TOKEN()));

    _stake(alice, 500e18, alice);
    _stake(bob, 500e18, bob);
    _notifyReward(200e18);

    vm.warp(block.timestamp + staker.REWARD_DURATION());

    Staker.DepositIdentifier aliceId = Staker.DepositIdentifier.wrap(0);
    Staker.DepositIdentifier bobId = Staker.DepositIdentifier.wrap(1);

    uint256 aliceUnclaimed = staker.unclaimedReward(aliceId);
    uint256 bobUnclaimed = staker.unclaimedReward(bobId);

    assertApproxEqAbs(aliceUnclaimed, bobUnclaimed, 1e15);
    assertApproxEqAbs(aliceUnclaimed + bobUnclaimed, 200e18, 1e15);
  }
}

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------

contract GetDepositInfo is ZenStakerUpgradeableTest {
  function test_ReturnsCorrectDepositData() public {
    uint256 amount = 500e18;
    _mintAndApprove(alice, amount);
    vm.prank(alice);
    Staker.DepositIdentifier depositId = staker.stake(amount, bob, alice);

    (
      uint96 balance,
      address owner,
      uint96 earningPower,
      address delegatee,
      address claimer,
      uint256 unclaimedRewards
    ) = staker.getDepositInfo(depositId);

    assertEq(balance, amount);
    assertEq(owner, alice);
    assertEq(earningPower, amount);
    assertEq(delegatee, bob);
    assertEq(claimer, alice);
    assertEq(unclaimedRewards, 0);
  }

  function test_UnclaimedRewardsIncreaseOverTime() public {
    Staker.DepositIdentifier depositId = _stake(alice, 1000e18, alice);
    _notifyReward(100e18);
    vm.warp(block.timestamp + 1 days);
    (,,,,,uint256 unclaimedRewards) = staker.getDepositInfo(depositId);
    assertGt(unclaimedRewards, 0);
  }

  function testFuzz_ReturnsCorrectBalance(uint256 _amount) public {
    _amount = bound(_amount, 1e18, 1_000_000e18);
    Staker.DepositIdentifier depositId = _stake(alice, _amount, alice);
    (uint96 balance,,,,,) = staker.getDepositInfo(depositId);
    assertEq(balance, _amount);
  }
}

contract GetDepositsInfo is ZenStakerUpgradeableTest {
  function test_ReturnsBatchDataForMultipleDeposits() public {
    uint256 amountA = 100e18;
    uint256 amountB = 200e18;
    uint256 amountC = 300e18;

    Staker.DepositIdentifier idA = _stake(alice, amountA, alice);
    Staker.DepositIdentifier idB = _stake(alice, amountB, alice);
    Staker.DepositIdentifier idC = _stake(bob, amountC, bob);

    Staker.DepositIdentifier[] memory ids = new Staker.DepositIdentifier[](3);
    ids[0] = idA;
    ids[1] = idB;
    ids[2] = idC;

    (
      uint96[] memory balances,
      address[] memory owners,
      uint96[] memory earningPowers,
      uint256[] memory unclaimedRewards
    ) = staker.getDepositsInfo(ids);

    assertEq(balances[0], amountA);
    assertEq(balances[1], amountB);
    assertEq(balances[2], amountC);
    assertEq(owners[0], alice);
    assertEq(owners[1], alice);
    assertEq(owners[2], bob);
    assertEq(earningPowers[0], amountA);
    assertEq(earningPowers[1], amountB);
    assertEq(earningPowers[2], amountC);
    assertEq(unclaimedRewards[0], 0);
    assertEq(unclaimedRewards[1], 0);
    assertEq(unclaimedRewards[2], 0);
  }

  function test_EmptyArrayReturnsEmptyArrays() public view {
    Staker.DepositIdentifier[] memory ids = new Staker.DepositIdentifier[](0);
    (
      uint96[] memory balances,
      address[] memory owners,
      uint96[] memory earningPowers,
      uint256[] memory unclaimedRewards
    ) = staker.getDepositsInfo(ids);
    assertEq(balances.length, 0);
    assertEq(owners.length, 0);
    assertEq(earningPowers.length, 0);
    assertEq(unclaimedRewards.length, 0);
  }
}

contract GetGlobalState is ZenStakerUpgradeableTest {
  function test_ReturnsZeroStateBeforeAnyActivity() public view {
    (
      uint256 totalStaked_,
      uint256 totalEarningPower_,
      uint256 rewardRate_,
      uint256 rewardEndTime_,
      uint256 lastCheckpointTime_,
      uint256 rewardPerTokenAccumulated_
    ) = staker.getGlobalState();

    assertEq(totalStaked_, 0);
    assertEq(totalEarningPower_, 0);
    assertEq(rewardRate_, 0);
    assertEq(rewardEndTime_, 0);
    assertEq(lastCheckpointTime_, 0);
    assertEq(rewardPerTokenAccumulated_, 0);
  }

  function test_ReflectsTotalStakedAfterStaking() public {
    _stake(alice, 400e18, alice);
    _stake(bob, 600e18, bob);
    (uint256 totalStaked_, uint256 totalEarningPower_,,,,) = staker.getGlobalState();
    assertEq(totalStaked_, 1000e18);
    assertEq(totalEarningPower_, 1000e18);
  }
}

contract GetDepositorSummary is ZenStakerUpgradeableTest {
  function test_ReturnsZeroForUnknownDepositor() public view {
    (uint256 totalStaked_, uint256 totalEarningPower_) = staker.getDepositorSummary(alice);
    assertEq(totalStaked_, 0);
    assertEq(totalEarningPower_, 0);
  }

  function test_ReturnsAggregatedTotalsAcrossDeposits() public {
    uint256 amount1 = 300e18;
    uint256 amount2 = 700e18;
    _stake(alice, amount1, alice);
    _stake(alice, amount2, bob);
    (uint256 totalStaked_, uint256 totalEarningPower_) = staker.getDepositorSummary(alice);
    assertEq(totalStaked_, amount1 + amount2);
    assertEq(totalEarningPower_, amount1 + amount2);
  }
}

contract PermitAndStake is ZenStakerUpgradeableTest {
  function test_StakesWithoutPriorApproval() public {
    uint256 depositorKey = 0xA11CE;
    address depositor = vm.addr(depositorKey);
    uint256 amount = 500e18;
    zenToken.mint(depositor, amount);

    uint256 deadline = block.timestamp + 1 hours;
    bytes32 message = keccak256(
      abi.encode(
        PERMIT_TYPEHASH,
        depositor,
        address(staker),
        amount,
        zenToken.nonces(depositor),
        deadline
      )
    );
    bytes32 messageHash =
      keccak256(abi.encodePacked("\x19\x01", zenToken.DOMAIN_SEPARATOR(), message));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(depositorKey, messageHash);

    vm.prank(depositor);
    Staker.DepositIdentifier depositId =
      staker.permitAndStake(amount, depositor, depositor, deadline, v, r, s);

    (uint96 balance, address owner,,,,) = staker.getDepositInfo(depositId);
    assertEq(balance, amount);
    assertEq(owner, depositor);
  }
}

contract Surrogates is ZenStakerUpgradeableTest {
  function test_DeploysSurrogateOnFirstStake() public {
    assertEq(address(staker.surrogates(alice)), address(0));
    _stake(bob, 100e18, alice);
    assertFalse(address(staker.surrogates(alice)) == address(0));
  }

  function test_ReusesExistingSurrogateForSameDelegatee() public {
    _stake(alice, 100e18, bob);
    address surrogateAfterFirst = address(staker.surrogates(bob));
    _stake(alice, 100e18, bob);
    address surrogateAfterSecond = address(staker.surrogates(bob));
    assertEq(surrogateAfterFirst, surrogateAfterSecond);
  }

  function test_SurrogateHoldsStakedTokens() public {
    uint256 amount = 250e18;
    _stake(alice, amount, alice);
    address surrogate = address(staker.surrogates(alice));
    assertEq(zenToken.balanceOf(surrogate), amount);
  }
}
