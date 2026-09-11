import { describe, it, expect } from "vitest";
import { getLoHiOrder } from "../src/lib/leagueLogic.js";

const ctx = { loHiOverrides: {}, results: {}, handicaps: {}, hcpOverrides: {} };
const T = 7;

describe("getLoHiOrder — precise comparison for new records", () => {
  it("uses the raw snapshot so near-ties resolve on the real numbers", () => {
    // 6.4 vs 6.6 both round to 6; raw must still pick the genuinely lower player.
    expect(getLoHiOrder(T, 3, ctx, null, { [T]: [6.4, 6.6] })).toEqual({ loPi: 0, hiPi: 1 });
    expect(getLoHiOrder(T, 3, ctx, null, { [T]: [6.6, 6.4] })).toEqual({ loPi: 1, hiPi: 0 });
  });

  it("prefers the raw snapshot over the rounded one when both exist", () => {
    // Rounded says tie (p0); raw says p1 is genuinely lower. Raw wins.
    const order = getLoHiOrder(T, 3, ctx, { [T]: [6, 6] }, { [T]: [6.6, 6.4] });
    expect(order).toEqual({ loPi: 1, hiPi: 0 });
  });

  it("falls to roster order (p0) on a genuine tie", () => {
    expect(getLoHiOrder(T, 3, ctx, null, { [T]: [8, 8] })).toEqual({ loPi: 0, hiPi: 1 });
  });

  it("accepts string-keyed snapshots (Firestore round-trips object keys)", () => {
    expect(getLoHiOrder(T, 3, ctx, null, { [String(T)]: [9.1, 4.2] })).toEqual({ loPi: 1, hiPi: 0 });
  });
});

describe("getLoHiOrder — archived seasons keep their pairings", () => {
  it("compares the legacy rounded snapshot as-is, ties to p0", () => {
    // No raw snapshot: a 2026-era record. 6.4/6.6 were stored as 6/6, and this
    // must stay a p0 tie or settled standings would silently change.
    expect(getLoHiOrder(T, 3, ctx, { [T]: [6, 6] }, null)).toEqual({ loPi: 0, hiPi: 1 });
  });

  it("still honors a clear rounded difference", () => {
    expect(getLoHiOrder(T, 3, ctx, { [T]: [11, 4] }, null)).toEqual({ loPi: 1, hiPi: 0 });
  });
});

describe("getLoHiOrder — admin override", () => {
  it("beats both snapshots", () => {
    const withOv = { ...ctx, loHiOverrides: { [`${T}-3`]: 1 } };
    expect(getLoHiOrder(T, 3, withOv, { [T]: [2, 20] }, { [T]: [2.1, 20.5] })).toEqual({ loPi: 1, hiPi: 0 });
  });

  it("applies only to the week it was set for", () => {
    const withOv = { ...ctx, loHiOverrides: { [`${T}-3`]: 1 } };
    expect(getLoHiOrder(T, 4, withOv, null, { [T]: [2, 20] })).toEqual({ loPi: 0, hiPi: 1 });
  });
});
