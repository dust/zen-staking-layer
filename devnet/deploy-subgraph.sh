#!/usr/bin/env bash
# Reads the deployed ZenStaker address from the forge broadcast file,
# generates a devnet subgraph manifest and deploys it to the local graph-node.
# Runs inside a node image. Working dir: /repo/subgraphs.
set -euo pipefail

BROADCAST="/repo/broadcast/DeployZenStakerTestnet.s.sol/31337/run-latest.json"
TEMPLATE="/repo/devnet/subgraph.devnet.template.yaml"
MANIFEST="subgraph.devnet.yaml"
SUBGRAPH_NAME="zen-staker"

# Always (re)deploy: graph-node dedupes an unchanged deployment (same IPFS
# hash) into a near-noop and creates a fresh deployment when the schema/mapping
# change, so this correctly picks up subgraph edits across restarts. The
# persisted postgres index is reused for unchanged code and reindexed for new.
echo "[subgraph] reading ZenStaker address from broadcast..."
STAKER_ADDRESS=$(node -e '
  const t = require(process.argv[1]).transactions;
  const staker = t.filter(x => x.contractName === "ZenStaker").pop();
  if (!staker) { console.error("ZenStaker not found in broadcast"); process.exit(1); }
  process.stdout.write(staker.contractAddress);
' "${BROADCAST}")
echo "[subgraph] ZenStaker: ${STAKER_ADDRESS}"

# Generate the manifest with the freshly deployed address.
sed "s|__STAKER_ADDRESS__|${STAKER_ADDRESS}|g" "${TEMPLATE}" > "${MANIFEST}"

# node_modules is mounted from the host; install only if missing.
if [ ! -x "./node_modules/.bin/graph" ]; then
  echo "[subgraph] installing dependencies..."
  npm install --no-audit --no-fund
fi
GRAPH="./node_modules/.bin/graph"

# Wipe stale codegen/compile artifacts. They live under subgraphs/ (not data/),
# so a `docker compose down`/`rm -rf data` does NOT clear them, and graph-cli can
# otherwise reuse a stale generated/ — silently redeploying an old schema after
# the mappings change.
echo "[subgraph] cleaning generated/ and build/ ..."
rm -rf generated build

echo "[subgraph] codegen + build..."
"${GRAPH}" codegen "${MANIFEST}"
"${GRAPH}" build "${MANIFEST}"

echo "[subgraph] waiting for graph-node admin endpoint at ${GRAPH_NODE} ..."
until "${GRAPH}" create --node "${GRAPH_NODE}" "${SUBGRAPH_NAME}" >/dev/null 2>&1; do
  sleep 3
done

echo "[subgraph] deploying..."
"${GRAPH}" deploy \
  --node "${GRAPH_NODE}" \
  --ipfs "${IPFS_URL}" \
  --version-label "v0.0.1" \
  "${SUBGRAPH_NAME}" "${MANIFEST}"

echo "[subgraph] done. GraphQL: http://localhost:8000/subgraphs/name/${SUBGRAPH_NAME}"
