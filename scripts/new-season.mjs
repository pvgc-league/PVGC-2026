/**
 * new-season.mjs — Scaffold next season's constants file from the season just finished.
 *
 * Usage:
 *   npm run new-season -- 2027          # from archives/league-2026.json
 *   npm run new-season -- 2027 --force  # overwrite an existing file
 *
 * Carries forward the roster and course data, and computes starting handicaps with
 * the app's own engine (see capture-handicaps.mjs for why week 19). Leaves
 * SCHEDULE_RAW and NEW_MEMBERS as explicit TODOs — the schedule isn't built until
 * March, and new-member status is a judgement call.
 *
 * Writing the file does NOT activate the season. Register it in SEASONS and bump
 * CURRENT_SEASON in constants/league.js when it's actually ready to open.
 */
import fs from "fs";
import path from "path";
import { getEffectiveHcp } from "../src/lib/leagueLogic.js";
import { TEAMS, PAR, SI, RAINOUT_SUB, BASE_TEE_TIMES } from "../src/constants/league.js";

const year = parseInt(process.argv[2], 10);
const force = process.argv.includes("--force");
if (!year) {
  console.error("Usage: npm run new-season -- <year> [--force]");
  process.exit(1);
}
const from = year - 1;
const archive = `archives/league-${from}.json`;
const outPath = path.join("src", "constants", `league_${year}.js`);

if (!fs.existsSync(archive)) {
  console.error(`✗ ${archive} not found — run: node scripts/archive-season.cjs ${from}`);
  process.exit(1);
}
if (fs.existsSync(outPath) && !force) {
  console.error(`✗ ${outPath} already exists. Re-run with --force to overwrite.`);
  process.exit(1);
}

const A = JSON.parse(fs.readFileSync(archive, "utf8"));
const unflat = s => Array.isArray(s) ? s : (s ? [s.p0 || [], s.p1 || []] : [[], []]);
const results = {};
for (const [id, raw] of Object.entries(A.weekScores || {})) {
  const i = id.indexOf("_");
  const w = parseInt(raw.week ?? id.slice(0, i), 10);
  const mk = raw.matchKey ?? id.slice(i + 1);
  if (!w || !mk) continue;
  (results[w] ||= {})[mk] = { ...raw, t1scores: unflat(raw.t1scores), t2scores: unflat(raw.t2scores) };
}

const H = A.league.handicaps || {};
const overrides = A.league.hcpOverrides || {};
const cancelled = new Set(A.league.cancelledWeeks || []);

// Week 19 = the handicap carried INTO the Quarterfinals, i.e. weeks 1-18 inclusive.
// Week 18 is the last week all 18 teams play; anything later advances only the 8
// still in the playoffs. See capture-handicaps.mjs.
const hcp = {};
for (let t = 1; t <= 18; t++) {
  hcp[t] = [0, 1].map(pi => getEffectiveHcp(t, pi, 19, results, H, overrides, cancelled));
}

const teamLines = Object.entries(TEAMS).map(([tid, t]) =>
  `  ${(tid + ":").padEnd(4)}{name:${(JSON.stringify(t.name) + ",").padEnd(27)}p1:${(JSON.stringify(t.p1) + ",").padEnd(21)}p2:${JSON.stringify(t.p2)}},`
).join("\n");

const hcpLines = Object.entries(hcp).map(([tid, pair]) =>
  `  ${(tid + ":").padEnd(4)}${`[${pair[0]},${pair[1]}],`.padEnd(10)}// ${TEAMS[tid]?.p1}, ${TEAMS[tid]?.p2}`
).join("\n");

const out = `// ${year} season constants.
// Scaffolded by scripts/new-season.mjs from the ${from} season.
//
// TODO before opening day:
//   1. Roster — edit TEAMS below for any changes, then re-run the handicap
//      capture if pairings moved: npm run capture-hcp -- ${from}
//   2. NEW_MEMBERS — flag anyone genuinely new (affects the handicap formula).
//   3. SCHEDULE_RAW — built in March; see docs/SEASON-ROLLOVER.md.
//   4. Register in SEASONS and bump CURRENT_SEASON in constants/league.js.

const PAR         = ${JSON.stringify(PAR)};
const SI          = ${JSON.stringify(SI)};
const RAINOUT_SUB = ${JSON.stringify(RAINOUT_SUB).replace(/"/g, "")}; // H7→H1, H8→H4, H9→H3

// ── Teams ──────────────────────────────────────────────────────
// Carried forward from ${from}. Edit for roster changes.
const TEAMS = {
${teamLines}
};

// Player list: {tid, pi, name}
const ALL_PLAYERS = Object.entries(TEAMS).flatMap(([tid,t]) => [
  {tid:parseInt(tid), pi:0, name:t.p1, team:t.name},
  {tid:parseInt(tid), pi:1, name:t.p2, team:t.name},
]);

// ── Schedule ───────────────────────────────────────────────────
// TODO: built in March. Format: [week, "YYYY-MM-DD", [teamA,teamB], ...9 pairs]
// Weeks 18-21 carry no pairs — they're computed from seeds.
const SCHEDULE_RAW = [
  // [1,  "${year}-04-??", [a,b],[c,d], ...],
];

const BASE_TEE_TIMES = ${JSON.stringify(BASE_TEE_TIMES)};
const TEE_TIME_OVERRIDES = {};
function getTeeTimes(week) {
  return TEE_TIME_OVERRIDES[week] || BASE_TEE_TIMES;
}

function buildSchedule() {
  const s = {};
  for (const [week, date, ...pairs] of SCHEDULE_RAW) {
    s[week] = {week, date, pairs:(pairs||[]).filter(p=>Array.isArray(p))};
  }
  return s;
}
const SCHEDULE = buildSchedule();

// ── Starting handicaps ─────────────────────────────────────────
// Captured from ${from} through Week 18 (the Knockdown — the last week all 18
// teams play). Regenerate with: npm run capture-hcp -- ${from}
const DEFAULT_HCP = {
${hcpLines}
};

// ── New members — keyed by "tid-pi" ────────────────────────────
// TODO: a player flagged new in ${from} is no longer new unless they sat out.
const NEW_MEMBERS = {};

const HCP_PCT = [0, 0.90, 0.90, 0.90, 0.90];
const HCP_CAP = 2;
const HCP_ROUNDS = 7;
const NEW_MEMBER_HCP_PCT = 0.60;
const PLAYOFF_START_WEEK = 18;

export {
  PAR,
  SI,
  RAINOUT_SUB,
  TEAMS,
  ALL_PLAYERS,
  SCHEDULE_RAW,
  BASE_TEE_TIMES,
  TEE_TIME_OVERRIDES,
  getTeeTimes,
  buildSchedule,
  SCHEDULE,
  DEFAULT_HCP,
  NEW_MEMBERS,
  HCP_PCT,
  HCP_CAP,
  HCP_ROUNDS,
  NEW_MEMBER_HCP_PCT,
  PLAYOFF_START_WEEK,
};

export function isNewMember(tid, pi) {
  return !!NEW_MEMBERS[\`\${tid}-\${pi}\`];
}
`;

fs.writeFileSync(outPath, out);
console.log(`✓ Wrote ${outPath}`);
console.log(`  roster carried from ${from} (${Object.keys(TEAMS).length} teams)`);
console.log(`  starting handicaps captured through ${from} Week 18`);
console.log(`\nStill TODO: roster edits, NEW_MEMBERS, SCHEDULE_RAW, then register in constants/league.js`);
