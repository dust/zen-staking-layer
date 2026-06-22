#!/bin/bash

# StLighter end-to-end demo on a live testnet (Horizen).
# Flow: users deposit ZEN -> mint ltZEN -> inject rewards into ZenStaker ->
#       harvest (auto-compound) -> observe the exchange rate rise -> redeem.
#
# Prereqs (deployed via script/DeployMockZEN, DeployZenStaker, DeployStLighterHorizen):
#   ZEN_STAKER_ADDRESS  ZenStaker (proxy/contract) address
#   LT_ZEN_ADDR         ltZEN OFT share token address
#   ST_LIGHTER          StLighter protocol (proxy) address
#   PRIVATE_KEY         deployer / reward-notifier key
#   USER1_PRIVATE_KEY   test user 1
#   USER2_PRIVATE_KEY   test user 2
#   ETH_RPC_URL         testnet RPC (cast reads this automatically)

set -e  # Exit on error

for var in ZEN_STAKER_ADDRESS LT_ZEN_ADDR ST_LIGHTER PRIVATE_KEY ETH_RPC_URL USER1_PRIVATE_KEY USER2_PRIVATE_KEY; do
    if [ -z "${!var}" ]; then
        echo "Error: $var environment variable is not set"
        exit 1
    fi
done

export DEPLOYER_ADDR=$(cast wallet address --private-key $PRIVATE_KEY)
export USER1_ADDR=$(cast wallet address --private-key $USER1_PRIVATE_KEY)
export USER2_ADDR=$(cast wallet address --private-key $USER2_PRIVATE_KEY)

# ZEN is both stake and reward token; read it straight from the staker (no-arg getter).
export ZEN_TOKEN=$(cast call $ZEN_STAKER_ADDRESS "STAKE_TOKEN()(address)")
echo "ZEN token:   $ZEN_TOKEN"
echo "StLighter:   $ST_LIGHTER"
echo "ltZEN:       $LT_ZEN_ADDR"

# --- Sanity: StLighter must hold ltZEN minter role ---------------------------
export MINTER=$(cast call $LT_ZEN_ADDR "minter()(address)")
echo "ltZEN minter (expect StLighter): $MINTER"

# --- Reward path: deployer must be a reward notifier on ZenStaker ------------
cast send $ZEN_STAKER_ADDRESS "setRewardNotifier(address,bool)" $DEPLOYER_ADDR true --private-key $PRIVATE_KEY

# --- 1. Fund users with ZEN (faucet: 256 ZEN per mint) -----------------------
cast send $ZEN_TOKEN "mint()" --private-key $USER1_PRIVATE_KEY
cast send $ZEN_TOKEN "mint()" --private-key $USER2_PRIVATE_KEY
cast send $ZEN_TOKEN "mint()" --private-key $PRIVATE_KEY

export STAKE_AMOUNT=$(cast --to-wei 256 ether)

# --- 2. Users approve StLighter and deposit -> receive ltZEN -----------------
cast send $ZEN_TOKEN "approve(address,uint256)" $ST_LIGHTER $STAKE_AMOUNT --private-key $USER1_PRIVATE_KEY
cast send $ZEN_TOKEN "approve(address,uint256)" $ST_LIGHTER $STAKE_AMOUNT --private-key $USER2_PRIVATE_KEY

cast send $ST_LIGHTER "deposit(uint256,address)" $STAKE_AMOUNT $USER1_ADDR --private-key $USER1_PRIVATE_KEY
cast send $ST_LIGHTER "deposit(uint256,address)" $STAKE_AMOUNT $USER2_ADDR --private-key $USER2_PRIVATE_KEY

echo ""
echo "=== State after deposits ==="
echo "user1 ltZEN: $(cast call $LT_ZEN_ADDR 'balanceOf(address)(uint256)' $USER1_ADDR)"
echo "user2 ltZEN: $(cast call $LT_ZEN_ADDR 'balanceOf(address)(uint256)' $USER2_ADDR)"
echo "issuedShares:  $(cast call $ST_LIGHTER 'issuedShares()(uint256)')"
echo "totalAssets:   $(cast call $ST_LIGHTER 'totalAssets()(uint256)')"
echo "rate (assets per 1e18 shares): $(cast call $ST_LIGHTER 'convertToAssets(uint256)(uint256)' $(cast --to-wei 1 ether))"

# --- 3. Inject rewards into ZenStaker (accrue to StLighter's aggregate deposit) ---
export REWARD_AMOUNT=$(cast --to-wei 20 ether)
cast send $ZEN_TOKEN "transfer(address,uint256)" $ZEN_STAKER_ADDRESS $REWARD_AMOUNT --private-key $PRIVATE_KEY
cast send $ZEN_STAKER_ADDRESS "notifyRewardAmount(uint256)" $REWARD_AMOUNT --private-key $PRIVATE_KEY

echo ""
echo "Rewards notified. Allow wall-clock time to pass on the testnet, then harvest."
echo "(Rewards stream over ZenStaker.REWARD_DURATION; rate rises as they accrue + compound.)"

# --- 4. Harvest (permissionless): claim + restake -> exchange rate rises ------
cast send $ST_LIGHTER "harvest()" --private-key $PRIVATE_KEY

echo ""
echo "=== State after harvest ==="
echo "totalAssets:   $(cast call $ST_LIGHTER 'totalAssets()(uint256)')"
echo "issuedShares:  $(cast call $ST_LIGHTER 'issuedShares()(uint256)')  (unchanged by harvest)"
echo "rate (assets per 1e18 shares): $(cast call $ST_LIGHTER 'convertToAssets(uint256)(uint256)' $(cast --to-wei 1 ether))"

# --- 5. user1 redeems half of their ltZEN back to ZEN ------------------------
export USER1_SHARES=$(cast call $LT_ZEN_ADDR "balanceOf(address)(uint256)" $USER1_ADDR | awk '{print $1}')
export REDEEM_SHARES=$(echo "$USER1_SHARES / 2" | bc)

echo ""
echo "user1 redeeming $REDEEM_SHARES ltZEN shares..."
echo "previewRedeem -> $(cast call $ST_LIGHTER 'previewRedeem(uint256)(uint256)' $REDEEM_SHARES) ZEN"

export ZEN_BEFORE=$(cast call $ZEN_TOKEN "balanceOf(address)(uint256)" $USER1_ADDR | awk '{print $1}')
cast send $ST_LIGHTER "redeem(uint256,address)" $REDEEM_SHARES $USER1_ADDR --private-key $USER1_PRIVATE_KEY
export ZEN_AFTER=$(cast call $ZEN_TOKEN "balanceOf(address)(uint256)" $USER1_ADDR | awk '{print $1}')

echo ""
echo "=== After redeem ==="
echo "user1 ltZEN:   $(cast call $LT_ZEN_ADDR 'balanceOf(address)(uint256)' $USER1_ADDR)"
echo "user1 ZEN +=   $(echo "$ZEN_AFTER - $ZEN_BEFORE" | bc) wei"
echo "issuedShares:  $(cast call $ST_LIGHTER 'issuedShares()(uint256)')"
echo "Done."
