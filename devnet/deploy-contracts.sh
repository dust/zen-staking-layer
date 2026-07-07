#!/usr/bin/env sh
# Deploys the ZenStaker testnet stack onto the local anvil node.
# Runs inside the foundry image (forge/cast available). Exits 0 on success so
# the subgraph-deployer (which depends on service_completed_successfully) starts.
set -eu

echo "[contracts] waiting for anvil at ${RPC_URL} ..."
until cast block-number --rpc-url "${RPC_URL}" >/dev/null 2>&1; do
  sleep 1
done
echo "[contracts] anvil is up."

# Idempotency: if anvil restored persisted state, the deployer account already
# has a non-zero nonce -> the stack is deployed, keep the existing addresses.
DEPLOYER=$(cast wallet address --private-key "${PRIVATE_KEY}")
NONCE=$(cast nonce "${DEPLOYER}" --rpc-url "${RPC_URL}")
if [ "${NONCE}" != "0" ]; then
  echo "[contracts] deployer ${DEPLOYER} nonce=${NONCE}: chain already initialized, skipping deploy."
  exit 0
fi
echo "[contracts] fresh chain. Deploying..."

cd /repo

forge script script/DeployZenStakerTestnet.s.sol:DeployZenStakerTestnet \
  --rpc-url "${RPC_URL}" \
  --broadcast \
  -vvvv

echo "[contracts] deployment complete. Broadcast written to:"
echo "           /repo/broadcast/DeployZenStakerTestnet.s.sol/31337/run-latest.json"
