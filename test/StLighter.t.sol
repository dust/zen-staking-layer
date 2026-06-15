// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Staker} from "../src/Staker.sol";
import {ZenStaker} from "../src/ZenStaker.sol";
import {
  IdentityEarningPowerCalculator
} from "../src/calculators/IdentityEarningPowerCalculator.sol";
import {StLighter} from "../src/stlighter/StLighter.sol";
import {LtZEN} from "../src/stlighter/LtZEN.sol";
import {ILtZEN} from "../src/stlighter/ILtZEN.sol";
import {ERC20VotesMock} from "./mocks/MockERC20Votes.sol";
import {EndpointV2Mock} from "@layerzerolabs/test-devtools-evm-foundry/mocks/EndpointV2Mock.sol";
import {StLighterProxyDeploy} from "./helpers/StLighterProxyDeploy.sol";
import {MockERC1271Wallet} from "./mocks/MockERC1271Wallet.sol";

/// @notice Integration tests for the stLighter protocol. Mirrors ZenStaker.t.sol: one base
/// contract with shared setUp + helpers, then per-feature child contracts.
///
/// Cross-chain OFT tests live in `test/StLighter.crosschain.t.sol` (TestHelperOz5).
contract StLighterTest is Test {
  ERC20VotesMock zen;
  IdentityEarningPowerCalculator calculator;
  ZenStaker zenStaker;
  LtZEN ltZen;
  StLighter protocol;
  StLighter implementation;

  address governance = makeAddr("governance");
  address rewardNotifier = makeAddr("rewardNotifier");
  address alice = makeAddr("alice");
  address bob = makeAddr("bob");

  // LayerZero endpoint mock — LtZEN/OFT constructor calls endpoint.setDelegate().
  EndpointV2Mock lzEndpoint;

  function setUp() public virtual {
    vm.warp(1_000_000);

    zen = new ERC20VotesMock();
    calculator = new IdentityEarningPowerCalculator();

    // Underlying ZenStaker (admin = governance for simplicity).
    zenStaker = new ZenStaker(IERC20(address(zen)), IERC20(address(zen)), calculator, 0, governance);
    vm.prank(governance);
    zenStaker.setRewardNotifier(rewardNotifier, true);

    // ltZEN + protocol, wired per DeployStLighterHorizen order.
    lzEndpoint = new EndpointV2Mock(1, address(this));
    ltZen = new LtZEN("Lighter Staked ZEN", "ltZEN", address(lzEndpoint), address(this), address(0));
    (implementation, protocol) = StLighterProxyDeploy.deploy(
      IERC20(address(zen)), zenStaker, ILtZEN(address(ltZen)), governance
    );
    ltZen.setMinter(address(protocol));
  }

  // --- helpers ---

  function _deposit(address _user, uint256 _assets) internal returns (uint256 shares) {
    zen.mint(_user, _assets);
    vm.startPrank(_user);
    zen.approve(address(protocol), _assets);
    shares = protocol.deposit(_assets, _user);
    vm.stopPrank();
  }

  function _notifyReward(uint256 _amount) internal {
    zen.mint(rewardNotifier, _amount);
    vm.startPrank(rewardNotifier);
    zen.transfer(address(zenStaker), _amount);
    zenStaker.notifyRewardAmount(_amount);
    vm.stopPrank();
  }

  function _zenPermitHash(address _owner, uint256 _value, uint256 _deadline)
    internal
    view
    returns (bytes32)
  {
    bytes32 typeHash = keccak256(
      "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );
    bytes32 structHash = keccak256(
      abi.encode(typeHash, _owner, address(protocol), _value, zen.nonces(_owner), _deadline)
    );
    return keccak256(abi.encodePacked("\x19\x01", zen.DOMAIN_SEPARATOR(), structHash));
  }

  function _signZenPermit(uint256 _key, address _owner, uint256 _value, uint256 _deadline)
    internal
    view
    returns (uint8 v, bytes32 r, bytes32 s)
  {
    bytes32 digest = _zenPermitHash(_owner, _value, _deadline);
    (v, r, s) = vm.sign(_key, digest);
  }
}

// ---------------------------------------------------------------------------
// Deployment & wiring
// ---------------------------------------------------------------------------
contract Setup is StLighterTest {
  function test_MinterIsProtocol() public view {
    assertEq(ltZen.minter(), address(protocol));
  }

  function test_ImmutablesWired() public view {
    assertEq(address(protocol.LT_ZEN()), address(ltZen));
    assertEq(address(protocol.STAKER()), address(zenStaker));
    assertEq(address(protocol.ZEN()), address(zen));
  }

  function test_DelegateeIsProtocolItself() public view {
    assertEq(protocol.delegatee(), address(protocol));
  }

  function test_FeeStartsAtZero() public view {
    assertEq(protocol.feeBps(), 0);
  }

  function test_OnlyMinterCanMint() public {
    vm.expectRevert(); // LtZEN__NotMinter
    vm.prank(alice);
    ltZen.mint(alice, 1e18);
  }
}

// ---------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------
contract Deposit is StLighterTest {
  function test_FirstDepositInitializesAggregateDeposit() public {
    _deposit(alice, 1000e18);
    assertTrue(protocol.initialized());
    // aggregate deposit owned & claimed by protocol; surrogate holds the ZEN
    assertEq(protocol.totalAssets(), 1000e18);
  }

  function test_FirstDepositMintsSharesScaledByOffset() public {
    // With DECIMALS_OFFSET = 3, shares are denominated 10**3 larger than assets.
    uint256 offset = 10 ** protocol.DECIMALS_OFFSET();
    uint256 shares = _deposit(alice, 1000e18);
    assertApproxEqRel(shares, 1000e18 * offset, 1e12);
    assertEq(ltZen.balanceOf(alice), shares);
    assertEq(protocol.issuedShares(), shares);
  }

  function test_SecondDepositUsesStakeMoreNotStake() public {
    _deposit(alice, 1000e18);
    Staker.DepositIdentifier id1 = protocol.depositId();
    _deposit(bob, 500e18);
    Staker.DepositIdentifier id2 = protocol.depositId();
    assertEq(Staker.DepositIdentifier.unwrap(id1), Staker.DepositIdentifier.unwrap(id2));
    assertEq(protocol.totalAssets(), 1500e18);
  }

  function test_SharesProportionalAfterRewardAccrued() public {
    uint256 aliceShares = _deposit(alice, 1000e18);
    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());
    // After ~100 ZEN reward accrued to alice's stake, the rate rose, so bob depositing the SAME
    // 1000e18 must receive FEWER shares than alice did for her pre-reward deposit.
    uint256 bobShares = _deposit(bob, 1000e18);
    assertLt(bobShares, aliceShares);
  }

  function testFuzz_DepositMintsNonZeroShares(uint96 _assets) public {
    vm.assume(_assets > 1e6);
    uint256 shares = _deposit(alice, _assets);
    assertGt(shares, 0);
  }

  function test_RevertOnZeroDeposit() public {
    vm.expectRevert(); // StLighter__ZeroAmount
    vm.prank(alice);
    protocol.deposit(0, alice);
  }

  function test_DepositWithPermitWithoutPriorApproval() public {
    uint256 key = 0xA11CE;
    address depositor = vm.addr(key);
    uint256 assets = 1000e18;
    uint256 deadline = block.timestamp + 1 hours;
    zen.mint(depositor, assets);

    (uint8 v, bytes32 r, bytes32 s) = _signZenPermit(key, depositor, assets, deadline);

    vm.prank(depositor);
    uint256 shares = protocol.depositWithPermit(assets, depositor, deadline, v, r, s);

    assertGt(shares, 0);
    assertEq(ltZen.balanceOf(depositor), shares);
    assertEq(zen.allowance(depositor, address(protocol)), 0);
  }
}

// ---------------------------------------------------------------------------
// Harvest / compounding — exchange rate must RISE, shares unchanged
// ---------------------------------------------------------------------------
contract Harvest is StLighterTest {
  function test_HarvestRaisesExchangeRate() public {
    _deposit(alice, 1000e18);
    uint256 rateBefore = protocol.convertToAssets(1e18);

    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());

    protocol.harvest();
    uint256 rateAfter = protocol.convertToAssets(1e18);
    assertGt(rateAfter, rateBefore);
  }

  function test_HarvestDoesNotChangeShareSupply() public {
    _deposit(alice, 1000e18);
    uint256 sharesBefore = protocol.issuedShares();
    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());
    protocol.harvest();
    assertEq(protocol.issuedShares(), sharesBefore);
  }

  function test_HarvestIsPermissionless() public {
    _deposit(alice, 1000e18);
    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());
    vm.prank(makeAddr("randomKeeper"));
    protocol.harvest(); // must not revert
  }

  function test_FeeTakenWhenSet() public {
    vm.prank(governance);
    protocol.setFeeParameters(1000, makeAddr("treasury")); // 10%
    _deposit(alice, 1000e18);
    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());
    protocol.harvest();
    // ~10% of ~100 ZEN reward routed to treasury
    assertApproxEqAbs(zen.balanceOf(makeAddr("treasury")), 10e18, 1e17);
  }
}

// ---------------------------------------------------------------------------
// Redeem
// ---------------------------------------------------------------------------
contract Redeem is StLighterTest {
  function test_RedeemReturnsUnderlyingZen() public {
    uint256 shares = _deposit(alice, 1000e18);
    vm.prank(alice);
    uint256 assets = protocol.redeem(shares, alice);
    assertApproxEqAbs(assets, 1000e18, 1e12);
    assertEq(zen.balanceOf(alice), assets);
    assertEq(ltZen.balanceOf(alice), 0);
  }

  function test_RedeemAfterRewardReturnsMore() public {
    uint256 shares = _deposit(alice, 1000e18);
    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());
    vm.prank(alice);
    uint256 assets = protocol.redeem(shares, alice);
    // sole depositor gets stake + essentially all reward
    assertGt(assets, 1000e18);
  }

  function test_RedeemDecrementsIssuedShares() public {
    uint256 shares = _deposit(alice, 1000e18);
    vm.prank(alice);
    protocol.redeem(shares, alice);
    assertEq(protocol.issuedShares(), 0);
  }

  function test_LargeRedeemNotBlockedByUnharvestedRewards() public {
    // Regression for PRD §5.6: redeem must harvest first so withdraw isn't capped by stale
    // balance.
    uint256 shares = _deposit(alice, 1000e18);
    _notifyReward(500e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());
    vm.prank(alice);
    uint256 assets = protocol.redeem(shares, alice); // must not revert/underpay
    assertGt(assets, 1400e18);
  }

  function test_RedeemAvailableWhilePaused() public {
    uint256 shares = _deposit(alice, 1000e18);
    vm.prank(governance);
    protocol.pause();
    vm.prank(alice);
    protocol.redeem(shares, alice); // redeem must work even when paused
  }

  function test_PreviewRedeemMatchesLastExitRedeem() public {
    uint256 shares = _deposit(alice, 1000e18);
    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());

    uint256 preview = protocol.previewRedeem(shares);
    vm.prank(alice);
    uint256 assets = protocol.redeem(shares, alice);
    assertEq(assets, preview);
    assertGt(assets, 1000e18);
  }

  function test_LastExitLeavesNoStrandedZen() public {
    uint256 aliceShares = _deposit(alice, 800e18);
    uint256 bobShares = _deposit(bob, 200e18);
    _notifyReward(50e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());

    vm.prank(alice);
    protocol.redeem(aliceShares, alice);

    uint256 preview = protocol.previewRedeem(bobShares);
    vm.prank(bob);
    uint256 assets = protocol.redeem(bobShares, bob);

    assertEq(assets, preview);
    assertEq(protocol.issuedShares(), 0);
    assertLe(zen.balanceOf(address(protocol)), 1e6);
  }
}

// ---------------------------------------------------------------------------
// Inflation attack protection — models the classic ERC4626 first-depositor attack
// against THIS protocol's accounting (vault holds no ZEN; totalAssets reads ZenStaker's
// recorded deposit balance, not raw token balances). See PRD §9-10.
// ---------------------------------------------------------------------------
contract InflationAttack is StLighterTest {
  address attacker = makeAddr("attacker");
  address victim = makeAddr("victim");

  /// @dev Donating ZEN directly to the protocol contract must NOT move totalAssets:
  /// totalAssets reads ZenStaker.getDepositInfo (recorded deposit balance + unclaimed reward),
  /// never the protocol's own ZEN balance.
  function test_DonationToProtocolDoesNotAffectTotalAssets() public {
    _deposit(alice, 1000e18);
    uint256 before = protocol.totalAssets();

    zen.mint(attacker, 5000e18);
    vm.prank(attacker);
    zen.transfer(address(protocol), 5000e18); // direct donation to the vault contract

    assertEq(protocol.totalAssets(), before, "protocol-balance donation leaked into totalAssets");
  }

  /// @dev Donating ZEN directly to the delegation surrogate must NOT move totalAssets either:
  /// getDepositInfo returns the deposit's recorded `balance`, not the surrogate's token balance.
  function test_DonationToSurrogateDoesNotAffectTotalAssets() public {
    _deposit(alice, 1000e18);
    uint256 before = protocol.totalAssets();

    address surrogate = address(zenStaker.surrogates(protocol.delegatee()));
    assertTrue(surrogate != address(0));

    zen.mint(attacker, 5000e18);
    vm.prank(attacker);
    zen.transfer(surrogate, 5000e18); // donation to the surrogate that physically holds the stake

    assertEq(protocol.totalAssets(), before, "surrogate donation leaked into totalAssets");
  }

  /// @dev The canonical attack: attacker makes a 1-wei first deposit, then donates a large amount
  /// to inflate the share price so the victim's deposit rounds to ~0 shares and is stolen on
  /// withdraw. With (a) virtual offset and (b) donations not affecting totalAssets, the victim
  /// must receive fair shares and be able to redeem ~their deposit back.
  function test_FirstDepositorCannotStealViaDonation() public {
    // attacker seeds 1 wei
    zen.mint(attacker, 1);
    vm.startPrank(attacker);
    zen.approve(address(protocol), 1);
    protocol.deposit(1, attacker);
    vm.stopPrank();

    // attacker attempts to inflate price via direct donations (both vectors)
    zen.mint(attacker, 10_000e18);
    vm.startPrank(attacker);
    zen.transfer(address(protocol), 5000e18);
    address surrogate = address(zenStaker.surrogates(protocol.delegatee()));
    zen.transfer(surrogate, 5000e18);
    vm.stopPrank();

    // victim deposits a normal amount
    uint256 victimAssets = 1000e18;
    uint256 victimShares = _deposit(victim, victimAssets);
    assertGt(victimShares, 0, "victim got zero shares - inflation attack succeeded");

    // victim redeems and should get back ~their deposit (no meaningful theft)
    vm.prank(victim);
    uint256 out = protocol.redeem(victimShares, victim);
    assertApproxEqRel(out, victimAssets, 1e15, "victim lost funds to inflation attack");
  }
}

// ---------------------------------------------------------------------------
// Governance / fees / pause
// ---------------------------------------------------------------------------
contract Governance is StLighterTest {
  function test_FeeCannotExceedMax() public {
    vm.expectRevert(); // StLighter__FeeTooHigh
    vm.prank(governance);
    protocol.setFeeParameters(2001, makeAddr("treasury")); // > 2000 bps
  }

  function test_PauseBlocksDeposit() public {
    vm.prank(governance);
    protocol.pause();
    zen.mint(alice, 100e18);
    vm.startPrank(alice);
    zen.approve(address(protocol), 100e18);
    vm.expectRevert(); // paused
    protocol.deposit(100e18, alice);
    vm.stopPrank();
  }

  function test_OnlyGovernanceCanSetFee() public {
    vm.expectRevert();
    vm.prank(alice);
    protocol.setFeeParameters(100, makeAddr("treasury"));
  }
}

// ---------------------------------------------------------------------------
// ltZEN EIP-2612 permit
// ---------------------------------------------------------------------------
contract LtZENPermit is StLighterTest {
  bytes32 constant PERMIT_TYPEHASH =
    keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

  uint256 ownerKey = 0xA11CE;
  address owner;
  address spender = makeAddr("spender");

  function setUp() public override {
    super.setUp();
    owner = vm.addr(ownerKey);
  }

  function _depositFor(address _u, uint256 _assets) internal returns (uint256 shares) {
    zen.mint(_u, _assets);
    vm.startPrank(_u);
    zen.approve(address(protocol), _assets);
    shares = protocol.deposit(_assets, _u);
    vm.stopPrank();
  }

  function test_PermitAllowsTransferWithoutPriorApproval() public {
    uint256 shares = _depositFor(owner, 1000e18);
    uint256 deadline = block.timestamp + 1 hours;

    bytes32 message =
      keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, shares, ltZen.nonces(owner), deadline));
    bytes32 messageHash = keccak256(abi.encodePacked("\x19\x01", ltZen.DOMAIN_SEPARATOR(), message));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, messageHash);

    ltZen.permit(owner, spender, shares, deadline, v, r, s);
    vm.prank(spender);
    ltZen.transferFrom(owner, spender, shares);

    assertEq(ltZen.balanceOf(spender), shares);
    assertEq(ltZen.balanceOf(owner), 0);
  }
}

// ---------------------------------------------------------------------------
// Cross-chain (OFT) — hub wiring smoke test; full suite in StLighter.crosschain.t.sol
// ---------------------------------------------------------------------------
contract CrossChain is StLighterTest {
  function test_SpokeHasNoMinter() public view {
    // On a spoke deployment, minter == address(0); local mint/burn disabled.
    // Here we only assert the hub wiring; spoke modeled in StLighter.crosschain.t.sol.
    assertTrue(ltZen.minter() != address(0)); // hub
  }
}

// ---------------------------------------------------------------------------
// Gasless meta-transactions (EIP-712 + relayer reimbursement in ZEN)
// ---------------------------------------------------------------------------
contract Gasless is StLighterTest {
  uint256 userKey = 0xB0B5;
  address user;
  address relayer = makeAddr("relayer");

  bytes32 constant DEPOSIT_TYPEHASH = keccak256(
    "DepositWithSig(uint256 assets,address receiver,uint256 maxFeeZen,address user,uint256 nonce,uint256 deadline)"
  );
  bytes32 constant REDEEM_TYPEHASH = keccak256(
    "RedeemWithSig(uint256 shares,address receiver,uint256 maxFeeZen,address user,uint256 nonce,uint256 deadline)"
  );

  function setUp() public override {
    super.setUp();
    user = vm.addr(userKey);
  }

  function _sign(bytes32 _structHash) internal view returns (bytes memory) {
    bytes32 digest =
      keccak256(abi.encodePacked("\x19\x01", protocol.DOMAIN_SEPARATOR(), _structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, digest);
    return abi.encodePacked(r, s, v);
  }

  function test_GaslessDepositPaysRelayerFromAssets() public {
    uint256 assets = 1000e18;
    uint256 maxFee = 5e18;
    uint256 fee = 3e18;
    uint256 deadline = block.timestamp + 1 hours;

    zen.mint(user, assets);
    vm.prank(user);
    zen.approve(address(protocol), assets);

    bytes32 structHash = keccak256(
      abi.encode(DEPOSIT_TYPEHASH, assets, user, maxFee, user, protocol.nonces(user), deadline)
    );
    bytes memory sig = _sign(structHash);

    vm.prank(relayer);
    protocol.depositWithSig(assets, user, maxFee, fee, user, deadline, sig);

    // relayer reimbursed in ZEN; only net assets staked
    assertEq(zen.balanceOf(relayer), fee);
    assertEq(protocol.totalAssets(), assets - fee);
    assertGt(ltZen.balanceOf(user), 0);
  }

  function test_GaslessRedeemPaysRelayerFromProceeds() public {
    // user first deposits gaslessly-free (direct) to get shares
    uint256 shares = _depositFor(user, 1000e18);

    uint256 maxFee = 5e18;
    uint256 fee = 2e18;
    uint256 deadline = block.timestamp + 1 hours;

    bytes32 structHash = keccak256(
      abi.encode(REDEEM_TYPEHASH, shares, user, maxFee, user, protocol.nonces(user), deadline)
    );
    bytes memory sig = _sign(structHash);

    vm.prank(relayer);
    uint256 assets = protocol.redeemWithSig(shares, user, maxFee, fee, user, deadline, sig);

    assertEq(zen.balanceOf(relayer), fee);
    assertEq(zen.balanceOf(user), assets - fee); // user got proceeds minus gas fee
  }

  function test_RevertWhenFeeExceedsMax() public {
    uint256 assets = 1000e18;
    uint256 maxFee = 2e18;
    uint256 deadline = block.timestamp + 1 hours;
    zen.mint(user, assets);
    vm.prank(user);
    zen.approve(address(protocol), assets);

    bytes32 structHash = keccak256(
      abi.encode(DEPOSIT_TYPEHASH, assets, user, maxFee, user, protocol.nonces(user), deadline)
    );
    bytes memory sig = _sign(structHash);

    vm.prank(relayer);
    vm.expectRevert(); // StLighter__GasFeeExceedsMax
    protocol.depositWithSig(assets, user, maxFee, maxFee + 1, user, deadline, sig);
  }

  function test_RevertWhenFeeExceedsContractCap() public {
    uint256 assets = 1000e18;
    uint256 maxFee = protocol.MAX_GAS_FEE_ZEN() + 1;
    uint256 fee = 1e18;
    uint256 deadline = block.timestamp + 1 hours;
    zen.mint(user, assets);
    vm.prank(user);
    zen.approve(address(protocol), assets);

    bytes32 structHash = keccak256(
      abi.encode(DEPOSIT_TYPEHASH, assets, user, maxFee, user, protocol.nonces(user), deadline)
    );
    bytes memory sig = _sign(structHash);

    vm.prank(relayer);
    vm.expectRevert(); // StLighter__GasFeeExceedsMax
    protocol.depositWithSig(assets, user, maxFee, fee, user, deadline, sig);
  }

  function test_DepositWithSigAndPermitWithoutPriorApproval() public {
    uint256 assets = 1000e18;
    uint256 maxFee = 5e18;
    uint256 fee = 3e18;
    uint256 deadline = block.timestamp + 1 hours;
    uint256 permitDeadline = block.timestamp + 2 hours;
    zen.mint(user, assets);

    bytes32 structHash = keccak256(
      abi.encode(DEPOSIT_TYPEHASH, assets, user, maxFee, user, protocol.nonces(user), deadline)
    );
    bytes memory sig = _sign(structHash);
    (uint8 pv, bytes32 pr, bytes32 ps) = _signZenPermit(userKey, user, assets, permitDeadline);

    vm.prank(relayer);
    protocol.depositWithSigAndPermit(
      assets, user, maxFee, fee, user, deadline, sig, permitDeadline, pv, pr, ps
    );

    assertEq(zen.balanceOf(relayer), fee);
    assertEq(protocol.totalAssets(), assets - fee);
    assertGt(ltZen.balanceOf(user), 0);
    assertEq(zen.allowance(user, address(protocol)), 0);
  }

  function test_GaslessDepositFromERC1271Wallet() public {
    MockERC1271Wallet wallet = new MockERC1271Wallet(user);
    uint256 assets = 1000e18;
    uint256 deadline = block.timestamp + 1 hours;
    zen.mint(address(wallet), assets);
    vm.prank(address(wallet));
    zen.approve(address(protocol), assets);

    bytes32 structHash = keccak256(
      abi.encode(
        DEPOSIT_TYPEHASH,
        assets,
        address(wallet),
        uint256(0),
        address(wallet),
        protocol.nonces(address(wallet)),
        deadline
      )
    );
    bytes memory sig = _sign(structHash);

    vm.prank(relayer);
    protocol.depositWithSig(assets, address(wallet), 0, 0, address(wallet), deadline, sig);

    assertGt(ltZen.balanceOf(address(wallet)), 0);
  }

  function test_RevertOnExpiredDeadline() public {
    uint256 assets = 1000e18;
    uint256 deadline = block.timestamp - 1;
    zen.mint(user, assets);
    vm.prank(user);
    zen.approve(address(protocol), assets);

    bytes32 structHash = keccak256(
      abi.encode(DEPOSIT_TYPEHASH, assets, user, uint256(0), user, protocol.nonces(user), deadline)
    );
    bytes memory sig = _sign(structHash);

    vm.prank(relayer);
    vm.expectRevert(); // StLighter__ExpiredDeadline
    protocol.depositWithSig(assets, user, 0, 0, user, deadline, sig);
  }

  function test_RevertOnReplay() public {
    uint256 assets = 500e18;
    uint256 deadline = block.timestamp + 1 hours;
    zen.mint(user, assets * 2);
    vm.prank(user);
    zen.approve(address(protocol), assets * 2);

    bytes32 structHash = keccak256(
      abi.encode(DEPOSIT_TYPEHASH, assets, user, uint256(0), user, protocol.nonces(user), deadline)
    );
    bytes memory sig = _sign(structHash);

    vm.prank(relayer);
    protocol.depositWithSig(assets, user, 0, 0, user, deadline, sig);

    // same signature again -> nonce already used -> invalid
    vm.prank(relayer);
    vm.expectRevert(); // StLighter__InvalidSignature
    protocol.depositWithSig(assets, user, 0, 0, user, deadline, sig);
  }

  function test_InvalidateNonceBlocksPendingSig() public {
    uint256 assets = 500e18;
    uint256 deadline = block.timestamp + 1 hours;
    zen.mint(user, assets);
    vm.prank(user);
    zen.approve(address(protocol), assets);

    bytes32 structHash = keccak256(
      abi.encode(DEPOSIT_TYPEHASH, assets, user, uint256(0), user, protocol.nonces(user), deadline)
    );
    bytes memory sig = _sign(structHash);

    // user invalidates their nonce before relayer submits
    vm.prank(user);
    protocol.invalidateNonce();

    vm.prank(relayer);
    vm.expectRevert(); // StLighter__InvalidSignature (nonce mismatch)
    protocol.depositWithSig(assets, user, 0, 0, user, deadline, sig);
  }

  function _depositFor(address _u, uint256 _assets) internal returns (uint256 shares) {
    zen.mint(_u, _assets);
    vm.startPrank(_u);
    zen.approve(address(protocol), _assets);
    shares = protocol.deposit(_assets, _u);
    vm.stopPrank();
  }
}

// ---------------------------------------------------------------------------
// Boundary / edge cases — multi-round compounding, fee accounting, pause matrix
// ---------------------------------------------------------------------------
contract Boundary is StLighterTest {
  address treasury = makeAddr("treasury");

  function _depositFor(address _u, uint256 _assets) internal returns (uint256 shares) {
    zen.mint(_u, _assets);
    vm.startPrank(_u);
    zen.approve(address(protocol), _assets);
    shares = protocol.deposit(_assets, _u);
    vm.stopPrank();
  }

  // --- multi-round compounding ---

  function test_MultiRoundHarvestKeepsCompounding() public {
    _depositFor(alice, 1000e18);
    uint256 a0 = protocol.totalAssets();

    for (uint256 i = 0; i < 5; i++) {
      _notifyReward(50e18);
      vm.warp(block.timestamp + zenStaker.REWARD_DURATION());
      protocol.harvest();
    }
    // totalAssets grew across rounds; shares unchanged
    assertGt(protocol.totalAssets(), a0);
    assertEq(protocol.issuedShares(), ltZen.totalSupply());
  }

  function test_HarvestNoOpWhenUninitialized() public {
    // no deposits yet -> harvest must be a safe no-op
    protocol.harvest();
    assertEq(protocol.totalAssets(), 0);
  }

  function test_HarvestNoOpWhenNoReward() public {
    _depositFor(alice, 1000e18);
    uint256 before = protocol.totalAssets();
    protocol.harvest(); // nothing notified -> claimed 0 -> no-op
    assertEq(protocol.totalAssets(), before);
  }

  // --- fee accounting ---

  function test_FeeRoutedToRecipientAcrossHarvests() public {
    vm.prank(governance);
    protocol.setFeeParameters(1500, treasury); // 15%
    _depositFor(alice, 1000e18);

    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());
    protocol.harvest();

    // ~15% of ~100 ZEN reward to treasury
    assertApproxEqAbs(zen.balanceOf(treasury), 15e18, 5e16);
  }

  function test_ZeroFeeRoutesNothing() public {
    _depositFor(alice, 1000e18);
    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());
    protocol.harvest();
    assertEq(zen.balanceOf(protocol.feeRecipient()), 0); // feeRecipient is address(0), fee 0
  }

  function test_FeeChangeTakesEffectNextHarvest() public {
    _depositFor(alice, 1000e18);

    // round 1: fee 0
    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());
    protocol.harvest();
    assertEq(zen.balanceOf(treasury), 0);

    // governance sets fee, round 2 charges it
    vm.prank(governance);
    protocol.setFeeParameters(1000, treasury);
    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());
    protocol.harvest();
    assertGt(zen.balanceOf(treasury), 0);
  }

  // --- setFeeParameters validation ---

  function test_RevertFeeAboveMax() public {
    uint256 tooHigh = protocol.MAX_FEE_BPS() + 1;
    vm.prank(governance);
    vm.expectRevert(); // StLighter__FeeTooHigh
    protocol.setFeeParameters(tooHigh, treasury);
  }

  function test_FeeAtExactMaxAllowed() public {
    uint256 maxBps = protocol.MAX_FEE_BPS();
    vm.prank(governance);
    protocol.setFeeParameters(maxBps, treasury);
    assertEq(protocol.feeBps(), maxBps);
  }

  function test_RevertNonzeroFeeWithZeroRecipient() public {
    vm.prank(governance);
    vm.expectRevert(); // StLighter__ZeroAddress
    protocol.setFeeParameters(100, address(0));
  }

  function test_ZeroFeeWithZeroRecipientAllowed() public {
    vm.prank(governance);
    protocol.setFeeParameters(0, address(0)); // disabling fee, recipient irrelevant
    assertEq(protocol.feeBps(), 0);
  }

  // --- pause matrix ---

  function test_PauseBlocksDepositButNotRedeemOrHarvest() public {
    uint256 shares = _depositFor(alice, 1000e18);
    _notifyReward(100e18);
    vm.warp(block.timestamp + zenStaker.REWARD_DURATION());

    vm.prank(governance);
    protocol.pause();

    // deposit blocked
    zen.mint(bob, 100e18);
    vm.startPrank(bob);
    zen.approve(address(protocol), 100e18);
    vm.expectRevert();
    protocol.deposit(100e18, bob);
    vm.stopPrank();

    // harvest still works
    protocol.harvest();

    // redeem still works
    vm.prank(alice);
    uint256 out = protocol.redeem(shares, alice);
    assertGt(out, 1000e18);
  }

  function test_UnpauseRestoresDeposit() public {
    vm.startPrank(governance);
    protocol.pause();
    protocol.unpause();
    vm.stopPrank();
    uint256 shares = _depositFor(alice, 1000e18);
    assertGt(shares, 0);
  }

  function test_OnlyOwnerCanPause() public {
    vm.expectRevert();
    vm.prank(alice);
    protocol.pause();
  }

  // --- empty-then-refill (last exit then new deposit) ---

  function test_FullExitThenRedepositResetsCleanly() public {
    uint256 shares = _depositFor(alice, 1000e18);
    vm.prank(alice);
    protocol.redeem(shares, alice);
    assertEq(protocol.issuedShares(), 0);
    assertEq(ltZen.totalSupply(), 0);

    // new deposit after full exit works and rate is sane
    uint256 s2 = _depositFor(bob, 500e18);
    assertGt(s2, 0);
    assertEq(protocol.issuedShares(), ltZen.totalSupply());
  }
}
