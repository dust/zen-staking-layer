// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {ZenStaker} from "../../src/ZenStaker.sol";
import {StLighter} from "../../src/stlighter/StLighter.sol";
import {LtZEN} from "../../src/stlighter/LtZEN.sol";
import {ERC20VotesMock} from "../mocks/MockERC20Votes.sol";

/// @notice Invariant handler for StLighter. Drives randomized deposit / redeem / harvest /
/// reward-notify / time-warp sequences across a set of actors, tracking ghost variables the
/// invariant contract checks. Models the SINGLE-CHAIN case (no OFT bridging), so issuedShares
/// must equal ltZEN.totalSupply() throughout.
contract StLighterHandler is CommonBase, StdCheats, StdUtils {
  StLighter public immutable protocol;
  ZenStaker public immutable staker;
  LtZEN public immutable ltZen;
  ERC20VotesMock public immutable zen;
  address public immutable rewardNotifier;

  address[] public actors;
  address internal currentActor;

  // ghost vars
  uint256 public ghost_totalDeposited; // ZEN net-staked via deposits
  uint256 public ghost_totalRedeemed; // ZEN paid out via redeems
  uint256 public ghost_totalNotified; // ZEN sent in as rewards

  // Monotonicity baseline: a permanent "anchor" holder that deposits once and NEVER redeems.
  // Its redeemable assets must never decrease (rewards only ever lift it). This isolates true
  // value loss from the rate-probe jitter that virtual-offset math produces as the pool size
  // swings with other actors' deposits/redeems.
  address public anchor;
  uint256 public anchorShares;
  uint256 public ghost_anchorAssetsLow; // lowest redeemable-assets ever seen for the anchor
  bool public ghost_anchorValueDropped;
  uint256 public ghost_anchorMaxDrop;

  modifier useActor(uint256 _seed) {
    currentActor = actors[bound(_seed, 0, actors.length - 1)];
    vm.startPrank(currentActor);
    _;
    vm.stopPrank();
    _recordAnchor();
  }

  constructor(
    StLighter _protocol,
    ZenStaker _staker,
    LtZEN _ltZen,
    ERC20VotesMock _zen,
    address _rewardNotifier
  ) {
    protocol = _protocol;
    staker = _staker;
    ltZen = _ltZen;
    zen = _zen;
    rewardNotifier = _rewardNotifier;
    for (uint256 i = 0; i < 4; i++) {
      actors.push(makeAddr(string(abi.encodePacked("actor", vm.toString(i)))));
    }
    // Seed the permanent anchor holder with a fixed deposit; it never redeems.
    anchor = makeAddr("anchor");
    uint256 seedAmount = 1000e18;
    zen.mint(anchor, seedAmount);
    vm.startPrank(anchor);
    zen.approve(address(_protocol), seedAmount);
    anchorShares = _protocol.deposit(seedAmount, anchor);
    vm.stopPrank();
    ghost_anchorAssetsLow = _protocol.convertToAssets(anchorShares);
  }

  /// @dev Track the anchor holder's redeemable value. It must never fall below its prior low
  /// (beyond trivial rounding) — rewards only push it up.
  function _recordAnchor() internal {
    uint256 assets = protocol.convertToAssets(anchorShares);
    if (assets + 2 < ghost_anchorAssetsLow) {
      ghost_anchorValueDropped = true;
      uint256 drop = ghost_anchorAssetsLow - assets;
      if (drop > ghost_anchorMaxDrop) ghost_anchorMaxDrop = drop;
    }
    if (assets < ghost_anchorAssetsLow) ghost_anchorAssetsLow = assets;
  }

  function deposit(uint256 _seed, uint256 _amount) external useActor(_seed) {
    _amount = bound(_amount, 1e15, 1_000_000e18);
    zen.mint(currentActor, _amount);
    zen.approve(address(protocol), _amount);
    try protocol.deposit(_amount, currentActor) {
      ghost_totalDeposited += _amount;
    } catch {}
  }

  function redeem(uint256 _seed, uint256 _shareSeed) external useActor(_seed) {
    uint256 bal = ltZen.balanceOf(currentActor);
    if (bal == 0) return;
    uint256 shares = bound(_shareSeed, 1, bal);
    try protocol.redeem(shares, currentActor) returns (uint256 assets) {
      ghost_totalRedeemed += assets;
    } catch {}
  }

  function harvest(uint256) external {
    try protocol.harvest() {} catch {}
    _recordAnchor();
  }

  function notifyReward(uint256 _amount) external {
    _amount = bound(_amount, 1e18, 100_000e18);
    zen.mint(rewardNotifier, _amount);
    vm.startPrank(rewardNotifier);
    zen.transfer(address(staker), _amount);
    try staker.notifyRewardAmount(_amount) {
      ghost_totalNotified += _amount;
    } catch {}
    vm.stopPrank();
    _recordAnchor();
  }

  function warpAhead(uint256 _seconds) external {
    _seconds = bound(_seconds, 1, 30 days);
    vm.warp(block.timestamp + _seconds);
    _recordAnchor();
  }

  function actorsLength() external view returns (uint256) {
    return actors.length;
  }
}
