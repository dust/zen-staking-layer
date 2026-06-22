#!/bin/bash

set -e  # Exit on error

if [ -z "$CALCULATOR_ADDRESS" ]; then
    echo "Error: CALCULATOR_ADDRESS environment variable is not set"
    exit 1
fi

if [ -z "$ZEN_STAKER_ADDRESS" ]; then
    echo "Error: ZEN_STAKER_ADDRESS environment variable is not set"
    exit 1
fi

if [ -z "$ZEN_STAKER_ADDRESS" ]; then
    echo "Error: ZEN_STAKER_ADDRESS environment variable is not set"
    exit 1
fi


if [ -z "$ZEN_TOKEN_ADDRESS" ]; then
    echo "Error: ZEN_TOKEN_ADDRESS environment variable is not set"
    exit 1
fi

if [ -z "$PRIVATE_KEY" ]; then
    echo "Error: PRIVATE_KEY environment variable is not set"
    exit 1
fi

if [ -z "$ETH_RPC_URL" ]; then
    echo "Error: ETH_RPC_URL environment variable is not set"
    exit 1
fi

if [ -z "$USER1_PRIVATE_KEY" ]; then
    echo "Error: USER1_PRIVATE_KEY environment variable is not set"
    exit 1
fi

if [ -z "$USER2_PRIVATE_KEY" ]; then
    echo "Error: USER2_PRIVATE_KEY environment variable is not set"
    exit 1
fi

export DEPLOYER_ADDR=$(cast wallet address --private-key $PRIVATE_KEY)
cast send $ZEN_STAKER_ADDRESS "setRewardNotifier(address,bool)" $DEPLOYER_ADDR true --private-key $PRIVATE_KEY


export ZEN_TOKEN=$(cast call $ZEN_STAKER_ADDRESS "STAKE_TOKEN(address)")
export REWARD_TOKEN=$(cast call $ZEN_STAKER_ADDRESS "REWARD_TOKEN(address)")

cast send $ZEN_TOKEN "mint()" --private-key $USER1_PRIVATE_KEY
cast send $ZEN_TOKEN "mint()" --private-key $USER2_PRIVATE_KEY
cast send $ZEN_TOKEN "mint()" --private-key $PRIVATE_KEY

cast send $ZEN_TOKEN "approve(address,uint256)" $ZEN_STAKER_ADDRESS $(cast --to-wei 256 ether) --private-key $USER1_PRIVATE_KEY
cast send $ZEN_TOKEN "approve(address,uint256)" $ZEN_STAKER_ADDRESS $(cast --to-wei 256 ether) --private-key $USER2_PRIVATE_KEY

cast send $ZEN_STAKER_ADDRESS "stake(uint256,address)" $(cast --to-wei 256 ether) $DEPLOYER_ADDR --private-key $USER1_PRIVATE_KEY
cast send $ZEN_STAKER_ADDRESS "stake(uint256,address)" $(cast --to-wei 256 ether) $DEPLOYER_ADDR --private-key $USER2_PRIVATE_KEY

export REWARD_AMOUNT=$(cast --to-wei 20 ether)
cast send $ZEN_TOKEN "transfer(address,uint256)" $ZEN_STAKER_ADDRESS $REWARD_AMOUNT --private-key $PRIVATE_KEY
cast send $ZEN_STAKER_ADDRESS "notifyRewardAmount(uint256)" $REWARD_AMOUNT --private-key $PRIVATE_KEY

