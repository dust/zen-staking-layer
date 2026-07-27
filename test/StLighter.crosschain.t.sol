// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SendParam, MessagingFee} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {OptionsBuilder} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";
import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/TestHelperOz5.sol";
import {ZenStaker} from "../src/ZenStaker.sol";
import {
  IdentityEarningPowerCalculator
} from "../src/calculators/IdentityEarningPowerCalculator.sol";
import {StLighter} from "../src/stlighter/StLighter.sol";
import {LtZEN} from "../src/stlighter/LtZEN.sol";
import {ILtZEN} from "../src/stlighter/ILtZEN.sol";
import {ERC20VotesMock} from "./mocks/MockERC20Votes.sol";
import {StLighterProxyDeploy} from "./helpers/StLighterProxyDeploy.sol";

/// @notice Cross-chain OFT tests (Horizen hub + Base spoke) using LayerZero TestHelperOz5.
/// @dev Hub/spoke eids are synthetic test endpoints (1 = hub, 2 = spoke).
contract StLighterCrossChainTest is TestHelperOz5 {
  using OptionsBuilder for bytes;

  uint32 internal constant HUB_EID = 1;
  uint32 internal constant SPOKE_EID = 2;

  ERC20VotesMock zen;
  IdentityEarningPowerCalculator calculator;
  ZenStaker zenStaker;
  LtZEN hubLtZen;
  LtZEN spokeLtZen;
  StLighter hubProtocol;

  address governance = makeAddr("governance");
  address rewardNotifier = makeAddr("rewardNotifier");
  address alice = makeAddr("alice");

  function setUp() public override {
    super.setUp();
    setUpEndpoints(2, LibraryType.SimpleMessageLib);

    vm.warp(1_000_000);
    zen = new ERC20VotesMock();
    calculator = new IdentityEarningPowerCalculator();
    zenStaker = new ZenStaker(IERC20(address(zen)), calculator, 0, governance);
    vm.prank(governance);
    zenStaker.setRewardNotifier(rewardNotifier, true);

    hubLtZen = new LtZEN(
      "ltZEN", "ltZEN", address(endpoints[HUB_EID]), address(this), address(0)
    );
    (, hubProtocol) = StLighterProxyDeploy.deploy(
      IERC20(address(zen)), zenStaker, ILtZEN(address(hubLtZen)), governance
    );
    hubLtZen.setMinter(address(hubProtocol));

    spokeLtZen = new LtZEN(
      "ltZEN", "ltZEN", address(endpoints[SPOKE_EID]), address(this), address(0)
    );

    address[] memory oftApps = new address[](2);
    oftApps[0] = address(hubLtZen);
    oftApps[1] = address(spokeLtZen);
    wireOApps(oftApps);
  }

  function test_BridgePreservesTotalSupplyAcrossChains() public {
    uint256 depositAmt = 1000e18;
    uint256 bridgeAmt = 400e18;
    uint256 shares = _deposit(alice, depositAmt);

    uint256 totalBefore = hubLtZen.totalSupply() + spokeLtZen.totalSupply();
    assertEq(totalBefore, shares);

    _bridgeHubToSpoke(alice, bridgeAmt);

    assertEq(hubLtZen.totalSupply() + spokeLtZen.totalSupply(), totalBefore);
    assertEq(hubLtZen.balanceOf(alice), shares - bridgeAmt);
    assertEq(spokeLtZen.balanceOf(alice), bridgeAmt);
  }

  function test_BridgeDoesNotChangeExchangeRate() public {
    uint256 depositAmt = 2000e18;
    _deposit(alice, depositAmt);

    uint256 issuedBefore = hubProtocol.issuedShares();
    uint256 assetsPerShare = hubProtocol.convertToAssets(1e18);

    _notifyReward(500e18);
    vm.warp(block.timestamp + 7 days);
    hubProtocol.harvest();

    uint256 assetsPerShareAfterHarvest = hubProtocol.convertToAssets(1e18);
    assertGt(assetsPerShareAfterHarvest, assetsPerShare);

    _bridgeHubToSpoke(alice, 500e18);

    assertEq(hubProtocol.issuedShares(), issuedBefore);
    assertEq(hubProtocol.convertToAssets(1e18), assetsPerShareAfterHarvest);
  }

  function test_SpokeCannotLocalMint() public {
    vm.expectRevert(); // LtZEN__NotMinter
    spokeLtZen.mint(alice, 1e18);
  }

  function test_SendToUnconfiguredPeerReverts() public {
    _deposit(alice, 100e18);

    uint32 badEid = 999;
    SendParam memory sendParam = SendParam({
      dstEid: badEid,
      to: bytes32(uint256(uint160(alice))),
      amountLD: 10e18,
      minAmountLD: 10e18,
      extraOptions: bytes(""),
      composeMsg: bytes(""),
      oftCmd: bytes("")
    });

    vm.expectRevert(abi.encodeWithSignature("NoPeer(uint32)", badEid));
    hubLtZen.quoteSend(sendParam, false);
  }

  function _deposit(address _user, uint256 _assets) internal returns (uint256 shares) {
    zen.mint(_user, _assets);
    vm.startPrank(_user);
    zen.approve(address(hubProtocol), _assets);
    shares = hubProtocol.deposit(_assets, _user);
    vm.stopPrank();
  }

  function _notifyReward(uint256 _amount) internal {
    zen.mint(rewardNotifier, _amount);
    vm.startPrank(rewardNotifier);
    zen.transfer(address(zenStaker), _amount);
    zenStaker.notifyRewardAmount(_amount);
    vm.stopPrank();
  }

  function _bridgeHubToSpoke(address _from, uint256 _amount) internal {
    bytes memory extraOptions = OptionsBuilder.newOptions().addExecutorLzReceiveOption(500_000, 0);
    SendParam memory sendParam = SendParam({
      dstEid: SPOKE_EID,
      to: bytes32(uint256(uint160(_from))),
      amountLD: _amount,
      minAmountLD: _amount,
      extraOptions: extraOptions,
      composeMsg: bytes(""),
      oftCmd: bytes("")
    });
    MessagingFee memory fee = hubLtZen.quoteSend(sendParam, false);
    vm.deal(_from, fee.nativeFee);
    vm.prank(_from);
    hubLtZen.send{value: fee.nativeFee}(sendParam, fee, _from);
    verifyPackets(SPOKE_EID, address(spokeLtZen));
  }
}
