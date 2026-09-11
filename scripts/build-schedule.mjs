/**
 * build-schedule.mjs — Generate a season's SCHEDULE_RAW.
 *
 * Usage:
 *   npm run build-schedule -- 2027                    # defaults below
 *   npm run build-schedule -- 2027 --start 2027-04-21 # different opening day
 *   npm run build-schedule -- 2027 --no-bye           # no July break
 *   npm run build-schedule -- 2027 --seed 7           # different pairing shuffle
 *
 * Produces a single round-robin: 18 teams, 17 weeks, every pairing exactly once
 * (153 of them), 9 matches a week. Then weeks 18-21 with no pairs — Knockdown,
 * QF, SF and Final are all computed from seeds.
 *
 * Dates are weekly Wednesdays from the start, skipping the first Wednesday in
 * July for the holiday, which is what 2026 did (it skipped Wed Jul 1).
 *
 * NOT handled: tee-time accommodation. Tee times are assigned by POSITION —
 * getTeeTimes(week)[i] maps to pairs[i] — so the order of the 9 pairs within a
 * week is the tee sheet. Teams needing later starts must be moved toward the end
 * of their week's list. See docs/SEASON-ROLLOVER.md §1.4.
 */
const args = process.argv.slice(2);
const year = parseInt(args[0], 10);
if (!year) {
  console.error("Usage: npm run build-schedule -- <year> [--start YYYY-MM-DD] [--no-bye]");
  process.exit(1);
}
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const noBye = args.includes("--no-bye");

const N_TEAMS = 18;
const REGULAR_WEEKS = N_TEAMS - 1;  // 17
const PLAYOFF_WEEKS = 4;            // 18 Knockdown, 19 QF, 20 SF, 21 Final

// ── Round-robin (circle method) ────────────────────────────────
// Team 1 is fixed; the other 17 rotate. Each round: 1 vs rot[0], then the
// remaining 16 fold onto each other — rot[1]v rot[17-1], rot[2] v rot[17-2] …
function roundRobin(n) {
  const rot = Array.from({ length: n - 1 }, (_, i) => i + 2);
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [[1, rot[0]]];
    for (let i = 1; i <= (n - 2) / 2; i++) pairs.push([rot[i], rot[rot.length - i]]);
    rounds.push(pairs.map(([a, b]) => (a < b ? [a, b] : [b, a])));
    rot.push(rot.shift());
  }
  return rounds;
}

// ── Dates ──────────────────────────────────────────────────────
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

function firstWednesdayOfJuly(y) {
  const d = new Date(Date.UTC(y, 6, 1));
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}

// Default opening day: the Wednesday nearest to mid-April (2026 opened Apr 15).
function defaultStart(y) {
  const d = new Date(Date.UTC(y, 3, 14));
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}

const startStr = flag("--start") || defaultStart(year);
const start = new Date(startStr + "T12:00:00Z");
if (start.getUTCDay() !== 3) {
  console.error(`✗ ${startStr} is not a Wednesday — the league plays Wednesdays.`);
  process.exit(1);
}
const bye = noBye ? null : firstWednesdayOfJuly(year);

// Team IDs track prior-year standing, so the raw circle method would have team 1
// facing 2, 3, 4 … 18 in near strength order. Shuffle which team sits in which
// circle position — the round-robin stays valid, the strength sequencing goes away.
// Seeded so the same inputs always give the same schedule.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seed = parseInt(flag("--seed") || String(year), 10);
const rnd = mulberry32(seed);
const label = Array.from({ length: N_TEAMS }, (_, i) => i + 1);
for (let i = label.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [label[i], label[j]] = [label[j], label[i]];
}
const relabel = (pairs) => pairs.map(([a, b]) => {
  const [x, y] = [label[a - 1], label[b - 1]];
  return x < y ? [x, y] : [y, x];
});

const rounds = roundRobin(N_TEAMS).map(relabel);
const dates = [];
let cursor = start;
for (let i = 0; i < REGULAR_WEEKS + PLAYOFF_WEEKS; i++) {
  if (bye && iso(cursor) === bye) cursor = addDays(cursor, 7); // holiday break
  dates.push(iso(cursor));
  cursor = addDays(cursor, 7);
}

// ── Validate before emitting ───────────────────────────────────
const seen = new Map();
const problems = [];
rounds.forEach((pairs, idx) => {
  const w = idx + 1;
  const present = new Set();
  for (const [a, b] of pairs) {
    present.add(a); present.add(b);
    const k = `${a}-${b}`;
    if (seen.has(k)) problems.push(`repeat pairing ${k}: weeks ${seen.get(k)} and ${w}`);
    seen.set(k, w);
  }
  if (pairs.length !== N_TEAMS / 2) problems.push(`week ${w}: ${pairs.length} matches, expected 9`);
  if (present.size !== N_TEAMS) problems.push(`week ${w}: ${present.size} teams, expected 18`);
});
const expectedPairings = (N_TEAMS * (N_TEAMS - 1)) / 2;
if (seen.size !== expectedPairings) problems.push(`${seen.size} distinct pairings, expected ${expectedPairings}`);
if (problems.length) {
  console.error("✗ Generated schedule is invalid:\n  " + problems.join("\n  "));
  process.exit(1);
}

// ── Emit ───────────────────────────────────────────────────────
const LABEL = { 18: "Knockdown: all 18 teams play — pairs computed from seeds",
                19: "Playoffs Quarterfinals: 1v8, 2v7, 3v6, 4v5",
                20: "Playoffs Semifinals", 21: "Playoffs Finals" };

const lines = [];
for (let w = 1; w <= REGULAR_WEEKS; w++) {
  const pairs = rounds[w - 1].map(([a, b]) => `[${a},${b}]`).join(",");
  lines.push(`  [${String(w).padEnd(2)} "${dates[w - 1]}", ${pairs}],`);
}
for (let w = REGULAR_WEEKS + 1; w <= REGULAR_WEEKS + PLAYOFF_WEEKS; w++) {
  lines.push(`  [${String(w).padEnd(2)} "${dates[w - 1]}"],   // ${LABEL[w]}`);
}
const block = `const SCHEDULE_RAW = [\n${lines.join("\n").replace(/\[(\d+) /g, "[$1, ")}\n];`;

console.log(`✓ ${year}: ${REGULAR_WEEKS} regular weeks + ${PLAYOFF_WEEKS} playoff weeks`);
console.log(`  ${expectedPairings} pairings, each exactly once; 9 matches/week; all 18 teams each week`);
console.log(`  season runs ${dates[0]} → ${dates[dates.length - 1]}`);
console.log(bye ? `  bye week: ${bye} (first Wednesday in July) skipped\n` : `  no bye week\n`);
console.log(block);
console.log(`\n⚠  Tee-time accommodation NOT applied — the order of pairs within each`);
console.log(`   week is the tee sheet. Reorder weeks so late-start teams fall last.`);
