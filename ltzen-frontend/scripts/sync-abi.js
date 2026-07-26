#!/usr/bin/env node
/**
 * Sync StLighter / LtZEN / InboundStation / EgressStation / ZenOftStationBridge ABIs
 * from the repo root `abi/` into `src/abi/`.
 * Run after the contracts repo regenerates ABIs (see ../abi/README.md).
 *   npm run sync-abi
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..", "abi");
const dest = path.resolve(__dirname, "..", "src", "abi");

const files = [
  "StLighter.json",
  "LtZEN.json",
  "InboundStation.json",
  "EgressStation.json",
  "ZenOftStationBridge.json",
];

fs.mkdirSync(dest, { recursive: true });
for (const f of files) {
  const src = path.join(root, f);
  const out = path.join(dest, f);
  const json = JSON.parse(fs.readFileSync(src, "utf8"));
  if (!Array.isArray(json)) {
    throw new Error(`${f} is not a plain ABI array — aborting`);
  }
  fs.writeFileSync(out, JSON.stringify(json, null, 2) + "\n");
  console.log(`synced ${f} (${json.length} entries)`);
}
