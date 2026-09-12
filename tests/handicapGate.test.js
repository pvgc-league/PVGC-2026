import { describe, it, expect } from "vitest";
import { getEffectiveHcp } from "../src/lib/leagueLogic.js";

// Guards a decision that was made, reversed, and is easy to re-introduce by
// mistake: handicaps count EVERY scored round, confirmed or not.
//
// Gating on confirmation was tried on 2026-09-12 and reverted. Of the 10
// unconfirmed matches in the 2026 season, seven were complete rounds — all four
// players, all nine holes — that simply never got a confirmation tap. Excluding
// them raised two players' starting handicaps for an administrative omission
// rather than a score that was genuinely still in flux. The three remaining were
// in a rained-out week, which is excluded anyway.
const WEEK = 1;
const startHcp = { 1: [10, 10], 2: [10, 10] };

function results({ locked }) {
  const holes = (n) => Array(9).fill(n);
  return {
    [WEEK]: {
      [`${WEEK}-1-2`]: {
        locked,
        t1scores: [holes(4), holes(4)],
        t2scores: [holes(6), holes(6)],
        t1types: ["normal", "normal"], t2types: ["normal", "normal"],
      },
    },
  };
}
const hcpAfter = (locked) =>
  getEffectiveHcp(1, 0, WEEK + 1, results({ locked }), startHcp, {}, null, startHcp, () => false);

describe("handicaps count every scored round", () => {
  it("counts a confirmed round", () => {
    expect(hcpAfter(true)).toBeLessThan(10);
  });

  it("counts an unconfirmed round the same way", () => {
    expect(hcpAfter(false)).toBeLessThan(10);
  });

  it("gives the identical handicap either way — confirmation is not a gate", () => {
    expect(hcpAfter(false)).toBe(hcpAfter(true));
  });

  it("is unaffected by the locked flag being absent entirely", () => {
    const r = results({ locked: true });
    delete r[WEEK][`${WEEK}-1-2`].locked;
    expect(getEffectiveHcp(1, 0, WEEK + 1, r, startHcp, {}, null, startHcp, () => false)).toBe(hcpAfter(true));
  });
});

// The bug this actually guards against. calcAutoHcp averages gross against par 36,
// so a part-entered card reads as an extraordinary round: four holes total about 18
// and 0.9 * (18 - 36) lands near -16. Entering scores hole by hole is normal, so
// without this every handicap collapses while a week is in progress. Reported from
// 2027 testing as "our handicaps for next week are -22".
describe("only complete rounds count toward handicaps", () => {
  const start = { 1: [5, 5], 2: [10, 10] };
  const partial = (n) => Array.from({ length: 9 }, (_, h) => (h < n ? 5 : 0));
  const withHoles = (n, extra = {}) => ({
    1: { "1-1-2": {
      t1scores: [partial(n), partial(n)], t2scores: [partial(n), partial(n)],
      t1types: ["normal", "normal"], t2types: ["normal", "normal"],
      hcpSnapshot: { 1: [5, 5], 2: [10, 10] }, ...extra,
    } },
  });
  const hcp = (res) => getEffectiveHcp(1, 0, 2, res, start, {}, null, start, () => false);

  it.each([1, 3, 4, 8])("ignores a round with only %i holes entered", (n) => {
    expect(hcp(withHoles(n))).toBe(5); // unchanged from the starting handicap
  });

  it("never produces a negative handicap from a part-entered card", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(hcp(withHoles(n)), `${n} holes`).toBeGreaterThanOrEqual(0);
    }
  });

  it("counts the round once all nine holes are in", () => {
    expect(hcp(withHoles(9))).not.toBe(5);
  });

  it("still counts a rainout round, where unplayed holes are substituted", () => {
    // Six holes played; RAINOUT_SUB fills 7-9 from earlier holes, so it reaches nine.
    expect(hcp(withHoles(6, { rainout: true }))).not.toBe(5);
  });
});
