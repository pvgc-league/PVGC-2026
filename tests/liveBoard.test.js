import { describe, it, expect } from "vitest";
import { calcWeekBonus, calcLiveBoard, describeBonusPosition, teamThruHoles } from "../src/lib/leagueLogic.js";
import { SCHEDULE } from "../src/constants/league.js";
import { loadArchiveFixture } from "./helpers/archiveFixture.js";

const { league } = loadArchiveFixture(17);
const H = league.handicaps;

describe("calcLiveBoard — agrees with the official bonus once a week is done", () => {
  // The load-bearing invariant: the "as it stands" board must not invent a
  // different answer from calcWeekBonus, or players would see one number on the
  // course and another afterwards.
  const completeWeeks = [1, 2, 3, 4, 5];

  it.each(completeWeeks)("week %i matches calcWeekBonus exactly", (w) => {
    const official = calcWeekBonus(w, league.results, H, SCHEDULE);
    const board = calcLiveBoard(w, league.results, H, SCHEDULE);
    expect(official, `week ${w} should be complete in the archive`).toBeTruthy();
    expect(board.allComplete).toBe(true);
    for (const row of board.rows) {
      expect(row.bonus, `team ${row.tid} week ${w}`).toBe(official[row.tid]);
    }
  });

  it("ranks all 18 teams, best first", () => {
    const board = calcLiveBoard(1, league.results, H, SCHEDULE);
    expect(board.rows).toHaveLength(18);
    expect(board.rows[0].rank).toBe(1);
    for (let i = 1; i < board.rows.length; i++) {
      expect(board.rows[i].total).toBeLessThanOrEqual(board.rows[i - 1].total);
    }
  });

  it("gives teams on the same total the same bonus", () => {
    const board = calcLiveBoard(1, league.results, H, SCHEDULE);
    const byTotal = {};
    for (const r of board.rows) (byTotal[r.total] ||= []).push(r.bonus);
    for (const [total, bonuses] of Object.entries(byTotal)) {
      expect(new Set(bonuses).size, `total ${total} split across buckets`).toBe(1);
    }
  });

  it("returns null for a week with no pairings (playoff weeks)", () => {
    expect(calcLiveBoard(19, league.results, H, SCHEDULE)).toBeNull();
  });
});

describe("calcLiveBoard — mid-round, where calcWeekBonus refuses", () => {
  // A week where only some matches have scores. calcWeekBonus returns null here
  // by design; the whole point of the live board is to still say something.
  const oneMatch = Object.keys(league.results[1])[0];
  const results = { 1: { [oneMatch]: league.results[1][oneMatch] } };

  it("still produces a board when calcWeekBonus gives up", () => {
    expect(calcWeekBonus(1, results, H, SCHEDULE)).toBeNull();
    const board = calcLiveBoard(1, results, H, SCHEDULE);
    expect(board).toBeTruthy();
    expect(board.allComplete).toBe(false);
    expect(board.rows).toHaveLength(18);
  });

  it("flags that the week is unfinished so the UI can caveat it", () => {
    expect(calcLiveBoard(1, results, H, SCHEDULE).allComplete).toBe(false);
    expect(calcLiveBoard(1, league.results, H, SCHEDULE).allComplete).toBe(true);
  });
});

describe("teamThruHoles", () => {
  it("counts to the furthest hole either player has played", () => {
    expect(teamThruHoles({ t1scores: [[4, 5, 3, 0, 0, 0, 0, 0, 0], [5, 4, 0, 0, 0, 0, 0, 0, 0]] }, 0)).toBe(3);
    expect(teamThruHoles({ t1scores: { p0: [4, 5], p1: [5, 4, 6] } }, 0)).toBe(3); // Firestore shape
  });

  it("is 0 for a missing or empty record", () => {
    expect(teamThruHoles(null, 0)).toBe(0);
    expect(teamThruHoles({ t1scores: [[], []] }, 0)).toBe(0);
  });
});

describe("describeBonusPosition", () => {
  const board = calcLiveBoard(1, league.results, H, SCHEDULE);

  it("reports rank, field size and current bonus", () => {
    const top = board.rows[0];
    const d = describeBonusPosition(board, top.tid);
    expect(d.rank).toBe(1);
    expect(d.of).toBe(18);
    expect(d.bonus).toBe(8);
  });

  it("has no tier above it for a leader", () => {
    const d = describeBonusPosition(board, board.rows[0].tid);
    expect(d.nextBonus).toBeNull();
    expect(d.gap).toBe(0);
  });

  it("reports the gap to the next tier up for everyone else", () => {
    const last = board.rows[board.rows.length - 1];
    const d = describeBonusPosition(board, last.tid);
    expect(d.nextBonus).toBeGreaterThan(d.bonus);
    expect(d.gap).toBeGreaterThanOrEqual(0);
  });

  it("returns null for a team not playing that week", () => {
    expect(describeBonusPosition(board, 999)).toBeNull();
    expect(describeBonusPosition(null, 1)).toBeNull();
  });
});
