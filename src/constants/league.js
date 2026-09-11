import * as L2026 from "./league_2026";
import * as L2027 from "./league_2027";

const STORAGE_KEY = "pvgc_season_year";

// Season registry — add a season here to make it selectable. 2024 and 2025 were
// removed: their spreadsheets carried manual adjustments the app was never able
// to reproduce faithfully.
const SEASONS = {
  2026: L2026,
  2027: L2027,
};

// The season everyone lands on by default. Registering a season does NOT activate
// it — a new year gets built up over the preseason (roster, then handicaps, then
// the schedule in March) and is only worth defaulting to once its schedule is in.
// Still 2026: the season that just finished is what members should land on.
// Bump to 2027 on opening day (2027-04-14).
const CURRENT_SEASON = 2026;

// Seasons still being built. A draft schedule looks every bit as authoritative as
// a final one, and someone could plan their summer around tee times that are going
// to move — so drafts are admin-only and carry a banner. Remove a year from here
// when it's genuinely final (see docs/SEASON-ROLLOVER.md).
const DRAFT_SEASONS = [2027];

const ALL_SEASONS = Object.keys(SEASONS).map(Number).sort((a, b) => a - b);
const isDraftSeason = (year) => DRAFT_SEASONS.includes(Number(year));

// Client-side only: the same localStorage flag App uses. This isn't a security
// boundary — it stops accidental confusion, not a determined snooper.
function isAdminViewer() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("pvgc_admin") === "1";
  } catch {
    return false;
  }
}

// Drafts are hidden from the season picker unless you're an admin.
const AVAILABLE_SEASONS = ALL_SEASONS.filter((y) => !isDraftSeason(y) || isAdminViewer());

function readSeasonYear() {
  if (typeof window === "undefined") return CURRENT_SEASON;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const year = parseInt(raw || "", 10);
  if (!ALL_SEASONS.includes(year)) return CURRENT_SEASON;
  // Refuse to resolve to a draft for a non-admin even if it's the stored value —
  // otherwise an admin handing over their phone, or a stale localStorage entry,
  // silently shows a member an unfinished season.
  if (isDraftSeason(year) && !isAdminViewer()) return CURRENT_SEASON;
  return year;
}

function writeSeasonYear(year) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(year));
}

const SEASON_YEAR = readSeasonYear();
const ACTIVE = SEASONS[SEASON_YEAR];

const {
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
} = ACTIVE;

function setSeasonYear(year) {
  const y = parseInt(year, 10);
  if (!AVAILABLE_SEASONS.includes(y)) return false;
  writeSeasonYear(y);
  return true;
}

function isNewMember(tid, pi) {
  return ACTIVE.isNewMember(tid, pi);
}

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
  AVAILABLE_SEASONS,
  CURRENT_SEASON,
  DRAFT_SEASONS,
  isDraftSeason,
  SEASON_YEAR,
  setSeasonYear,
  isNewMember,
};
