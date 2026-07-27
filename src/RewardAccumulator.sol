// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.28;

import {Staker} from "./Staker.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title RewardAccumulator
/// @notice Buffers ZEN rewards from multiple sources and forwards them to the ZenStaker on a fixed
/// window schedule, so contributors do not each restart the staker's 30-day reward period.
/// @dev Phase 1 runs in OPEN MODE (`whitelistEnabled == false`): contribution and `sendRewardsToStaker`
/// are permissionless by design. The timing/rate consequences of that design — an empty / zero-reward
/// flush advancing the schedule grid, and a sub-`REWARD_DURATION` ("dust") total reverting the flush via
/// the inherited `Staker__InvalidRewardRate` guard — are INTENDED, self-healing, and documented as
/// accepted known behaviors (out of scope for the bug bounty). See `SECURITY.md` "Known behaviors" item 1
/// and the developer notes on `sendRewardsToStaker` below. Loss or incorrect attribution of principal/rewards,
/// permanent denial of distribution via a different mechanism, over-extraction, or theft remain in scope.
contract RewardAccumulator is Ownable {

    uint256 public constant MAX_TIME_WINDOW = 90 days;

    Staker public immutable staker;
    ERC20 public immutable rewardToken;

    uint256 public lastRewardTime;
    uint256 public timeWindow;
    bool public whitelistEnabled;
    mapping(address => bool) public whitelist;
    uint256 public accumulatedRewards;

    event TimeWindowSet(uint256 timeWindow);
    event WhitelistEnabledSet(bool enabled);
    event WhitelistSet(address indexed user, bool enabled);
    event RewardsTransferred(address indexed from, uint256 amount);
    event RewardsAlreadyTransferredNotified(address indexed from, uint256 amount);
    event RewardsSentToStaker(uint256 amount, uint256 lastRewardTime);

    error NotWhitelisted();
    error WaitForNextRewardTime(uint256 nextRewardTime);
    error TransferNotFound();
    error TimeWindowTooLarge();
    error TimeWindowCannotBeZero();

    modifier onlyWhitelisted() {
        if (whitelistEnabled && !whitelist[msg.sender]) {
            revert NotWhitelisted();
        }
        _;
    }
    
    constructor(Staker _staker, ERC20 _rewardToken, uint256 _timeWindow, bool _whitelistEnabled) Ownable(msg.sender) {
        if (_timeWindow > MAX_TIME_WINDOW) {
            revert TimeWindowTooLarge();
        }
        if(_timeWindow == 0) {
            revert TimeWindowCannotBeZero();
        }
        
        staker = _staker;
        rewardToken = _rewardToken;
        timeWindow = _timeWindow;
        whitelistEnabled = _whitelistEnabled;
        lastRewardTime = block.timestamp;
    }

    // Admin functions
    function setTimeWindow(uint256 _timeWindow) external onlyOwner {
        if (_timeWindow > MAX_TIME_WINDOW) {
            revert TimeWindowTooLarge();
        }
        if(_timeWindow == 0) {
            revert TimeWindowCannotBeZero();
        }
        timeWindow = _timeWindow;
        emit TimeWindowSet(_timeWindow);
    }

    function setWhitelistEnabled(bool enabled) external onlyOwner {
        whitelistEnabled = enabled;
        emit WhitelistEnabledSet(enabled);
    }

    function setWhitelist(address user, bool enabled) external onlyOwner {
        whitelist[user] = enabled;
        emit WhitelistSet(user, enabled);
    }

    function nextRewardTime() public view returns (uint256) {
        return lastRewardTime + timeWindow;
    }

    //RewardAccumulator functions

    function transferAndNotifyRewards(uint256 amount) external onlyWhitelisted {
        // transfer tokens in this contract
        SafeERC20.safeTransferFrom(rewardToken, msg.sender, address(this), amount);
        // update accumulated rewards
        accumulatedRewards += amount;
        emit RewardsTransferred(msg.sender, amount);
    }

    //invoke this method after safeTransferFrom if you prefer to transfer them manually and then notify the contract - use the same exact amount as the one you transferred to the contract
    function notifyAlreadyTransferredRewards(uint256 amount) external onlyWhitelisted {
        // check that the amount transferred in is equal to the amount specified
        if (rewardToken.balanceOf(address(this)) - accumulatedRewards < amount) {
            revert TransferNotFound();
        }
        // update accumulated rewards
        accumulatedRewards += amount;
        emit RewardsAlreadyTransferredNotified(msg.sender, amount);
    }

    /// @notice Forwards the accumulated rewards to the staker and advances the reward-window grid.
    /// @dev Permissionless by design in open mode (`whitelistEnabled == false`): anyone may call this
    /// once the window has elapsed. Two consequences are INTENDED and are documented as accepted known
    /// behaviors (out of scope for the bug bounty — see `SECURITY.md` "Known behaviors" item 1). Both
    /// are timing effects that cause no loss, regardless of the impact label a report might assign:
    ///
    ///   (a) Empty / zero-reward flush. If `accumulatedRewards == 0` the transfer/notify/reset block is
    ///       skipped but `lastRewardTime` still advances (the grid snap below). A deposit made later in
    ///       that same window is therefore delivered at the NEXT window boundary rather than
    ///       immediately — a delay of at most one `timeWindow` (full delivery, principal unaffected). It
    ///       is self-healing: an empty flush is only possible while nothing is accumulated, and once any
    ///       reward is present the next boundary call delivers it in full.
    ///
    ///   (b) Sub-`REWARD_DURATION` ("dust") total. If `accumulatedRewards` is below the staker's
    ///       `REWARD_DURATION` (2,592,000 wei), `staker.notifyRewardAmount` rounds the reward rate to
    ///       zero and reverts with `Staker__InvalidRewardRate`, reverting this whole call. This is NOT a
    ///       permanent freeze and NOT theft: the revert is atomic so `lastRewardTime` does not advance,
    ///       `accumulatedRewards` is monotonic, and because contribution is open anyone can top the
    ///       balance above the threshold — the next flush then distributes everything, dust included.
    ///       Tokens only ever flow contributor -> accumulator -> staker -> stakers.
    ///
    /// In production both effects are not just self-healing but unreachable, by operational design
    /// (enforced off-chain, not in this contract): the reward tranche for the next window is funded
    /// into the accumulator during the first ~10 days of the current 30-day window, and an off-chain
    /// keeper calls this function as soon as the window gate opens. So at every boundary
    /// `accumulatedRewards` is already a full, legitimate tranche — there is no empty window to "burn"
    /// (a), and that tranche is many orders of magnitude above the 2,592,000-wei minimum-rate threshold,
    /// so a griefer's dust can never pull the total below it (b) — `accumulatedRewards` only ever
    /// increases, so dust can only raise it.
    ///
    /// In scope regardless of the above: any loss or incorrect attribution of principal or rewards,
    /// permanent denial of distribution via a DIFFERENT mechanism, over-extraction, or theft.
    function sendRewardsToStaker() public {
        if (block.timestamp < nextRewardTime()) {
            revert WaitForNextRewardTime(nextRewardTime());
        }

        uint256 rewardAmount = accumulatedRewards;

        // Intended: transfer/notify/reset run only when there is something to deliver. A call with
        // rewardAmount == 0 is a harmless, self-healing empty flush (see @dev (a) above).
        if (rewardAmount > 0) {
            // transfer accumulated rewards to staker
            SafeERC20.safeTransfer(rewardToken, address(staker), rewardAmount);
            // notify the staker that rewards were transferred in. Reverts with Staker__InvalidRewardRate
            // if rewardAmount < REWARD_DURATION (dust); that revert is atomic and recoverable (see @dev (b)).
            staker.notifyRewardAmount(rewardAmount);
            // reset accumulated rewards
            accumulatedRewards = 0;
        }
        // Intended: snap to the latest grid point <= block.timestamp, preserving the original fixed
        // schedule. This advances unconditionally (even on an empty flush) so the grid never drifts after
        // idle windows; see test_sendRewardsToStaker_catchesUpMultipleIdleWindowsInOneCall.
        uint256 elapsedWindows = (block.timestamp - lastRewardTime) / timeWindow;
        lastRewardTime += elapsedWindows * timeWindow;
        emit RewardsSentToStaker(rewardAmount, lastRewardTime);
    }
        
}