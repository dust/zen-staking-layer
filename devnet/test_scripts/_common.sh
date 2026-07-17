#!/usr/bin/env bash
# Shared config + helpers for the devnet test scripts. Source it, don't run it:
#   . "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
#
# Every value can be overridden from the environment, e.g.:
#   RPC_URL=http://1.2.3.4:8545 ./mint.sh
set -euo pipefail

# Resolve repo root from this file's location (devnet/test_scripts -> repo root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RPC_URL="${RPC_URL:-http://localhost:8545}"
# Anvil default account #3 — the devnet deployer / staker admin. Public dev key,
# never use outside a local devnet.
PRIVATE_KEY="${PRIVATE_KEY:-0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6}"
ADMIN="${ADMIN:-0x90F79bf6EB2c4f870365E785982E1f101E93b906}"

BROADCAST="$REPO_ROOT/broadcast/DeployZenStakerTestnet.s.sol/31337/run-latest.json"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "error: '$1' not found on PATH" >&2; exit 1; }
}
require cast

# Pick whatever JSON tool is available to read the broadcast file (jq optional).
if command -v jq >/dev/null 2>&1; then
  JSON_TOOL=jq
elif command -v python3 >/dev/null 2>&1; then
  JSON_TOOL=python3
elif command -v node >/dev/null 2>&1; then
  JSON_TOOL=node
else
  echo "error: need one of 'jq', 'python3' or 'node' on PATH to parse the broadcast file" >&2
  exit 1
fi

[ -f "$BROADCAST" ] || {
  echo "error: broadcast file not found: $BROADCAST" >&2
  echo "       Bring the devnet up first ('docker compose up') so the contracts deploy." >&2
  exit 1
}

# Pull the first deployed instance of a contract from the forge broadcast file.
contract_address() {
  case "$JSON_TOOL" in
    jq)
      jq -r --arg name "$1" \
        '.transactions[] | select(.contractName==$name) | .contractAddress' "$BROADCAST" | head -n1
      ;;
    python3)
      python3 -c '
import json, sys
name, path = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
for t in data.get("transactions", []):
    if t.get("contractName") == name:
        print(t.get("contractAddress") or "")
        break
' "$1" "$BROADCAST"
      ;;
    node)
      node -e '
const [name, path] = process.argv.slice(1);
const data = JSON.parse(require("fs").readFileSync(path, "utf8"));
const t = (data.transactions || []).find(t => t.contractName === name);
if (t) console.log(t.contractAddress || "");
' "$1" "$BROADCAST"
      ;;
  esac
}

TOKEN="$(contract_address ERC20VotesMock)"
STAKER="$(contract_address ZenStaker)"

[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] \
  || { echo "error: could not resolve token (ERC20VotesMock) address from broadcast" >&2; exit 1; }
[ -n "$STAKER" ] && [ "$STAKER" != "null" ] \
  || { echo "error: could not resolve staker (ZenStaker) address from broadcast" >&2; exit 1; }
