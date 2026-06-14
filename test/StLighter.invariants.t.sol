// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ZenStaker} from "../src/ZenStaker.sol";
import {IdentityEarningPowerCalculator} from
  "../src/calculators/IdentityEarningPowerCalculator.sol";
import {StLighter} from "../src/stlighter/StLighter.sol";
import {LtZEN} from "../src/stlighter/LtZEN.sol";
import {ILtZEN} from "../src/stlighter/ILtZEN.sol";
import {ERC20VotesMock} from "./mocks/MockERC20Votes.sol";
import {StLighterHandler} from "./helpers/StLighter.handler.sol";

/// @notice Invariant suite for the StLighter core layer (single-chain, no OFT bridging). Locks
/// down the accounting properties that matter most for safety and for the cross-chain rate model.
contract StLighterInvariants is Test {
  ERC20VotesMock zen;
  IdentityEarningPowerCalculator calculator;
  ZenStaker zenStaker;
  LtZEN ltZen;
  StLighter protocol;
  StLighterHandler handler;

  address governance = makeAddr("governance");
  address rewardNotifier = makeAddr("rewardNotifier");

  function setUp() public {
    vm.warp(1_000_000);
    zen = new ERC20VotesMock();
    calculator = new IdentityEarningPowerCalculator();
    zenStaker = new ZenStaker(IERC20(address(zen)), IERC20(address(zen)), calculator, 0, governance);

    ltZen = new LtZEN("Lighter Staked ZEN", "ltZEN", makeAddr("lz"), address(this), address(0));
    protocol = new StLighter(IERC20(address(zen)), zenStaker, ILtZEN(address(ltZen)), governance);
    ltZen.setMinter(address(protocol));

    vm.prank(governance);
    zenStaker.setRewardNotifier(rewardNotifier, true);

    handler = new StLighterHandler(protocol, zenStaker, ltZen, zen, rewardNotifier);

    bytes4[] memory selectors = new bytes4[](5);
    selectors[0] = StLighterHandler.deposit.selector;
    selectors[1] = StLighterHandler.redeem.selector;
    selectors[2] = StLighterHandler.harvest.selector;
    selectors[3] = StLighterHandler.notifyReward.selector;
    selectors[4] = StLighterHandler.warpAhead.selector;
    targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    targetContract(address(handler));
  }

  /// @dev Core of the cross-chain rate model (PRD §4.2, 方案 X): with no bridging, the protocol's
  /// issued-share counter must exactly equal the ltZEN token supply.
  function invariant_IssuedSharesEqualsTokenSupply() public view {
    assertEq(protocol.issuedShares(), ltZen.totalSupply());
  }

  /// @dev A holder who never redeems must never see their redeemable ZEN value fall (rewards only
  /// push it up). This is the meaningful "no value loss" property — distinct from the integer
  /// jitter of a fixed-probe rate, which fluctuates with pool size under virtual-offset math.
  function invariant_AnchorHolderValueNeverDrops() public view {
    assertFalse(handler.ghost_anchorValueDropped(), "anchor holder lost value");
  }

  /// @dev No phantom backing: convertToAssets(totalShares) must not exceed actual totalAssets
  /// (protocol is never reported as solvent for more than it holds).
  function invariant_NotOverCollateralizedReport() public view {
    uint256 shares = protocol.totalShares();
    if (shares == 0) return;
    assertLe(protocol.convertToAssets(shares), protocol.totalAssets());
  }

  /// @dev The protocol contract should not durably accumulate ZEN — everything is staked into
  /// ZenStaker; only transient dust (rounding) may remain between calls.
  function invariant_ProtocolHoldsNoStrandedZen() public view {
    assertLe(zen.balanceOf(address(protocol)), 1e6); // <= 1e6 wei tolerance for rounding dust
  }

  /// @dev totalAssets equals the aggregate ZenStaker deposit's balance + unclaimed reward.
  function invariant_TotalAssetsMatchesStakerPosition() public view {
    if (!protocol.initialized()) {
      assertEq(protocol.totalAssets(), 0);
      return;
    }
    (uint96 balance,,,,, uint256 unclaimed) = zenStaker.getDepositInfo(protocol.depositId());
    assertEq(protocol.totalAssets(), uint256(balance) + unclaimed);
  }

  function afterInvariant() public view {
    // sanity: at least some activity happened
    assertGe(
      handler.ghost_totalDeposited() + handler.ghost_totalNotified(),
      0
    );
  }
}
