import { describe, it, expect } from "vitest";
import * as L2026 from "../src/constants/league_2026.js";
import * as L2027 from "../src/constants/league_2027.js";

const SEASONS = { 2026: L2026, 2027: L2027 };
const N_TEAMS = 18;
const REGULAR_WEEKS = 17;

// Guards the March tee-time pass: reordering the 9 pairs within a week changes who
// tees off when, and it's easy to drop or duplicate a team while shuffling. Order
// is deliberately NOT asserted — only that each week is a valid set of matches.
describe.each(Object.entries(SEASONS))("%s schedule", (year, L) => {
  const regular = L.SCHEDULE_RAW
    .map(([week, date, ...pairs]) => ({ week, date, pairs: pairs.filter(Array.isArray) }))
    .filter(w => w.pairs.length > 0);

  it(`has ${REGULAR_WEEKS} regular-season weeks`, () => {
    expect(regular).toHaveLength(REGULAR_WEEKS);
  });

  it("plays every team exactly once a week", () => {
    for (const w of regular) {
      expect(w.pairs, `week ${w.week} match count`).toHaveLength(N_TEAMS / 2);
      const seen = w.pairs.flat();
      expect(new Set(seen).size, `week ${w.week} has a team twice or missing`).toBe(N_TEAMS);
      for (const t of seen) expect(t, `week ${w.week} team id`).toBeGreaterThanOrEqual(1);
      for (const t of seen) expect(t, `week ${w.week} team id`).toBeLessThanOrEqual(N_TEAMS);
    }
  });

  it("never repeats a pairing", () => {
    const seen = new Map();
    for (const w of regular) {
      for (const [a, b] of w.pairs) {
        const k = `${Math.min(a, b)}-${Math.max(a, b)}`;
        expect(seen.has(k), `${k} repeats in weeks ${seen.get(k)} and ${w.week}`).toBe(false);
        seen.set(k, w.week);
      }
    }
    // A complete single round-robin uses all 153 pairings.
    expect(seen.size).toBe((N_TEAMS * (N_TEAMS - 1)) / 2);
  });

  it("plays on Wednesdays, in order", () => {
    const all = L.SCHEDULE_RAW.map(([week, date]) => ({ week, date }));
    let prev = null;
    for (const { week, date } of all) {
      expect(new Date(date + "T12:00:00Z").getUTCDay(), `week ${week} (${date}) is not a Wednesday`).toBe(3);
      if (prev) expect(new Date(date) > new Date(prev), `week ${week} is out of order`).toBe(true);
      prev = date;
    }
  });

  it("leaves weeks 18-21 unpaired for the seed-based playoffs", () => {
    for (const [week, , ...pairs] of L.SCHEDULE_RAW) {
      if (week >= 18) expect(pairs.filter(Array.isArray), `week ${week}`).toHaveLength(0);
    }
  });

  it("has a starting handicap for all 18 teams", () => {
    expect(Object.keys(L.DEFAULT_HCP)).toHaveLength(N_TEAMS);
    for (let t = 1; t <= N_TEAMS; t++) {
      expect(L.DEFAULT_HCP[t], `team ${t}`).toHaveLength(2);
    }
  });

  it("has 18 teams with both players named", () => {
    expect(Object.keys(L.TEAMS)).toHaveLength(N_TEAMS);
    for (let t = 1; t <= N_TEAMS; t++) {
      expect(L.TEAMS[t]?.p1, `team ${t} p1`).toBeTruthy();
      expect(L.TEAMS[t]?.p2, `team ${t} p2`).toBeTruthy();
    }
  });
});
