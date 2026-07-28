import { describe, expect, it } from "vitest";
import { amount1PerAmount0FromSqrtPriceX96, ceilDiv, shouldClampToFloor } from "./quote";

describe("amount1PerAmount0FromSqrtPriceX96", () => {
  it("matches live Slipstream ZEN/WETH mid (~489 ZEN per ETH)", () => {
    // slot0.sqrtPriceX96 from pool 0x0392…852d (token0=WETH, token1=ZEN), sampled 2026-07-29
    const sqrtPriceX96 = 1752566021221703269167440483322n;
    const zenPerEth = amount1PerAmount0FromSqrtPriceX96(sqrtPriceX96);
    expect(zenPerEth).toBeGreaterThan(480n * 10n ** 18n);
    expect(zenPerEth).toBeLessThan(500n * 10n ** 18n);
  });

  it("rejects zero", () => {
    expect(() => amount1PerAmount0FromSqrtPriceX96(0n)).toThrow();
  });
});

describe("ceilDiv / shouldClampToFloor (quote helpers)", () => {
  it("ceilDiv rounds up", () => {
    expect(ceilDiv(10n, 3n)).toBe(4n);
  });
  it("clamp at 30%", () => {
    expect(shouldClampToFloor(140n, 100n, 3000n)).toBe(true);
    expect(shouldClampToFloor(120n, 100n, 3000n)).toBe(false);
  });
});
