#!/usr/bin/env bash
# Mint GOV test tokens (public mint on the ERC20VotesMock — the deploy script
# mints none, so totalSupply starts at 0).
#
# Usage: ./mint.sh [recipient] [amount_in_GOV]
#   recipient  address to receive tokens   (default: admin / anvil account #3)
#   amount     human GOV amount, 18 decimals applied (default: 10)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

RECIPIENT="${1:-$ADMIN}"
AMOUNT_GOV="${2:-10}"
AMOUNT_WEI="$(cast to-wei "$AMOUNT_GOV")"

echo "[mint] token=$TOKEN recipient=$RECIPIENT amount=${AMOUNT_GOV} GOV"
cast send "$TOKEN" "mint(address,uint256)" "$RECIPIENT" "$AMOUNT_WEI" \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"

echo -n "[mint] balance now: "
cast call "$TOKEN" "balanceOf(address)(uint256)" "$RECIPIENT" --rpc-url "$RPC_URL"
