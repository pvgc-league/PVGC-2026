import * as L2026 from "./league_2026";

const STORAGE_KEY = "pvgc_season_year";

// Season registry — add a season here and it becomes selectable. Nothing else in
// this file needs to change. 2024 and 2025 were removed: their spreadsheets
// carried manual adjustments the app was never able to reproduce faithfully.
const SEASONS = {
  2026: L2026,
};

const AVAILABLE_SEASONS = Object.keys(SEASONS).map(Number).sort((a, b) => a - b);
const CURRENT_SEASON = AVAILABLE_SEASONS[AVAILABLE_SEASONS.length - 1];

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
