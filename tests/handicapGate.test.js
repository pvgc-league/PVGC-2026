import { describe, it, expect } from "vitest";
import { getEffectiveHcp } from "../src/lib/leagueLogic.js";

// A round only counts toward handicaps once both teams have confirmed it
// (confirmMatch sets `locked` when the second confirmation lands). Scores stay
// editable until then, so counting them early moves handicaps on unsettled numbers.
const WEEK = 1;
const startHcp = { 1: [10, 10], 2: [10, 10] };

function results({ locked }) {
  const holes = (n) => Array(9).fill(n);
  return {
    [WEEK]: {
      [`${WEEK}-1-2`]: {
        locked,
        t1scores: [holes(4), holes(4)],   // well under their start handicap
        t2scores: [holes(6), holes(6)],
        t1types: ["normal", "normal"], t2types: ["normal", "normal"],
      },
    },
  };
}

const hcpAfter = (locked) =>
  getEffectiveHcp(1, 0, WEEK + 1, results({ locked }), startHcp, {}, null, startHcp, () => false);

describe("handicaps only count confirmed rounds", () => {
  it("counts a round once both teams have confirmed", () => {
    // 36 gross against a start of 10 should pull the handicap well down.
    expect(hcpAfter(true)).toBeLessThan(10);
  });

  it("ignores the same round while it is unconfirmed", () => {
    expect(hcpAfter(false)).toBe(10); // unchanged from the starting handicap
  });

  it("treats a missing locked flag as unconfirmed", () => {
    const r = results({ locked: true });
    delete r[WEEK][`${WEEK}-1-2`].locked;
    expect(getEffectiveHcp(1, 0, WEEK + 1, r, startHcp, {}, null, startHcp, () => false)).toBe(10);
  });

  it("confirming changes the handicap, which is the whole point", () => {
    expect(hcpAfter(true)).not.toBe(hcpAfter(false));
  });
});
