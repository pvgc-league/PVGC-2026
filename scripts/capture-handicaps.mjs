/**
 * capture-handicaps.mjs — Derive next season's starting handicaps from a finished
 * season, using the app's own handicap engine (no reimplementation).
 *
 * Usage:
 *   npm run capture-hcp -- 2026
 *
 * Reads archives/league-<year>.json (produce it first with archive-season.cjs).
 * Prints a DEFAULT_HCP block to paste into the new season's constants file.
 *
 * WHY WEEK 19: getEffectiveHcp is asked for week 19, which is the handicap a player
 * carried INTO the Quarterfinals — i.e. computed from weeks 1-18 inclusive
 * (buildGrossHistory loops `w < upToWeek`). Week 18 is the Knockdown, the last week
 * all 18 teams play. Capturing any later would advance only the 8 players still in
 * the playoffs and leave the other 28 stale. This is deliberate, not an off-by-one.
 */
import fs from "fs";
import { getEffectiveHcp } from "../src/lib/leagueLogic.js";
import { TEAMS } from "../src/constants/league.js";

const year = parseInt(process.argv[2], 10) || 2026;
const file = `archives/league-${year}.json`;

if (!fs.existsSync(file)) {
  console.error(`✗ ${file} not found — run: node scripts/archive-season.cjs ${year}`);
  process.exit(1);
}

const A = JSON.parse(fs.readFileSync(file, "utf8"));
const L = A.league || {};
const unflat = s => Array.isArray(s) ? s : (s ? [s.p0 || [], s.p1 || []] : [[], []]);

// Rebuild results from the archived weekScores (the authoritative source)
const results = {};
for (const [id, raw] of Object.entries(A.weekScores || {})) {
  const idx = id.indexOf("_");
  const week = parseInt(raw.week ?? id.slice(0, idx), 10);
  const mk = raw.matchKey ?? id.slice(idx + 1);
  if (!week || !mk) continue;
  (results[week] ||= {})[mk] = { ...raw, t1scores: unflat(raw.t1scores), t2scores: unflat(raw.t2scores) };
}

const handicaps = L.handicaps || {};
const overrides = L.hcpOverrides || {};
const cancelled = new Set(L.cancelledWeeks || []);

const at = (tid, pi, week) =>
  getEffectiveHcp(tid, pi, week, results, handicaps, overrides, cancelled);

const rows = [];
const next = {};
for (let t = 1; t <= 18; t++) {
  const pair = [];
  for (const pi of [0, 1]) {
    const start = (handicaps[t] || [])[pi];
    const thruW17 = at(t, pi, 18); // weeks 1-17
    const thruW18 = at(t, pi, 19); // weeks 1-18  ← captured
    pair.push(thruW18);
    rows.push({
      t, pi,
      name: pi === 0 ? TEAMS[t]?.p1 : TEAMS[t]?.p2,
      start, thruW17, thruW18,
      moved: thruW18 - start,
    });
  }
  next[t] = pair;
}

console.log(`\nStarting handicaps for the season after ${year}`);
console.log(`Captured through Week 18 (the Knockdown — last week all 18 teams play)\n`);
console.log("T   Player                  " + year + " start   thru W17   thru W18   change");
console.log("─".repeat(76));
for (const r of rows) {
  const chg = r.moved === 0 ? "  —" : (r.moved > 0 ? `  +${r.moved}` : `  ${r.moved}`);
  const flag = r.thruW17 !== r.thruW18 ? "  *" : "";
  console.log(
    `${String(r.t).padEnd(3)} ${String(r.name).padEnd(22)} ` +
    `${String(r.start).padStart(8)}   ${String(r.thruW17).padStart(8)}   ` +
    `${String(r.thruW18).padStart(8)}   ${chg.padStart(6)}${flag}`
  );
}
console.log("─".repeat(76));
console.log("* week 18's round changed this player's handicap\n");

console.log("Paste into the new season's constants file:\n");
console.log("const DEFAULT_HCP = {");
for (let t = 1; t <= 18; t++) {
  const [a, b] = next[t];
  const key = `${t}:`.padEnd(4);
  const val = `[${a},${b}],`.padEnd(10);
  console.log(`  ${key}${val} // ${TEAMS[t]?.p1}, ${TEAMS[t]?.p2}`);
}
console.log("};\n");

// Values needing a human call before they become next season's seed
const odd = rows.filter(r => r.thruW18 < 0 || r.thruW18 > 24);
if (odd.length) {
  console.log("⚠  Review before using — outside the usual range:");
  for (const r of odd) {
    console.log(`   ${r.name} (T${r.t}): ${r.thruW18}` +
      (r.thruW18 < 0 ? "  — plus handicap; hcpStr() clamps strokes to 0, but a negative seed also lowers next season's HCP_CAP ceiling" : "  — very high; confirm it's real"));
  }
  console.log("");
}

console.log("Reminder: NEW_MEMBERS is a separate judgement call — a player flagged new");
console.log(`for ${year} is no longer new next season unless they sat out.\n`);
