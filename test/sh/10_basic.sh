#!/bin/bash

# ZenStaker basic flow: read on-chain state, then a user claims rewards and
# withdraws their stake. Run AFTER 00_setup.sh (which stakes user1/user2 and
# notifies a reward), once some wall-clock time has passed for rewards to accrue.
#
# Required env:
#   ZEN_STAKER_ADDRESS  ZenStaker address
#   PRIVATE_KEY         deployer / reward-notifier key
#   USER1_PRIVATE_KEY   test user 1 (staked in 00_setup.sh)
#   ETH_RPC_URL         testnet RPC (cast reads this automatically)

set -e  # Exit on error

for var in ZEN_STAKER_ADDRESS PRIVATE_KEY ETH_RPC_URL USER1_PRIVATE_KEY; do
    if [ -z "${!var}" ]; then
        echo "Error: $var environment variable is not set"
        exit 1
    fi
done

export DEPLOYER_ADDR=$(cast wallet address --private-key $PRIVATE_KEY)
export USER1_ADDR=$(cast wallet address --private-key $USER1_PRIVATE_KEY)

# No-arg immutable getters: signature must be "NAME()(returnType)".
export ZEN_TOKEN=$(cast call $ZEN_STAKER_ADDRESS "STAKE_TOKEN()(address)")
export REWARD_TOKEN=$(cast call $ZEN_STAKER_ADDRESS "REWARD_TOKEN()(address)")
echo "ZEN (stake/reward) token: $ZEN_TOKEN"

# --- Global state ------------------------------------------------------------
echo ""
echo "=== Global state ==="
echo "totalStaked:                $(cast call $ZEN_STAKER_ADDRESS 'totalStaked()(uint256)')"
echo "totalEarningPower:          $(cast call $ZEN_STAKER_ADDRESS 'totalEarningPower()(uint256)')"
echo "rewardPerTokenAccumulated:  $(cast call $ZEN_STAKER_ADDRESS 'rewardPerTokenAccumulated()(uint256)')"

# --- user1's deposit (id 0 from 00_setup.sh's first stake) -------------------
# getDepositInfo returns: balance, owner, earningPower, delegatee, claimer, unclaimedRewards
echo ""
echo "=== user1 deposit #0 ==="
cast call $ZEN_STAKER_ADDRESS "getDepositInfo(uint256)(uint96,address,uint96,address,address,uint256)" 0

# --- user1 claims rewards (caller must be the deposit's claimer) -------------
echo ""
echo "user1 claiming rewards on deposit #0..."
export ZEN_BEFORE=$(cast call $ZEN_TOKEN "balanceOf(address)(uint256)" $USER1_ADDR | awk '{print $1}')
cast send $ZEN_STAKER_ADDRESS "claimReward(uint256)" 0 --private-key $USER1_PRIVATE_KEY
export ZEN_AFTER=$(cast call $ZEN_TOKEN "balanceOf(address)(uint256)" $USER1_ADDR | awk '{print $1}')
echo "user1 ZEN reward claimed: $(echo "$ZEN_AFTER - $ZEN_BEFORE" | bc) wei"

# --- user1 withdraws full stake ---------------------------------------------
export STAKED=$(cast call $ZEN_STAKER_ADDRESS "getDepositInfo(uint256)(uint96,address,uint96,address,address,uint256)" 0 | head -1 | awk '{print $1}')
echo ""
echo "user1 withdrawing full stake ($STAKED wei) from deposit #0..."
cast send $ZEN_STAKER_ADDRESS "withdraw(uint256,uint256)" 0 $STAKED --private-key $USER1_PRIVATE_KEY

echo ""
echo "=== After withdraw ==="
cast call $ZEN_STAKER_ADDRESS "getDepositInfo(uint256)(uint96,address,uint96,address,address,uint256)" 0
echo "Done."
