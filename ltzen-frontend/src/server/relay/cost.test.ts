import { describe, expect, it } from "vitest";
import {
  assertSignedMaxCoversFee,
  computeCostFromInputs,
  RelayCostError,
} from "./cost";
import { ceilDiv, shouldClampToFloor } from "./quote";

describe("ceilDiv", () => {
  it("returns 0 for a=0", () => {
    expect(ceilDiv(0n, 10n)).toBe(0n);
  });
  it("rounds up", () => {
    expect(ceilDiv(10n, 3n)).toBe(4n);
    expect(ceilDiv(9n, 3n)).toBe(3n);
  });
});

describe("shouldClampToFloor", () => {
  it("clamps when deviation exceeds bps", () => {
    // floor=100, live=140, 40% > 30%
    expect(shouldClampToFloor(140n, 100n, 3000n)).toBe(true);
  });
  it("allows within deviation", () => {
    expect(shouldClampToFloor(120n, 100n, 3000n)).toBe(false);
  });
});

describe("computeCostFromInputs", () => {
  const base = {
    // ~450–490 ZEN/ETH (Aerodrome Slipstream / market spot)
    zenPerEth: 450n * 10n ** 18n,
    rateSource: "live" as const,
    rateAsOf: 1_700_000_000,
    effectiveGasPrice: 1_000_000n, // 0.001 gwei — keeps fee under 10 ZEN
    lzNativeWei: 0n,
    bufferBps: 1500n,
    marginBps: 0n,
    profitBps: 0n,
    gasLimit: 350_000,
  };

  it("withdraw kinds return zero fees", () => {
    const r = computeCostFromInputs({
      ...base,
      kind: "withdrawToHorizen",
      basis: 1000n * 10n ** 18n,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.feeZen).toBe(0n);
    expect(r.maxFeeZen).toBe(0n);
  });

  it("computes L3-only fee and buffered max", () => {
    // l3 = 350000 * 1e6 = 3.5e11 wei ETH → fee ≈ 3.5e11 * 450 / 1e18 ZEN
    const basis = 1000n * 10n ** 18n;
    const r = computeCostFromInputs({
      ...base,
      kind: "redeemWithSig",
      basis,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expectedFee = ceilDiv(350_000n * 1_000_000n * base.zenPerEth, 10n ** 18n);
    expect(r.feeZen).toBe(expectedFee);
    expect(r.maxFeeZen).toBe(ceilDiv(expectedFee * 11_500n, 10_000n));
    expect(r.breakdown.lzNativeWei).toBe(0n);
  });

  it("includes lzNativeWei for bridge", () => {
    const basis = 1000n * 10n ** 18n;
    const lz = 10n ** 14n; // 0.0001 ETH
    const r = computeCostFromInputs({
      ...base,
      kind: "bridgeToBase",
      basis,
      lzNativeWei: lz,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.breakdown.lzNativeWei).toBe(lz);
    expect(r.breakdown.ethCostWei).toBe(350_000n * 1_000_000n + lz);
  });

  it("returns fee_hits_cap when cost exceeds 10 ZEN", () => {
    // At ~450 ZEN/ETH, need ~0.023 ETH cost to breach 10 ZEN (e.g. huge LZ pad).
    const r = computeCostFromInputs({
      ...base,
      kind: "bridgeToBase",
      basis: 1000n * 10n ** 18n,
      effectiveGasPrice: 1_000_000n,
      lzNativeWei: 25n * 10n ** 15n, // 0.025 ETH → ~11.25 ZEN
      gasLimit: 350_000,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("fee_hits_cap");
  });

  it("returns amount_too_small when basis cannot cover fee", () => {
    const r = computeCostFromInputs({
      ...base,
      kind: "redeemWithSig",
      basis: 1n, // tiny
      effectiveGasPrice: 1_000_000n,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("amount_too_small");
  });

  it("applies FEE_PROFIT_BPS floor when higher than cost", () => {
    const basis = 1000n * 10n ** 18n;
    const r = computeCostFromInputs({
      ...base,
      kind: "depositWithSig",
      basis,
      profitBps: 50n, // 0.5% = 5 ZEN
      effectiveGasPrice: 1_000n, // tiny cost
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.feeZen).toBe((basis * 50n) / 10_000n);
    expect(r.breakdown.profitBps).toBe(50n);
  });

  it("does not raise fee when cost already exceeds profit floor", () => {
    const basis = 1000n * 10n ** 18n;
    // ~0.01 gwei × 350k × 450 ≈ 0.001575 ZEN; profitBps=1 → 0.1 ZEN floor → need higher gas
    // Use 1 gwei → fee ≈ 0.1575 ZEN > 0.1 ZEN profit floor
    const params = {
      ...base,
      kind: "depositWithSig" as const,
      basis,
      effectiveGasPrice: 1_000_000_000n,
    };
    const rCost = computeCostFromInputs({ ...params, profitBps: 0n });
    const rProfit = computeCostFromInputs({ ...params, profitBps: 1n });
    expect(rCost.ok && rProfit.ok).toBe(true);
    if (!rCost.ok || !rProfit.ok) return;
    expect(rProfit.feeZen).toBe(rCost.feeZen);
    expect(rProfit.feeZen).toBeGreaterThan((basis * 1n) / 10_000n);
  });
});

describe("assertSignedMaxCoversFee (fee_quote_stale)", () => {
  it("passes when signed max equals fee", () => {
    expect(() => assertSignedMaxCoversFee(100n, 100n, 115n)).not.toThrow();
  });

  it("throws fee_quote_stale when signed max is below recomputed fee", () => {
    try {
      assertSignedMaxCoversFee(100n, 99n, 115n);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RelayCostError);
      const e = err as RelayCostError;
      expect(e.code).toBe("fee_quote_stale");
      expect(e.feeZen).toBe("100");
      expect(e.requiredMaxFeeZen).toBe("115");
    }
  });

  it("matches E2E-scale bridge fee under a too-low max", () => {
    const r = computeCostFromInputs({
      kind: "bridgeToBase",
      basis: 20n * 10n ** 18n,
      zenPerEth: 450n * 10n ** 18n,
      rateSource: "live",
      rateAsOf: 1,
      effectiveGasPrice: 2_000_000n,
      lzNativeWei: 30n * 10n ** 12n,
      bufferBps: 1500n,
      gasLimit: 450_000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(() => assertSignedMaxCoversFee(r.feeZen, r.feeZen - 1n, r.maxFeeZen)).toThrow(
      RelayCostError,
    );
  });
});
