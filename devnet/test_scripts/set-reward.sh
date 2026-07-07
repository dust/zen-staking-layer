#!/usr/bin/env bash
# Start a staking reward via notifyRewardAmount. Runs the full flow:
#   1. authorize the admin (account #3) as a reward notifier  (admin-only, idempotent)
#   2. mint reward tokens straight into the staker             (notify checks the balance first)
#   3. notifyRewardAmount                                     (starts a REWARD_DURATION = 30d window)
#
# In the devnet the reward token == stake token (the GOV mock), since ZenStaker
# was deployed with the same token for both roles.
#
# Calling this again while a window is still open *adds* to the remaining reward
# and re-extends the window to 30 days from now — fund the staker accordingly.
#
# Usage: ./set-reward.sh [amount_in_GOV]
#   amount  human GOV amount, 18 decimals applied (default: 100)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

AMOUNT_GOV="${1:-100}"
AMOUNT_WEI="$(cast to-wei "$AMOUNT_GOV")"

echo "[reward] staker=$STAKER token=$TOKEN amount=${AMOUNT_GOV} GOV"

echo "[reward] 1/3 authorizing admin as reward notifier..."
cast send "$STAKER" "setRewardNotifier(address,bool)" "$ADMIN" true \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"

echo "[reward] 2/3 funding staker with reward tokens..."
cast send "$TOKEN" "mint(address,uint256)" "$STAKER" "$AMOUNT_WEI" \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"

echo "[reward] 3/3 notifying reward amount..."
cast send "$STAKER" "notifyRewardAmount(uint256)" "$AMOUNT_WEI" \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"

echo -n "[reward] done. rewardEndTime="
cast call "$STAKER" "rewardEndTime()(uint256)" --rpc-url "$RPC_URL"
echo -n "[reward] scaledRewardRate="
cast call "$STAKER" "scaledRewardRate()(uint256)" --rpc-url "$RPC_URL"
