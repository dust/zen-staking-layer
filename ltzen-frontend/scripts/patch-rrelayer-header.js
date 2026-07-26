/**
 * rrelayer@1.2.0 TS SDK sends `x-api-key`, but the server expects `x-rrelayer-api-key`
 * (see https://rrelayer.xyz/integration/api/authentication). Without this, BFF gets 401
 * while `curl -H "x-rrelayer-api-key: …"` returns 200.
 */
const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "rrelayer",
  "dist",
  "api",
  "axios-wrapper.js",
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

const before = fs.readFileSync(target, "utf8");
if (before.includes("'x-rrelayer-api-key'")) {
  process.exit(0);
}
if (!before.includes("'x-api-key'")) {
  console.warn("[patch-rrelayer-header] unexpected axios-wrapper.js — skip");
  process.exit(0);
}

fs.writeFileSync(target, before.replaceAll("'x-api-key'", "'x-rrelayer-api-key'"));
console.log("[patch-rrelayer-header] rrelayer axios-wrapper → x-rrelayer-api-key");
