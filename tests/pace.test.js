import { describe, it, expect } from "vitest";
import { calcPace } from "../src/lib/leagueLogic.js";

// Groups tee one slot apart in pairs order, so a group N slots ahead should be
// roughly N holes further along.
const WEEK = 1;
const schedule = { [WEEK]: { week: WEEK, pairs: [[1, 2], [3, 4], [5, 6], [7, 8]] } };

// Build a week where each group is `thru` holes in.
function build(thrus) {
  const results = { [WEEK]: {} };
  schedule[WEEK].pairs.forEach(([a, b], i) => {
    const t = thrus[i];
    if (t === null) return; // no record at all
    const holes = (n) => Array.from({ length: 9 }, (_, h) => (h < n ? 5 : 0));
    results[WEEK][`${WEEK}-${a}-${b}`] = {
      t1scores: [holes(t), holes(t)],
      t2scores: [holes(t), holes(t)],
      t1types: ["normal", "normal"], t2types: ["normal", "normal"],
    };
  });
  return results;
}

describe("calcPace — comparing to the group ahead", () => {
  it("is level when the gap matches the slot separation", () => {
    // Group 1 (slot 0) thru 5, me (slot 1) thru 4 — exactly one hole apart.
    const p = calcPace(WEEK, build([5, 4, 3, 2]), schedule, 3);
    expect(p.basis).toBe("ahead");
    expect(p.behind).toBe(0);
  });

  it("reports a hole behind when a gap opens", () => {
    const p = calcPace(WEEK, build([6, 4, 3, 2]), schedule, 3);
    expect(p.behind).toBe(1);
  });

  it("reports ahead of pace as a negative", () => {
    const p = calcPace(WEEK, build([5, 5, 3, 2]), schedule, 3);
    expect(p.behind).toBe(-1);
  });

  it("accounts for slots when the immediate group ahead has no scores", () => {
    // Slot 0 thru 6, slot 1 blank, me at slot 2 thru 4. Two slots back, so on
    // pace would be 4 — level, not two behind.
    const p = calcPace(WEEK, build([6, 0, 4, 2]), schedule, 5);
    expect(p.basis).toBe("ahead");
    expect(p.behind).toBe(0);
  });
});

describe("calcPace — field fallback", () => {
  it("uses the field when nobody ahead has scores", () => {
    // I'm first out, so there is no group ahead at all.
    const p = calcPace(WEEK, build([4, 5, 5, 5]), schedule, 1);
    expect(p.basis).toBe("field");
  });

  it("counts a following group catching up as being behind", () => {
    // Me first out thru 4; the group one slot later is also thru 4, so they've
    // closed the hole of separation they should be giving up.
    const p = calcPace(WEEK, build([4, 4, 4, 4]), schedule, 1);
    expect(p.basis).toBe("field");
    expect(p.behind).toBeGreaterThan(0);
  });
});

describe("calcPace — stays silent when it doesn't know", () => {
  it("says nothing before my group has started", () => {
    expect(calcPace(WEEK, build([5, 0, 3, 2]), schedule, 3)).toBeNull();
  });

  it("says nothing when no other group has scores", () => {
    expect(calcPace(WEEK, build([0, 4, 0, 0]), schedule, 3)).toBeNull();
  });

  it("says nothing for a team not playing, a missing week, or no team", () => {
    expect(calcPace(WEEK, build([5, 4, 3, 2]), schedule, 99)).toBeNull();
    expect(calcPace(99, build([5, 4, 3, 2]), schedule, 3)).toBeNull();
    expect(calcPace(WEEK, build([5, 4, 3, 2]), schedule, null)).toBeNull();
  });

  it("handles a group with a record but no holes played", () => {
    expect(calcPace(WEEK, build([null, 4, null, null]), schedule, 3)).toBeNull();
  });
});
