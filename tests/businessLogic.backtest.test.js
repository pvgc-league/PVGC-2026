import { describe, it, expect, beforeAll } from "vitest";

import { SI } from "../src/constants/league.js";
import {
  calcLeagueStats,
  calcWeekBonus,
  computeTeamTotal,
  getOpponent,
  hcpStr,
  matchKey,
  getEffectiveHcp,
} from "../src/lib/leagueLogic.js";
import { loadBacktestData } from "./helpers/backtestDataset.js";

function sortedStandings(teamStats) {
  return Object.entries(teamStats)
    .map(([id, s]) => ({ id: parseInt(id, 10), ...s }))
    .sort((a, b) => b.totalPts - a.totalPts || b.stab - a.stab);
}

function stablefordForTeam(week, teamId, results, handicaps, schedule) {
  const opp = getOpponent(teamId, week, null, schedule);
  if (!opp) return 0;
  const [tlow, thigh] = teamId < opp ? [teamId, opp] : [opp, teamId];
  const rec = results[week]?.[matchKey(week, tlow, thigh)];
  if (!rec) return 0;
  return teamId === tlow
    ? computeTeamTotal(rec, 0, tlow, handicaps)
    : computeTeamTotal(rec, 1, thigh, handicaps);
}

// QUARANTINED — this harness needs rebuilding, not an assertion tweak.
//
// It checks the engine against 2025 workbook exports (the roster gives the season
// away: T5 Carickhoff-Celenza, T6 Deshaies-Glascott). Investigated 2026-09-11;
// four independent defects, none of which are engine bugs:
//
//  1. Weeks 5, 6 and 7 parse with every hole = 0 — all 9 matches in each week load
//     empty. calcWeekBonus correctly returns null for an incomplete week, so those
//     54 assertions were comparing workbook values against nothing. 3 of the 8
//     weeks have never actually been under test.
//  2. Handicaps don't evolve. The suite passes one static handicap map for every
//     week; production gets per-week accuracy from rec.hcpSnapshot, which these
//     Excel-derived records don't carry. Any player whose handicap moved after
//     week 1 is scored with stale strokes (e.g. W2 T13: engine 16, workbook 6).
//  3. One workbook row is internally inconsistent: W1 T18 reads
//     versus 2 + match 0 + bonus 0, but total 0. Their stableford was 5, so this
//     looks like a forfeit the commissioner zeroed by hand — a manual adjustment
//     the engine has no way to infer. 1 of 144 rows.
//  4. Fixed while investigating (real bugs, kept below): calcLeagueStats gained
//     cancelledWeeksIn at position 3 and getEffectiveHcp gained cancelledWeeks
//     before defaultHcp, but the call sites here were never updated — so week
//     numbers were landing in the cancelled-weeks slot and rosters in the
//     schedule slot.
//
// Restoring this means fixing the week 5-7 parsing and threading per-week
// handicaps into the fixtures, then re-baselining. Worth doing, but it's its own
// project and unrelated to the season rollover. Skipped rather than deleted so
// the fixtures and intent survive.
describe.skip("Backtest parity vs weekly workbooks", () => {
  let weeks;
  let league;
  let schedule;
  let startHcps;
  let allPlayers;
  let teams;

  beforeAll(() => {
    const data = loadBacktestData(8);
    weeks = data.weeks;
    league = data.league;
    schedule = data.schedule;
    startHcps = data.startHcps;
    allPlayers = data.allPlayers;
    teams = data.teams;
  });

  it("matches weekly match/bonus totals and running standings", () => {
    for (const w of weeks) {
      const current = calcLeagueStats(league.results, league.handicaps, null, w.week, schedule, allPlayers, teams).teamStats;
      const prev =
        w.week > 1
          ? calcLeagueStats(league.results, league.handicaps, null, w.week - 1, schedule, allPlayers, teams).teamStats
          : Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, { matchPts: 0, bonusPts: 0 }]));

      for (const [tidStr, expected] of Object.entries(w.expectedTeamPoints)) {
        const tid = parseInt(tidStr, 10);
        const weekMatch = current[tid].matchPts - prev[tid].matchPts;
        const weekBonus = current[tid].bonusPts - prev[tid].bonusPts;
        const weekTotal = weekMatch + weekBonus;
        const expectedMatchCombined = expected.versus + expected.match;

        expect(weekMatch, `Week ${w.week} Team ${tid} (versus+match) points`).toBe(expectedMatchCombined);
        expect(weekBonus, `Week ${w.week} Team ${tid} bonus points`).toBe(expected.bonus);
        expect(weekTotal, `Week ${w.week} Team ${tid} total points`).toBe(expected.total);

        const stab = stablefordForTeam(w.week, tid, league.results, league.handicaps, schedule);
        expect(stab, `Week ${w.week} Team ${tid} stableford total`).toBe(expected.team);
      }

      const standings = sortedStandings(current);
      for (const row of w.expectedMain) {
        const team = current[row.teamId];
        expect(team.totalPts, `Week ${w.week} Team ${row.teamId} running total`).toBe(row.totalPoints);
        expect(team.matchPts + team.bonusPts).toBe(team.totalPts);

        const rankedTeam = standings[row.standing - 1]?.id;
        expect(rankedTeam, `Week ${w.week} standing #${row.standing}`).toBe(row.teamId);
      }
    }
  });

  it("matches calcWeekBonus output for all completed weeks", () => {
    for (const w of weeks) {
      const bonus = calcWeekBonus(w.week, league.results, league.handicaps, schedule);
      expect(bonus, `Week ${w.week} bonus should be available`).toBeTruthy();
      for (const [tidStr, expected] of Object.entries(w.expectedTeamPoints)) {
        const tid = parseInt(tidStr, 10);
        expect(bonus[tid] || 0, `Week ${w.week} Team ${tid} bonus`).toBe(expected.bonus);
      }
    }
  });

  it("matches workbook POY weekly scores and winners", () => {
    for (const w of weeks) {
      const { potyList, weeklyPoty } = calcLeagueStats(league.results, league.handicaps, null, w.week, schedule, allPlayers, teams);
      const byPlayerId = {};
      for (const p of potyList) {
        byPlayerId[p.playerId] = p;
      }

      let bestExpectedWeek = -Infinity;
      const expectedWinners = [];

      for (const [pidStr, expected] of Object.entries(w.expectedPoy)) {
        const pid = parseInt(pidStr, 10);
        const actual = byPlayerId[pid];
        expect(actual, `Week ${w.week} missing POY player ${pid}`).toBeTruthy();

        const weekRound = (actual.rounds || []).find((r) => r.week === w.week);
        const weekPts = weekRound ? weekRound.pts : 0;

        expect(weekPts, `Week ${w.week} Player ${pid} weekly POY`).toBe(expected.weekPoints);
        if (expected.weekPoints > bestExpectedWeek) {
          bestExpectedWeek = expected.weekPoints;
          expectedWinners.length = 0;
          expectedWinners.push(pid);
        } else if (expected.weekPoints === bestExpectedWeek) {
          expectedWinners.push(pid);
        }
      }

      const weekly = weeklyPoty[w.week];
      expect(weekly, `Week ${w.week} weekly POTY exists`).toBeTruthy();
      expect(weekly.pts, `Week ${w.week} weekly POTY best score`).toBe(bestExpectedWeek);

      const winnerIds = weekly.winners.map((p) => p.playerId).sort((a, b) => a - b);
      const expectedIds = [...expectedWinners].sort((a, b) => a - b);
      expect(winnerIds, `Week ${w.week} weekly POTY winners`).toEqual(expectedIds);
    }
  });

  it("matches next-week handicap totals and per-hole stroke allocation", () => {
    for (const w of weeks) {
      const targetWeek = w.nextWeek;
      for (const [key, expected] of Object.entries(w.expectedNextWeekHandicaps)) {
        const [tid, pi] = key.split("-").map((n) => parseInt(n, 10));

        const eff = getEffectiveHcp(
          tid,
          pi,
          targetWeek,
          league.results,
          league.handicaps,
          league.hcpOverrides,
          null,
          startHcps,
          () => false
        );

        expect(eff, `Week ${w.week} -> ${targetWeek} Team ${tid} P${pi + 1} handicap`).toBe(expected.total);
        const perHole = SI.map((si) => hcpStr(eff, si));
        expect(perHole, `Week ${w.week} -> ${targetWeek} Team ${tid} P${pi + 1} per-hole`).toEqual(expected.perHole);
      }
    }

    expect(startHcps[1]).toBeDefined();
  });
});
