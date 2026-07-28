/**
 * One-shot S7 fee calibration against live Base FX + Horizen bridge.
 * Usage (from ltzen-frontend): npx tsx scripts/calibrate-fee.ts
 * Loads .env.local via process env (source beforehand or use dotenv if present).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i);
    let v = t.slice(i + 1);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const { clearZenEthQuoteCache, getZenEthQuote } = await import("../src/server/relay/quote");
  const { computeRelayCost, serializeCostQuote } = await import("../src/server/relay/cost");

  clearZenEthQuoteCache();
  const fx = await getZenEthQuote({ bypassCache: true });
  const zenPerEthHuman = Number(fx.zenPerEth) / 1e18;
  console.log("FX", {
    zenPerEth: fx.zenPerEth.toString(),
    zenPerEthHuman: zenPerEthHuman.toFixed(4),
    rateSource: fx.rateSource,
    providerId: fx.providerId,
  });

  const amount = 10n ** 18n;
  const dest = "0x0000000000000000000000000000000000000001" as const;

  for (const kind of ["redeemWithSig", "depositWithSig", "bridgeToBase"] as const) {
    const cost = await computeRelayCost({
      kind,
      basis: amount,
      amount,
      dest: kind === "bridgeToBase" ? dest : undefined,
    });
    const s = serializeCostQuote(cost, 0);
    const feeHuman = Number(cost.feeZen) / 1e18;
    const maxHuman = Number(cost.maxFeeZen) / 1e18;
    const lzEth = Number(cost.breakdown.lzNativeWei) / 1e18;
    console.log(`\n=== ${kind} ===`);
    console.log({
      feeZen: feeHuman,
      maxFeeZen: maxHuman,
      lzNativeEth: lzEth,
      effectiveGasPriceWei: cost.breakdown.effectiveGasPrice.toString(),
      gasLimit: cost.breakdown.gasLimit,
      rateSource: cost.breakdown.rateSource,
    });
    console.log(JSON.stringify(s.breakdown));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
