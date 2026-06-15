// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {EndpointV2Mock} from "@layerzerolabs/test-devtools-evm-foundry/mocks/EndpointV2Mock.sol";
import {ZenStaker} from "../src/ZenStaker.sol";
import {
  IdentityEarningPowerCalculator
} from "../src/calculators/IdentityEarningPowerCalculator.sol";
import {StLighter} from "../src/stlighter/StLighter.sol";
import {LtZEN} from "../src/stlighter/LtZEN.sol";
import {ERC20VotesMock} from "./mocks/MockERC20Votes.sol";
import {DeployStLighterTimelock} from "../script/DeployStLighterTimelock.s.sol";
import {DeployStLighterHorizen} from "../script/DeployStLighterHorizen.s.sol";
import {DeployStLighterBase} from "../script/DeployStLighterBase.s.sol";
import {UpgradeStLighterViaTimelock} from "../script/UpgradeStLighterViaTimelock.s.sol";

/// @notice Local, RPC-free integration tests that drive the real deploy/upgrade *scripts* and
/// assert the deploy-checklist (`docs/stLighter-deploy-checklist.md` §1-§4) acceptance conditions.
/// These move the checklist's "verify on testnet/mainnet" rows into automated assertions so a
/// broken wiring step fails here instead of mid-deploy.
contract StLighterDeployScriptTest is Test {
  // Deployer / multisig keys (the scripts read PRIVATE_KEY and broadcast as vm.addr(key)).
  uint256 internal constant DEPLOYER_KEY = uint256(0xA11CE);
  uint256 internal constant MULTISIG_KEY = uint256(0xB0B);
  address internal deployer = vm.addr(DEPLOYER_KEY);
  address internal multisig = vm.addr(MULTISIG_KEY);

  ERC20VotesMock internal zen;
  IdentityEarningPowerCalculator internal calculator;
  ZenStaker internal zenStaker;
  EndpointV2Mock internal hubEndpoint;
  EndpointV2Mock internal spokeEndpoint;
  TimelockController internal timelock;

  address internal rewardNotifier = makeAddr("rewardNotifier");
  address internal alice = makeAddr("alice");

  function setUp() public {
    vm.warp(1_000_000);
    zen = new ERC20VotesMock();
    calculator = new IdentityEarningPowerCalculator();
    // ZenStaker admin is the multisig for parity with the production governance owner.
    zenStaker = new ZenStaker(IERC20(address(zen)), IERC20(address(zen)), calculator, 0, multisig);
    hubEndpoint = new EndpointV2Mock(1, address(this));
    spokeEndpoint = new EndpointV2Mock(2, address(this));

    // Common env the scripts read.
    vm.setEnv("PRIVATE_KEY", vm.toString(DEPLOYER_KEY));
    vm.setEnv("MULTISIG_ADDRESS", vm.toString(multisig));
    vm.setEnv("LZ_ENDPOINT_HORIZEN", vm.toString(address(hubEndpoint)));
    vm.setEnv("LZ_ENDPOINT_BASE", vm.toString(address(spokeEndpoint)));
    vm.setEnv("ZEN_TOKEN_ADDRESS", vm.toString(address(zen)));
    vm.setEnv("ZEN_STAKER_ADDRESS", vm.toString(address(zenStaker)));

    // Deploy the timelock via its real script so every test starts from production governance.
    timelock = new DeployStLighterTimelock().run();
    vm.setEnv("TIMELOCK_ADDRESS", vm.toString(address(timelock)));
    // StLighterGovernanceLib.timelockAddress() reads TIMELOCK_ADDRESS but Solidity eagerly
    // evaluates the envOr fallback, so GOVERNANCE_ADDRESS must also resolve. Point it at the
    // same timelock (both aliases describe the same governance owner in production).
    vm.setEnv("GOVERNANCE_ADDRESS", vm.toString(address(timelock)));
  }

  // --- Checklist §1.3 / governance roles -----------------------------------------------------

  function test_TimelockScriptWiresRoles() public view {
    assertTrue(timelock.hasRole(timelock.PROPOSER_ROLE(), multisig), "multisig is proposer");
    assertTrue(timelock.hasRole(timelock.CANCELLER_ROLE(), multisig), "multisig is canceller");
    // EXECUTOR granted to address(0) means open execution after the delay.
    assertTrue(timelock.hasRole(timelock.EXECUTOR_ROLE(), address(0)), "open executor");
    assertEq(timelock.getMinDelay(), 2 days, "default min delay");
  }

  // --- Checklist §1: Horizen hub --------------------------------------------------------------

  function test_HorizenScriptDeploysHubAndTransfersGovernance() public {
    (LtZEN ltZen, StLighter protocol,) = new DeployStLighterHorizen().run();

    // §1.1 minter is the proxy; §1.4 ownership moved to timelock; §1.5 fee off and not paused.
    assertEq(ltZen.minter(), address(protocol), "ltZEN minter == proxy");
    assertEq(ltZen.owner(), address(timelock), "ltZEN owner == timelock");
    assertEq(protocol.owner(), address(timelock), "protocol owner == timelock");
    assertEq(protocol.feeBps(), 0, "fee disabled at launch");
    assertFalse(protocol.paused(), "not paused at launch");

    // Wiring sanity: protocol points at the configured ZEN / staker / share token.
    assertEq(address(protocol.ZEN()), address(zen), "ZEN wired");
    assertEq(address(protocol.STAKER()), address(zenStaker), "staker wired");
    assertEq(address(protocol.LT_ZEN()), address(ltZen), "ltZEN wired");
    assertEq(keccak256(bytes(ltZen.name())), keccak256(bytes("ltZEN")), "name == ltZEN");
    assertEq(keccak256(bytes(ltZen.symbol())), keccak256(bytes("ltZEN")), "symbol == ltZEN");

    _smokeDepositRedeem(ltZen, protocol);
  }

  // --- Checklist §1.6: smoke deposit -> redeem round-trips at 1:1 -----------------------------

  function _smokeDepositRedeem(LtZEN ltZen, StLighter protocol) internal {
    zen.mint(alice, 1000e18);
    vm.startPrank(alice);
    zen.approve(address(protocol), 1000e18);
    uint256 shares = protocol.deposit(1000e18, alice);
    assertEq(ltZen.balanceOf(alice), shares, "shares minted to depositor");
    uint256 assets = protocol.redeem(shares, alice);
    vm.stopPrank();
    assertApproxEqAbs(assets, 1000e18, 1e12, "redeem returns ~principal");
    assertEq(protocol.issuedShares(), 0, "no stranded shares after full exit");
  }

  // --- Checklist §2: Base spoke ---------------------------------------------------------------

  function test_BaseScriptDeploysSpokeWithoutMinter() public {
    LtZEN ltZen = new DeployStLighterBase().run();

    // §2.1 minter stays zero; §2.2 ownership to timelock.
    assertEq(ltZen.minter(), address(0), "spoke minter == 0");
    assertEq(ltZen.owner(), address(timelock), "spoke owner == timelock");

    // §2.3 no local mint/burn path exists on the spoke (only OFT cross-chain credit/debit).
    vm.expectRevert(LtZEN.LtZEN__NotMinter.selector);
    ltZen.mint(alice, 1e18);
    vm.expectRevert(LtZEN.LtZEN__NotMinter.selector);
    ltZen.burn(alice, 1e18);
  }

  // --- Checklist §4: UUPS upgrade via timelock ------------------------------------------------

  function test_UpgradeScriptScheduleThenExecutePreservesState() public {
    (LtZEN ltZen, StLighter protocol,) = new DeployStLighterHorizen().run();

    // Seed live state so we can prove continuity across the upgrade.
    zen.mint(alice, 1000e18);
    vm.startPrank(alice);
    zen.approve(address(protocol), 1000e18);
    uint256 shares = protocol.deposit(1000e18, alice);
    vm.stopPrank();

    StLighter newImpl = new StLighter();
    vm.setEnv("STLighter_PROXY_ADDRESS", vm.toString(address(protocol)));
    vm.setEnv("NEW_IMPLEMENTATION_ADDRESS", vm.toString(address(newImpl)));

    // Schedule: broadcaster must hold PROPOSER_ROLE -> use the multisig key.
    vm.setEnv("PRIVATE_KEY", vm.toString(MULTISIG_KEY));
    vm.setEnv("ACTION", "schedule");
    new UpgradeStLighterViaTimelock().run();

    // §4: must wait the timelock delay before execution.
    vm.warp(block.timestamp + 2 days);

    // Execute: open executor, any key works.
    vm.setEnv("PRIVATE_KEY", vm.toString(DEPLOYER_KEY));
    vm.setEnv("ACTION", "execute");
    new UpgradeStLighterViaTimelock().run();

    // §4.1 implementation swapped behind the proxy.
    assertEq(_implementationOf(address(protocol)), address(newImpl), "impl upgraded");
    // §4.2 minter still the proxy; accounting continuous.
    assertEq(ltZen.minter(), address(protocol), "minter stable across upgrade");
    assertEq(protocol.issuedShares(), shares, "issuedShares preserved");
    assertEq(ltZen.balanceOf(alice), shares, "balance preserved");
    assertEq(protocol.owner(), address(timelock), "owner preserved");

    // State still spendable post-upgrade.
    vm.prank(alice);
    uint256 assets = protocol.redeem(shares, alice);
    assertApproxEqAbs(assets, 1000e18, 1e12, "redeem works after upgrade");
  }

  /// @dev Reads the ERC-1967 implementation slot of a proxy.
  function _implementationOf(address proxy) internal view returns (address) {
    bytes32 slot = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    return address(uint160(uint256(vm.load(proxy, slot))));
  }
}
