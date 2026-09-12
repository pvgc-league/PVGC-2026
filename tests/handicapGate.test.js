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
