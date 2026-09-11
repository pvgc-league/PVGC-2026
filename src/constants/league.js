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
// Bump this by hand when the new season is ready to open.
// Still 2026: the season that just finished is what members should land on.
// Bump to 2027 on opening day (2027-04-14).
const CURRENT_SEASON = 2026;

const AVAILABLE_SEASONS = Object.keys(SEASONS).map(Number).sort((a, b) => a - b);

function readSeasonYear() {
  if (typeof window === "undefined") return CURRENT_SEASON;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const year = parseInt(raw || "", 10);
  return AVAILABLE_SEASONS.includes(year) ? year : CURRENT_SEASON;
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
  SEASON_YEAR,
  setSeasonYear,
  isNewMember,
};
