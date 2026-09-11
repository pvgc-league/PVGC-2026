// 2027 season constants.
// Scaffolded by scripts/new-season.mjs from the 2026 season.
//
// TODO before opening day:
//   1. Roster — edit TEAMS below for any changes, then re-run the handicap
//      capture if pairings moved: npm run capture-hcp -- 2026
//   2. NEW_MEMBERS — flag anyone genuinely new (affects the handicap formula).
//   3. SCHEDULE_RAW — built in March; see docs/SEASON-ROLLOVER.md.
//   4. Register in SEASONS and bump CURRENT_SEASON in constants/league.js.

const PAR         = [4,3,4,5,4,3,4,5,4];
const SI          = [1,3,7,8,4,9,2,6,5];
const RAINOUT_SUB = {6:0,7:3,8:2}; // H7→H1, H8→H4, H9→H3

// ── Teams ──────────────────────────────────────────────────────
// Carried forward from 2026. Edit for roster changes.
const TEAMS = {
  1:  {name:"Charles - Dagg",          p1:"Brian Charles",     p2:"Karl Dagg"},
  2:  {name:"Brosius - Albano",        p1:"Steve Brosius",     p2:"Mike Albano"},
  3:  {name:"Mistry - Reddy",          p1:"Baz Mistry",        p2:"Sanjay Reddy"},
  4:  {name:"Pineno - MacKenzie",      p1:"Scot Pineno",       p2:"Scott MacKenzie"},
  5:  {name:"Carickhoff - Schantz",    p1:"Jack Carickhoff",   p2:"Tracy Schantz"},
  6:  {name:"Glascott - Adler",        p1:"Scott Glascott",    p2:"Mark Adler"},
  7:  {name:"Harvey - Rowles",         p1:"John Harvey",       p2:"Jeff Rowles"},
  8:  {name:"Saenz - Huston",          p1:"Bob Saenz",         p2:"Dennis Huston"},
  9:  {name:"Fahey - Wzorek",          p1:"Chris Fahey",       p2:"Barry Wzorek"},
  10: {name:"Mulvey - Nelson",         p1:"Tom Mulvey",        p2:"Chris Nelson"},
  11: {name:"West - Herman",           p1:"Jack West",         p2:"Ron Herman"},
  12: {name:"Lorenz - Huckestein",     p1:"Gabe Lorenz",       p2:"Jake Huckestein"},
  13: {name:"Wagner - Hammond",        p1:"Betsy Wagner",      p2:"Gordon Hammond"},
  14: {name:"Franks - Lightbody",      p1:"John Franks",       p2:"Scott Lightbody"},
  15: {name:"Jurden - Olivos",         p1:"Jesse Jurden",      p2:"JC Olivos"},
  16: {name:"Lukas - Blizard",         p1:"Rhonda Lukas",      p2:"Carol Blizard"},
  17: {name:"Posey - Minasian",        p1:"Russ Posey",        p2:"Aret Minasian"},
  18: {name:"Pavelik - Mitchell",      p1:"Barry Pavelik",     p2:"Mark Mitchell"},
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
  // [1,  "2027-04-??", [a,b],[c,d], ...],
];

const BASE_TEE_TIMES = ["4:10 PM","4:20 PM","4:30 PM","4:40 PM","4:50 PM","5:00 PM","5:10 PM","5:20 PM","5:30 PM"];
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
// Captured from 2026 through Week 18 (the Knockdown — the last week all 18
// teams play). Regenerate with: npm run capture-hcp -- 2026
const DEFAULT_HCP = {
  1:  [5,5],    // Brian Charles, Karl Dagg
  2:  [4,8],    // Steve Brosius, Mike Albano
  3:  [4,9],    // Baz Mistry, Sanjay Reddy
  4:  [7,8],    // Scot Pineno, Scott MacKenzie
  5:  [0,7],    // Jack Carickhoff, Tracy Schantz
  6:  [10,7],   // Scott Glascott, Mark Adler
  7:  [8,9],    // John Harvey, Jeff Rowles
  8:  [7,9],    // Bob Saenz, Dennis Huston
  9:  [6,10],   // Chris Fahey, Barry Wzorek
  10: [7,5],    // Tom Mulvey, Chris Nelson
  11: [8,14],   // Jack West, Ron Herman
  12: [15,1],   // Gabe Lorenz, Jake Huckestein
  13: [18,13],  // Betsy Wagner, Gordon Hammond
  14: [7,-1],   // John Franks, Scott Lightbody
  15: [12,12],  // Jesse Jurden, JC Olivos
  16: [8,26],   // Rhonda Lukas, Carol Blizard
  17: [10,11],  // Russ Posey, Aret Minasian
  18: [14,11],  // Barry Pavelik, Mark Mitchell
};

// ── New members — keyed by "tid-pi" ────────────────────────────
// TODO: a player flagged new in 2026 is no longer new unless they sat out.
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
  return !!NEW_MEMBERS[`${tid}-${pi}`];
}
