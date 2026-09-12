import {
  PAR,
  SI,
  RAINOUT_SUB,
  SCHEDULE,
  ALL_PLAYERS,
  TEAMS,
  DEFAULT_HCP,
  HCP_PCT,
  HCP_CAP,
  HCP_ROUNDS,
  NEW_MEMBER_HCP_PCT,
  PLAYOFF_START_WEEK,
  isNewMember,
  getTeeTimes,
} from "../constants/league";

const REGULAR_SEASON_MAX_WEEK = PLAYOFF_START_WEEK - 1;

// A schedule copy with the Knockdown week (W18) filled in with its seed-based
// pairings, so the stats engine treats W18 as a normal scored week (it otherwise
// has no pairs in the static schedule and gets skipped). Used for standings/POY/
// POW and the final playoff seeding — NOT for the knockdown pairing itself.
function scheduleWithKnockdown(knockdownPairs, schedule = SCHEDULE) {
  if (!knockdownPairs?.length) return schedule;
  return { ...schedule, [PLAYOFF_START_WEEK]: { ...(schedule[PLAYOFF_START_WEEK] || {}), pairs: knockdownPairs } };
}

// ── Regular-season standings tiebreakers (per rulebook) ─────────────────────
// Order of teams LEVEL ON TOTAL POINTS is decided by, in order:
//   0. Admin override (commissioner's call — e.g. the 8th-seed 3-hole playoff)
//   1. TB1 head-to-head result from the regular season
//   2. TB2 highest total vs. a common playoff-qualified opponent, top-down
//   3. Fallback: total Stableford (the app's historical behavior — never worse)
// Teams NOT tied on total points are never reordered by any of this.
const TIEBREAK_MAX_WEEK = REGULAR_SEASON_MAX_WEEK; // head-to-head uses regular season only

function findSeasonMatch(aId, bId, results) {
  for (let w = 1; w <= TIEBREAK_MAX_WEEK; w++) {
    if (getOpponent(aId, w) === bId) {
      const [lo, hi] = aId < bId ? [aId, bId] : [bId, aId];
      const rec = results?.[w]?.[matchKey(w, lo, hi)];
      if (rec) return { w, lo, hi, rec };
    }
  }
  return null;
}
function teamTotalInMatch(teamId, m, handicaps) {
  return teamId === m.lo
    ? computeTeamTotal(m.rec, 0, m.lo, handicaps)
    : computeTeamTotal(m.rec, 1, m.hi, handicaps);
}
// TB1 — head-to-head. Returns 1 if a wins, -1 if b wins, 0 if tied / didn't play.
function tb1HeadToHead(aId, bId, results, handicaps) {
  const m = findSeasonMatch(aId, bId, results);
  if (!m) return 0;
  const ta = teamTotalInMatch(aId, m, handicaps);
  const tb = teamTotalInMatch(bId, m, handicaps);
  return ta === tb ? 0 : ta > tb ? 1 : -1;
}
// TB2 — walk the standings from the top; first playoff-qualified team both tied
// teams played, compare each tied team's total in that match. 1=a, -1=b, 0=none.
function tb2CommonOpponent(aId, bId, ctx) {
  const { baseOrder, qualified, results, handicaps } = ctx;
  for (const rId of baseOrder) {
    if (rId === aId || rId === bId || !qualified.has(rId)) continue;
    const ma = findSeasonMatch(aId, rId, results);
    const mb = findSeasonMatch(bId, rId, results);
    if (!ma || !mb) continue;
    const ta = teamTotalInMatch(aId, ma, handicaps);
    const tb = teamTotalInMatch(bId, mb, handicaps);
    if (ta !== tb) return ta > tb ? 1 : -1;
  }
  return 0;
}
// Order a two-team tie; returns { order:[teamA,teamB], tb:'override'|'h2h'|'tb2'|'stableford' }
function orderTiedPair(a, b, ctx) {
  const ov = ctx.seedOverrides || [];
  const oa = ov.indexOf(a.id), ob = ov.indexOf(b.id);
  if (oa !== -1 && ob !== -1 && oa !== ob) return { order: oa < ob ? [a, b] : [b, a], tb: "override" };
  const h = tb1HeadToHead(a.id, b.id, ctx.results, ctx.handicaps);
  if (h !== 0) return { order: h > 0 ? [a, b] : [b, a], tb: "h2h" };
  const t = tb2CommonOpponent(a.id, b.id, ctx);
  if (t !== 0) return { order: t > 0 ? [a, b] : [b, a], tb: "tb2" };
  return { order: a.stab >= b.stab ? [a, b] : [b, a], tb: "stableford" };
}
// Resolve a group of teams tied on total points into a strict order.
function resolveTiedGroup(group, ctx) {
  if (group.length === 1) return [{ ...group[0], _tb: null, _tieWith: [] }];
  const tieWith = (t) => group.map((g) => g.id).filter((id) => id !== t.id);
  if (group.length === 2) {
    const { order, tb } = orderTiedPair(group[0], group[1], ctx);
    return order.map((t) => ({ ...t, _tb: tb, _tieWith: tieWith(t) }));
  }
  // 3+ teams: override first (by list index), then head-to-head wins within the
  // group, then Stableford. The rulebook resolves these with on-course playoffs,
  // so this is a deterministic provisional order — set the override for the real one.
  const ov = ctx.seedOverrides || [];
  const scored = group.map((t) => {
    let wins = 0;
    for (const o of group) if (o.id !== t.id && tb1HeadToHead(t.id, o.id, ctx.results, ctx.handicaps) > 0) wins++;
    return { t, wins, ovIdx: ov.indexOf(t.id) };
  });
  scored.sort((x, y) => {
    const xo = x.ovIdx === -1 ? Infinity : x.ovIdx, yo = y.ovIdx === -1 ? Infinity : y.ovIdx;
    if (xo !== yo) return xo - yo;
    if (y.wins !== x.wins) return y.wins - x.wins;
    return y.t.stab - x.t.stab;
  });
  return scored.map((s) => ({ ...s.t, _tb: s.ovIdx !== -1 ? "override" : "multi", _tieWith: tieWith(s.t) }));
}
// Rank all teams: primary = total points; ties broken per the rulebook above.
// Returns team objects (with id + _tb/_tieWith metadata) in seed order.
function rankStandings(teamStats, opts = {}) {
  const { results = {}, handicaps = {}, seedOverrides = [] } = opts;
  const teams = Object.entries(teamStats).map(([id, s]) => ({ id: parseInt(id), ...s }));
  const base = [...teams].sort((a, b) => b.totalPts - a.totalPts || b.stab - a.stab);
  const ctx = {
    results, handicaps, seedOverrides,
    baseOrder: base.map((t) => t.id),
    qualified: new Set(base.slice(0, 8).map((t) => t.id)),
  };
  const byPts = new Map();
  for (const t of base) {
    if (!byPts.has(t.totalPts)) byPts.set(t.totalPts, []);
    byPts.get(t.totalPts).push(t);
  }
  const out = [];
  for (const pts of [...byPts.keys()].sort((a, b) => b - a)) out.push(...resolveTiedGroup(byPts.get(pts), ctx));
  return out;
}

// All 18 teams ranked by regular season (W1-W17)
function getAllSeeds(results, handicaps, cancelledWeeks=null, loHiOverrides=null, seedOverrides=[]) {
  const {teamStats} = calcLeagueStats(results, handicaps, cancelledWeeks, REGULAR_SEASON_MAX_WEEK, undefined, undefined, undefined, loHiOverrides);
  return rankStandings(teamStats, { results, handicaps, seedOverrides }).map(s=>s.id);
}

// Top 8 seeds from regular season — used for display before knockdown
function getPlayoffSeeds(results, handicaps, cancelledWeeks=null, loHiOverrides=null, seedOverrides=[]) {
  return getAllSeeds(results, handicaps, cancelledWeeks, loHiOverrides, seedOverrides).slice(0, 8);
}

// All 18 teams ranked after knockdown (W1-W18) — top 8 advance to QF
function getQFSeeds(results, handicaps, cancelledWeeks=null, loHiOverrides=null, seedOverrides=[]) {
  // Final seeding includes the Knockdown (W18). Inject its seed-based pairs so
  // calcLeagueStats scores that week; the pairs come from the pre-knockdown
  // (W1-17) standings, so there's no circularity.
  const kd = getKnockdownPairs(results, handicaps, cancelledWeeks, loHiOverrides, seedOverrides);
  const {teamStats} = calcLeagueStats(results, handicaps, cancelledWeeks, PLAYOFF_START_WEEK, scheduleWithKnockdown(kd), undefined, undefined, loHiOverrides);
  return rankStandings(teamStats, { results, handicaps, seedOverrides }).map(s=>s.id); // all 18 ranked, QF uses first 8
}

// Week 18 Knockdown: all seeds pair adjacently by standing (1v2, 3v4, 5v6, … 17v18)
function getKnockdownPairs(results, handicaps, cancelledWeeks=null, loHiOverrides=null, seedOverrides=[]) {
  const all = getAllSeeds(results, handicaps, cancelledWeeks, loHiOverrides, seedOverrides); // 18 teams in seed order
  if (all.length < 8) return [];
  const pairs = [];
  for (let i = 0; i + 1 < all.length; i += 2) {
    pairs.push([all[i], all[i + 1]]);
  }
  return pairs;
}

// Week 19 QF: top 8 of qfSeeds, paired 1v8, 2v7, 3v6, 4v5
function getQFPairs(qfSeeds) {
  const top8 = qfSeeds.slice(0, 8);
  if(top8.length<8) return [];
  return [[top8[0],top8[7]],[top8[1],top8[6]],[top8[2],top8[5]],[top8[3],top8[4]]];
}

// Get winner of a playoff match (higher stab score wins; tie = lower seed/ta advances)
function getPlayoffWinner(week, ta, tb, results, handicaps={}) {
  const mk = matchKey(week, Math.min(ta,tb), Math.max(ta,tb));
  const rec = results[week]?.[mk];
  if(!rec) return null;
  // Playoffs are decided on team Stableford points (same metric shown in the
  // bracket and used all season) — HIGHER wins, not raw gross strokes.
  const tlow=Math.min(ta,tb), thigh=Math.max(ta,tb);
  const totLow  = computeTeamTotal(rec, 0, tlow,  handicaps);
  const totHigh = computeTeamTotal(rec, 1, thigh, handicaps);
  const scoreA = ta===tlow ? totLow : totHigh;
  const scoreB = tb===tlow ? totLow : totHigh;
  if(scoreA > scoreB) return ta;
  if(scoreB > scoreA) return tb;
  return ta; // tie: higher seed (ta) advances by convention
}

// Get SF pairs — reseed QF winners by original QF seed
function getSFPairs(qfSeeds, results, handicaps={}) {
  const qf = getQFPairs(qfSeeds);
  const w = qf.map(([a,b])=>getPlayoffWinner(19,a,b,results,handicaps));
  if(w.some(x=>!x)) return null;
  // Reseed: sort winners by their original seed position, match 1v4 and 2v3
  const sorted = [...w].sort((a,b) => qfSeeds.indexOf(a) - qfSeeds.indexOf(b));
  return [[sorted[0],sorted[3]],[sorted[1],sorted[2]]];
}

// Get Finals pairs — reseed SF winners by original QF seed
function getFinalPairs(qfSeeds, results, handicaps={}) {
  const sf = getSFPairs(qfSeeds, results, handicaps);
  if(!sf) return null;
  const w = sf.map(([a,b])=>getPlayoffWinner(20,a,b,results,handicaps));
  if(w.some(x=>!x)) return null;
  const l = sf.map(([a,b],i)=>w[i]===a?b:a);
  // Reseed winners and losers by original seed
  const wSorted = [...w].sort((a,b) => qfSeeds.indexOf(a) - qfSeeds.indexOf(b));
  const lSorted = [...l].sort((a,b) => qfSeeds.indexOf(a) - qfSeeds.indexOf(b));
  return {championship:[wSorted[0],wSorted[1]], thirdPlace:[lSorted[0],lSorted[1]]};
}

function getOpponent(teamId, week, dynamicPairs=null, schedule=SCHEDULE) {
  if(dynamicPairs) {
    for(const [a,b] of dynamicPairs) {
      if(a===teamId) return b;
      if(b===teamId) return a;
    }
    return null;
  }
  const w = schedule[week];
  if (!w?.pairs) return null;
  for (const [a,b] of w.pairs) {
    if (a===teamId) return b;
    if (b===teamId) return a;
  }
  return null;
}

function matchKey(w,ta,tb) { return `${w}-${Math.min(ta,tb)}-${Math.max(ta,tb)}`; }

// ── Scoring logic ──────────────────────────────────────────────
function hcpStr(hcp, si) {
  const h = Math.floor(parseFloat(hcp)||0);
  if (h < 0) return si <= Math.abs(h) ? -1 : 0;
  const full = Math.floor(h / 9);
  const remainder = h % 9;
  return full + (si <= remainder ? 1 : 0);
}

// Max gross score on a hole = par + 2 (net double bogey) + strokes received
function maxGross(par, strokes) {
  return par + 2 + strokes;
}

// Stableford points — gross is capped at net double bogey before calculation
function stabPts(gross, par, strokes) {
  if (!gross) return null;
  const cappedGross = Math.min(gross, maxGross(par, strokes));
  const diff = par - (cappedGross - strokes);
  if (diff >= 3) return 5;
  if (diff === 2) return 4;
  if (diff === 1) return 3;
  if (diff === 0) return 1;
  if (diff === -1) return 0;
  return -1;
}

// ── Compute team total from a saved match record ───────────────
// Effective playing handicap for one slot of a match. A "playing sub"
// (rec.subs["tid-pi"]) plays off their OWN captured handicap; otherwise use the
// snapshotted handicap, falling back to the current handicap.
function slotHcp(rec, tid, pi, handicaps) {
  const sub = rec && rec.subs && rec.subs[`${tid}-${pi}`];
  if (sub && Number.isFinite(sub.hcp)) return sub.hcp;
  const snap = rec && rec.hcpSnapshot;
  return snap ? (snap[tid]||[0,0])[pi]||0 : ((handicaps||{})[tid]||[0,0])[pi]||0;
}
// Display name for a slot — the sub's name if one played, else the roster name.
function slotName(rec, tid, pi, teams=TEAMS) {
  const sub = rec && rec.subs && rec.subs[`${tid}-${pi}`];
  if (sub && sub.name) return sub.name;
  return teams[tid]?.[pi===0?"p1":"p2"] || `P${pi+1}`;
}

function computeTeamTotal(rec, tIdx, tid, handicaps) {
  let total = 0;
  const types  = tIdx===0 ? rec.t1types  : rec.t2types;
  const scores = tIdx===0 ? rec.t1scores : rec.t2scores;
  for (let pi=0; pi<2; pi++) {
    const type = (types||[])[pi]||"normal";
    if (type==="sub") { total+=6; continue; }
    if (type==="phantom") { total+=2; continue; }
    const hcp = slotHcp(rec, tid, pi, handicaps); // playing-sub aware
    for (let hi=0; hi<9; hi++) {
      const effHi = (rec.rainout && !((scores||[[],[]])[pi]?.[hi]) && RAINOUT_SUB[hi]!==undefined) ? RAINOUT_SUB[hi] : hi;
      const gross = (scores||[[],[]])[pi]?.[effHi]||0;
      if (!gross) continue;
      total += stabPts(gross, PAR[hi], hcpStr(hcp, SI[hi]))||0;
    }
  }
  return total;
}

// Compute individual player total from record
function computePlayerTotal(rec, tIdx, pi, tid, handicaps) {
  const types  = tIdx===0 ? rec.t1types  : rec.t2types;
  const scores = tIdx===0 ? rec.t1scores : rec.t2scores;
  const type = (types||[])[pi]||"normal";
  if (type==="sub") return 6;
  if (type==="phantom") return 2;
  let total = 0;
  const hcp = slotHcp(rec, tid, pi, handicaps); // playing-sub aware
  for (let hi=0; hi<9; hi++) {
    const effHi = (rec.rainout && !((scores||[[],[]])[pi]?.[hi]) && RAINOUT_SUB[hi]!==undefined) ? RAINOUT_SUB[hi] : hi;
    const gross = (scores||[[],[]])[pi]?.[effHi]||0;
    if (!gross) continue;
    total += stabPts(gross, PAR[hi], hcpStr(hcp, SI[hi]))||0;
  }
  return total;
}

// ── Match completeness check ────────────────────────────────────
// A match is "complete" only when every normal player has at least one
// real score entered. Sub/phantom slots are always considered complete
// since their points are deterministic.
function isMatchComplete(rec) {
  if (!rec) return false;
  for (let tIdx = 0; tIdx < 2; tIdx++) {
    const scores = tIdx === 0 ? rec.t1scores : rec.t2scores;
    const types  = tIdx === 0 ? rec.t1types  : rec.t2types;
    for (let pi = 0; pi < 2; pi++) {
      const type = (types || [])[pi] || "normal";
      if (type === "sub" || type === "phantom") continue;
      const holeScores = (scores || [])[pi] || [];
      const hasScore = Array.isArray(holeScores)
        ? holeScores.some(s => s > 0)
        : Object.values(holeScores).some(s => s > 0);
      if (!hasScore) return false;
    }
  }
  return true;
}

// ── Bonus points: rank all 9 team totals in a week ─────────────
// Returns {teamId: bonusPts} — only if ALL 9 matches are fully scored
function calcWeekBonus(week, results, handicaps, schedule=SCHEDULE) {
  const w = schedule[week];
  if (!w?.pairs?.length) return null;
  const totals = [];
  for (const [ta,tb] of w.pairs) {
    const key = matchKey(week,ta,tb);
    const rec = results[week]?.[key];
    if (!isMatchComplete(rec)) return null; // wait for all real scores
    const [tlow,thigh] = ta<tb?[ta,tb]:[tb,ta];
    totals.push({tid:tlow,  total:computeTeamTotal(rec,0,tlow,handicaps)});
    totals.push({tid:thigh, total:computeTeamTotal(rec,1,thigh,handicaps)});
  }
  return awardBonusBuckets(totals).bonus;
}

// Award by score groups (distinct totals): top 2 groups get 8, next 2 get 6, then
// 4, then 2, then 0. Teams on the same total always get the same bonus.
// Returns { bonus: {tid: pts}, sorted: [...] } — `sorted` is descending by total.
function awardBonusBuckets(totals) {
  const sorted = [...totals].sort((a, b) => b.total - a.total);
  const bonus = {};
  const bucketPts = [8, 6, 4, 2];
  let bucketIdx = 0, groupsInBucket = 0, i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].total === sorted[i].total) j++;
    const pts = bucketIdx < bucketPts.length ? bucketPts[bucketIdx] : 0;
    for (let k = i; k < j; k++) bonus[sorted[k].tid] = pts;
    if (++groupsInBucket === 2) { groupsInBucket = 0; bucketIdx++; }
    i = j;
  }
  return { bonus, sorted };
}

// Holes a team has completed — the furthest hole either player has a score on.
function teamThruHoles(rec, tIdx) {
  if (!rec) return 0;
  const raw = tIdx === 0 ? rec.t1scores : rec.t2scores;
  const s = Array.isArray(raw) ? raw : (raw ? [raw.p0 || [], raw.p1 || []] : [[], []]);
  let thru = 0;
  for (let h = 0; h < 9; h++) if (((s[0] || [])[h] || 0) > 0 || ((s[1] || [])[h] || 0) > 0) thru = h + 1;
  return thru;
}

// "As it stands" board for a week in progress. Unlike calcWeekBonus this does NOT
// wait for every match to be complete — it ranks whatever has been entered so a
// team can see where they sit for bonus while still on the course.
//
// This is a SNAPSHOT, not a forecast: a team thru 4 is ranked against a team thru
// 9, so `thru` is returned per row and must be shown alongside it. Never use this
// for awarded points — calcWeekBonus stays the authority for those.
function calcLiveBoard(week, results, handicaps, schedule = SCHEDULE) {
  const w = schedule[week];
  if (!w?.pairs?.length) return null;
  const totals = [];
  let allComplete = true;
  for (const [ta, tb] of w.pairs) {
    if (!Array.isArray([ta, tb])) continue;
    const [tlow, thigh] = ta < tb ? [ta, tb] : [tb, ta];
    const rec = results[week]?.[matchKey(week, tlow, thigh)];
    if (!isMatchComplete(rec)) allComplete = false;
    totals.push({ tid: tlow,  total: rec ? computeTeamTotal(rec, 0, tlow, handicaps) : 0,  thru: teamThruHoles(rec, 0) });
    totals.push({ tid: thigh, total: rec ? computeTeamTotal(rec, 1, thigh, handicaps) : 0, thru: teamThruHoles(rec, 1) });
  }
  if (!totals.length) return null;
  const { bonus, sorted } = awardBonusBuckets(totals);
  return { allComplete, bonus, rows: sorted.map((t, i) => ({ ...t, rank: i + 1, bonus: bonus[t.tid] || 0 })) };
}

// Pace of play. Groups tee in the order they appear in the week's pairs, one slot
// apart, so a group N slots ahead should be roughly N holes further along. That
// offset is what makes a comparison fair — without it a late tee time looks slow.
//
// Prefers the nearest group ahead that has scores (how pace actually works: you're
// slow when a gap opens in front). Falls back to the median of every other group
// with scores, which survives one group not entering. Returns null when nothing is
// known — staying silent beats a wrong accusation, and every reading here depends
// on groups entering scores as they play.
function calcPace(week, results, schedule = SCHEDULE, myTid = null) {
  const pairs = (schedule[week]?.pairs || []).filter(Array.isArray);
  if (!pairs.length || !myTid) return null;

  const groupThru = (pair) => {
    const [lo, hi] = pair[0] < pair[1] ? pair : [pair[1], pair[0]];
    const rec = results[week]?.[matchKey(week, lo, hi)];
    if (!rec) return 0;
    return Math.max(teamThruHoles(rec, 0), teamThruHoles(rec, 1));
  };

  const myIdx = pairs.findIndex(p => p.includes(myTid));
  if (myIdx < 0) return null;
  const myThru = groupThru(pairs[myIdx]);
  if (!myThru) return null; // haven't started — nothing to judge

  // What my thru "should" be to match group g, adjusted for the slots between us.
  const expectedFrom = (gIdx) => groupThru(pairs[gIdx]) + (gIdx - myIdx);

  // 1. Nearest group ahead with scores.
  for (let i = myIdx - 1; i >= 0; i--) {
    if (groupThru(pairs[i]) > 0) {
      const behind = expectedFrom(i) - myThru;
      return { behind, myThru, basis: "ahead", aheadPair: pairs[i] };
    }
  }

  // 2. Fall back to the field.
  const others = pairs.map((_, i) => i).filter(i => i !== myIdx && groupThru(pairs[i]) > 0);
  if (!others.length) return null;
  const vals = others.map(expectedFrom).sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  const median = vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
  return { behind: median - myThru, myThru, basis: "field" };
}

// One-line summary for the play-mode dock: where a team sits and what it would
// take to reach the next bonus tier. Tying the lowest total in a tier is enough,
// since teams on the same total share a bucket.
function describeBonusPosition(board, tid) {
  if (!board) return null;
  const me = board.rows.find(r => r.tid === tid);
  if (!me) return null;
  const better = board.rows.filter(r => r.bonus > me.bonus);
  const target = better.length ? better[better.length - 1] : null;
  return {
    rank: me.rank,
    of: board.rows.length,
    total: me.total,
    thru: me.thru,
    bonus: me.bonus,
    nextBonus: target ? target.bonus : null,
    gap: target ? Math.max(0, target.total - me.total) : 0,
  };
}

// True only once every match in the week has been confirmed by both teams —
// the bonus ranking can still shift until then, even if all scores are in.
function isWeekFullyConfirmed(week, results, schedule=SCHEDULE) {
  const w = schedule[week];
  if (!w?.pairs?.length) return false;
  return w.pairs.every(([ta, tb]) => !!results?.[week]?.[matchKey(week, ta, tb)]?.locked);
}

// Returns true if an entire week was cancelled (all player slots are phantom)
function isWeekCancelled(weekResults) {
  if (!weekResults) return false;
  const recs = Object.values(weekResults);
  if (!recs.length) return false;
  return recs.every(rec =>
    [rec.t1types, rec.t2types].every(types =>
      [0, 1].every(pi => (types || [])[pi] === 'phantom')
    )
  );
}

// ── Full league stats ──────────────────────────────────────────
function calcLeagueStats(results, handicaps, cancelledWeeksIn=null, maxWeek=REGULAR_SEASON_MAX_WEEK, schedule=SCHEDULE, allPlayers=ALL_PLAYERS, teams=TEAMS, loHiOverrides=null) {
  // Team stats: matchPts, bonusPts, totalPts, stab, wins, losses, ties, played
  const teamStats = {};
  for (let t=1;t<=18;t++) teamStats[t] = {matchPts:0,bonusPts:0,totalPts:0,stab:0,wins:0,losses:0,ties:0,played:0};

  // Player stats: rounds[], total (drop 3 lowest at end)
  const playerStats = {};
  allPlayers.forEach(p => {
    playerStats[`${p.tid}-${p.pi}`] = {
      rounds: [],
      name: p.name,
      team: teams[p.tid]?.name || p.team,
      tid: p.tid,
      pi: p.pi,
      playerId: p.playerId,
    };
  });

  for (let w=1; w<=maxWeek; w++) {
    const week = schedule[w];
    if (!week?.pairs?.length) continue;
    if (isWeekCancelled(results[w]) || cancelledWeeksIn?.has(w)) continue; // weather cancellation — no pts

    // Bonus pts for week (null if not all scored)
    const bonus = calcWeekBonus(w, results, handicaps, schedule);

    for (const pair of week.pairs) {
      if (!Array.isArray(pair)) continue;
      const [ta,tb] = pair;
      const key = matchKey(w,ta,tb);
      const rec = results[w]?.[key];
      if (!rec) continue;

      const [tlow,thigh] = ta<tb?[ta,tb]:[tb,ta];
      const totA = computeTeamTotal(rec,0,tlow,handicaps);
      const totB = computeTeamTotal(rec,1,thigh,handicaps);

      teamStats[tlow].stab  += totA;
      teamStats[thigh].stab += totB;
      teamStats[tlow].played++;
      teamStats[thigh].played++;

      // Points: pair by handicap order (lower hcp vs lower hcp, higher vs higher).
      // Some teams list their higher-hcp player as p0 — this corrects the matchup.
      const snap = rec.hcpSnapshot;
      const loHiCtx = { loHiOverrides: loHiOverrides || {}, results, handicaps, hcpOverrides: {}, cancelledWeeks: cancelledWeeksIn };
      const snapRaw = rec.hcpSnapshotRaw;
      const { loPi: piA_lo, hiPi: piA_hi } = getLoHiOrder(tlow, w, loHiCtx, snap, snapRaw);
      const { loPi: piB_lo, hiPi: piB_hi } = getLoHiOrder(thigh, w, loHiCtx, snap, snapRaw);
      const pairings = [{piA:piA_lo,piB:piB_lo},{piA:piA_hi,piB:piB_hi}];
      let winsA=0, winsB=0;
      for (const {piA,piB} of pairings) {
        const pA = computePlayerTotal(rec,0,piA,tlow,handicaps);
        const pB = computePlayerTotal(rec,1,piB,thigh,handicaps);
        if (pA>pB)      { teamStats[tlow].matchPts+=2; winsA++; }
        else if (pB>pA) { teamStats[thigh].matchPts+=2; winsB++; }
        else            { teamStats[tlow].matchPts+=1; teamStats[thigh].matchPts+=1; }
      }
      // Team match result (4 for win, 2 each for tie)
      if (totA>totB)      { teamStats[tlow].matchPts+=4;  teamStats[tlow].wins++;  teamStats[thigh].losses++; }
      else if (totB>totA) { teamStats[thigh].matchPts+=4; teamStats[thigh].wins++; teamStats[tlow].losses++; }
      else                  { teamStats[tlow].matchPts+=2;  teamStats[thigh].matchPts+=2; teamStats[tlow].ties++; teamStats[thigh].ties++; }

      // Bonus pts
      if (bonus) {
        teamStats[tlow].bonusPts  += bonus[tlow]||0;
        teamStats[thigh].bonusPts += bonus[thigh]||0;
      }

      // Player individual totals
      for (let pi=0; pi<2; pi++) {
        const ptA = computePlayerTotal(rec,0,pi,tlow,handicaps);
        const ptB = computePlayerTotal(rec,1,pi,thigh,handicaps);
        playerStats[`${tlow}-${pi}`].rounds.push({week:w,pts:ptA});
        playerStats[`${thigh}-${pi}`].rounds.push({week:w,pts:ptB});
      }
    }
  }

  // Finalize team totals
  for (let t=1;t<=18;t++) {
    teamStats[t].totalPts = teamStats[t].matchPts + teamStats[t].bonusPts;
  }

  // Finalize POTY: drop 3 lowest rounds
  const potyList = Object.values(playerStats).map(p => {
    const sorted = [...p.rounds].sort((a,b)=>a.pts-b.pts);
    const toDrop = sorted.length > 3 ? 3 : 0;
    const kept   = sorted.slice(toDrop);
    const total  = kept.reduce((s,r)=>s+r.pts,0);
    return {...p, total, keptRounds:kept.length, droppedRounds:sorted.slice(0,toDrop)};
  }).sort((a,b)=>b.total-a.total);

  // Weekly POTY: highest individual score per week across all players (through
  // maxWeek — includes the Knockdown when the caller passes a W18-filled schedule)
  const weeklyPoty = {};
  for (let w=1;w<=maxWeek;w++) {
    if (isWeekCancelled(results[w]) || cancelledWeeksIn?.has(w)) continue; // no weekly winner for cancelled weeks
    let best = -Infinity;
    let winners = [];
    allPlayers.forEach(p => {
      const key = matchKey(w, p.tid, getOpponent(p.tid,w,null,schedule)||0);
      // Find which tIdx this player is
      const opp = getOpponent(p.tid, w, null, schedule);
      if (!opp) return;
      const [tlow,thigh] = p.tid<opp?[p.tid,opp]:[opp,p.tid];
      const tIdx = p.tid===tlow?0:1;
      const rec = results[w]?.[matchKey(w,tlow,thigh)];
      if (!rec) return;
      const pts = computePlayerTotal(rec, tIdx, p.pi, p.tid, handicaps);
      if (pts > best) { best=pts; winners=[{...p,pts}]; }
      else if (pts===best) winners.push({...p,pts});
    });
    if (winners.length) weeklyPoty[w] = {pts:best, winners};
  }

  const cancelledWeeks = new Set(cancelledWeeksIn || []);
  for (let w = 1; w <= maxWeek; w++) {
    if (isWeekCancelled(results[w])) cancelledWeeks.add(w);
  }

  return {teamStats, potyList, weeklyPoty, cancelledWeeks};
}

// Highest individual point-getter per week for Weeks 1–maxWeek (incl. the Week 18
// Knockdown), reading whatever matches exist in results — so it covers the
// dynamic knockdown pairings too. Real players only (subs/phantoms can't win the
// weekly). Returns { [week]: {pts, winners:[{tid,pi,pts}]} | {rainout} | {noData} }.
// Ties are all returned in `winners` (the payout is split among them).
function weeklyHighScorers(results, handicaps, cancelledWeeks = null, maxWeek = PLAYOFF_START_WEEK) {
  const out = {};
  for (let w = 1; w <= maxWeek; w++) {
    const wk = results[w] || {};
    if (cancelledWeeks?.has(w) || isWeekCancelled(wk)) { out[w] = { rainout: true }; continue; }
    if (!Object.keys(wk).length) { out[w] = { noData: true }; continue; }
    let best = -Infinity, winners = [];
    for (const mk of Object.keys(wk)) {
      const rec = wk[mk];
      if (!rec) continue;
      const parts = mk.split("-");
      const tlow = parseInt(parts[parts.length - 2]);
      const thigh = parseInt(parts[parts.length - 1]);
      [[0, tlow], [1, thigh]].forEach(([tIdx, tid]) => {
        const types = (tIdx === 0 ? rec.t1types : rec.t2types) || [];
        for (let pi = 0; pi < 2; pi++) {
          if ((types[pi] || "normal") !== "normal") continue;
          const pts = computePlayerTotal(rec, tIdx, pi, tid, handicaps);
          if (!(pts > 0)) continue;
          if (pts > best) { best = pts; winners = [{ tid, pi, pts }]; }
          else if (pts === best) winners.push({ tid, pi, pts });
        }
      });
    }
    out[w] = winners.length ? { pts: best, winners } : { noData: true };
  }
  return out;
}

// ── Default handicaps ──────────────────────────────────────────
function initLeague() {
  const handicaps={}, results={};
  for (let t=1;t<=18;t++) handicaps[t]=[...DEFAULT_HCP[t]];
  for (let w=1;w<=21;w++) results[w]={};
  return {handicaps, results, hcpOverrides:{}, loHiOverrides:{}, seedOverrides:[], budget:{}, dues:{}, cancelledWeeks: new Set(), readOnlyWeeks:[]};
}

// ── Auto-handicap calculation ─────────────────────────────────
// Stagger percentages for returning players (by round number played)
// Calculate the auto handicap for one player given their season gross scores so far.
// grossRounds: array of gross totals in chronological order (round 1 first).
// startHcp: their DEFAULT_HCP value (last season ending hcp).
// Returns: new handicap (integer, capped at startHcp+2).
function calcAutoHcp(grossRounds, startHcp, isNew) {
  const n = grossRounds.length;
  if (n === 0) return isNew ? 0 : startHcp;  // new members start at 0 until round 1

  let avgGross, PCT;

  if (isNew) {
    // New members: 60% for rounds 1-7, then 90% + best 7 from round 8 onwards. No cap.
    if (HCP_ROUNDS && n > HCP_ROUNDS) {
      PCT = 0.90;
      const sorted = [...grossRounds].sort((a, b) => a - b);
      avgGross = sorted.slice(0, HCP_ROUNDS).reduce((s, g) => s + g, 0) / HCP_ROUNDS;
    } else {
      PCT = NEW_MEMBER_HCP_PCT;
      avgGross = grossRounds.reduce((s, g) => s + g, 0) / n;
    }
    return Math.round(PCT * (avgGross - 36));
  }

  // Returning members: flat 90% all rounds
  PCT = 0.90;

  if (n <= 4) {
    avgGross = grossRounds.reduce((s, g) => s + g, 0) / n;
  } else if (HCP_ROUNDS) {
    const sorted = [...grossRounds].sort((a, b) => a - b);
    const best = sorted.slice(0, Math.min(HCP_ROUNDS, n));
    avgGross = best.reduce((s, g) => s + g, 0) / best.length;
  } else {
    // Average ALL rounds
    avgGross = grossRounds.reduce((s, g) => s + g, 0) / n;
  }

  const raw = PCT * (avgGross - 36);
  const rounded = Math.round(raw);
  return HCP_CAP !== null ? Math.min(rounded, startHcp + HCP_CAP) : rounded;
}

// Build per-player gross round history from all saved results up to (not including) a given week.
// Returns: { [tid]: [p1_grosses[], p2_grosses[]] }
function buildGrossHistory(results, upToWeek, defaultHcp=DEFAULT_HCP, cancelledWeeks=null) {
  const history = {};
  for (let t = 1; t <= 18; t++) history[t] = [[], []];

  for (let w = 1; w < upToWeek; w++) {
    if (cancelledWeeks?.has(w)) continue;
    const weekResults = results[w] || {};
    for (const [key, rec] of Object.entries(weekResults)) {
      if (!rec) continue;
      if (rec.w1stab) continue;
      // NOTE: deliberately NOT gated on rec.locked (both teams confirmed). That was
      // tried and reverted 2026-09-12: of the 10 unconfirmed matches in 2026, seven
      // were fully scored rounds that simply never got a confirmation tap, and
      // excluding them moved two players' handicaps for an administrative omission
      // rather than an unsettled score. Every scored round counts.
      const parts = key.split('-');
      const tlow = parseInt(parts[1]);
      const thigh = parseInt(parts[2]);

      [[tlow, rec.t1scores, rec.t1types], [thigh, rec.t2scores, rec.t2types]].forEach(([tid, scores, types]) => {
        if (!scores || !history[tid]) return;
        [0,1].forEach((pi) => {
          const type = (types || [])[pi] || 'normal';
          if (type !== 'normal') return; // skip subs/phantoms
          if (rec.subs && rec.subs[`${tid}-${pi}`]) return; // playing-sub round counts for nobody's handicap
          // Rainout: substitute unplayed holes with earlier hole scores (same as scoring).
          // Cancelled weeks have no records, so they are naturally excluded.
          // Use hcpSnapshot stored with the record for accurate per-hole cap
          const hcp = rec.hcpSnapshot ? (rec.hcpSnapshot[tid] || [0,0])[pi] : (defaultHcp[tid] || [0,0])[pi];
          let gross = 0, holesPlayed = 0;
          for (let hi = 0; hi < 9; hi++) {
            const effHi = (rec.rainout && !((scores[pi] || [])[hi]) && RAINOUT_SUB[hi] !== undefined)
              ? RAINOUT_SUB[hi]
              : hi;
            const raw = (scores[pi] || [])[effHi] || 0;
            if (raw > 0) { gross += Math.min(raw, maxGross(PAR[hi], hcpStr(hcp, SI[hi]))); holesPlayed++; }
          }
          // Only a FULL round counts. calcAutoHcp works off avg gross against par
          // 36, so a part-entered card is read as an extraordinary round: four
          // holes total about 18, and 0.9 * (18 - 36) lands near -16. Mid-round
          // entry is normal, so without this every handicap collapses while a
          // week is being played. Rainout weeks still qualify — unplayed holes
          // are substituted above, so they reach nine.
          if (holesPlayed === 9) history[tid][pi].push(gross);
        });
      });
    }
  }
  return history;
}

// Returns the raw (unrounded) auto handicap — used for tie-breaking low/high order
function calcAutoHcpRaw(grossRounds, startHcp, isNew) {
  const n = grossRounds.length;
  if (n === 0) return isNew ? 0 : startHcp;
  let avgGross, PCT;
  if (isNew) {
    // New members: 60% for rounds 1-7, then 90% + best 7 from round 8 onwards. No cap.
    if (HCP_ROUNDS && n > HCP_ROUNDS) {
      PCT = 0.90;
      const sorted = [...grossRounds].sort((a, b) => a - b);
      avgGross = sorted.slice(0, HCP_ROUNDS).reduce((s, g) => s + g, 0) / HCP_ROUNDS;
    } else {
      PCT = NEW_MEMBER_HCP_PCT;
      avgGross = grossRounds.reduce((s, g) => s + g, 0) / n;
    }
    return PCT * (avgGross - 36);
  }
  PCT = 0.90;
  if (n <= 4) {
    avgGross = grossRounds.reduce((s, g) => s + g, 0) / n;
  } else if (HCP_ROUNDS) {
    const sorted = [...grossRounds].sort((a, b) => a - b);
    const best = sorted.slice(0, Math.min(HCP_ROUNDS, n));
    avgGross = best.reduce((s, g) => s + g, 0) / best.length;
  } else {
    avgGross = grossRounds.reduce((s, g) => s + g, 0) / n;
  }
  const raw = PCT * (avgGross - 36);
  return HCP_CAP !== null ? Math.min(raw, startHcp + HCP_CAP) : raw;
}

// Like getEffectiveHcp but returns unrounded float for tie-breaking
function getEffectiveHcpRaw(tid, pi, week, results, handicaps, hcpOverrides, cancelledWeeks=null, defaultHcp=DEFAULT_HCP, newMemberFn=isNewMember) {
  const overrideKey = `${tid}-${pi}-${week}`;
  if (hcpOverrides && hcpOverrides[overrideKey] !== undefined) return hcpOverrides[overrideKey];
  const hcpBase = (handicaps && Object.keys(handicaps).length) ? handicaps : defaultHcp;
  const history = buildGrossHistory(results, week, hcpBase, cancelledWeeks);
  const startHcp = (hcpBase[tid]||[0,0])[pi];
  return calcAutoHcpRaw(history[tid][pi], startHcp, newMemberFn(tid, pi));
}

// Returns suggested handicaps for all players for a given week (based on prior weeks' scores).
// Returns: { [tid]: [p1hcp, p2hcp] } — same shape as league.handicaps
// Get effective handicap for a player at a given week
// Priority: match hcpSnapshot > hcpOverrides > auto-calc > current handicap
function getEffectiveHcp(tid, pi, week, results, handicaps, hcpOverrides, cancelledWeeks=null, defaultHcp=DEFAULT_HCP, newMemberFn=isNewMember) {
  const overrideKey = `${tid}-${pi}-${week}`;
  if (hcpOverrides && hcpOverrides[overrideKey] !== undefined) return hcpOverrides[overrideKey];
  const hcpBase = (handicaps && Object.keys(handicaps).length) ? handicaps : defaultHcp;
  const history = buildGrossHistory(results, week, hcpBase, cancelledWeeks);
  const startHcp = (hcpBase[tid]||[0,0])[pi];
  return calcAutoHcp(history[tid][pi], startHcp, newMemberFn(tid, pi));
}

// Returns { loPi, hiPi } — the pi index of the low and high HCP player for tid in week.
// Priority: loHiOverrides → hcpSnapshot → getEffectiveHcpRaw
// loHiCtx must have { loHiOverrides, results, handicaps, hcpOverrides, cancelledWeeks? }
// Lower handicap is the low player; a genuine tie falls to p0 (roster order).
const pickLo = (a, b) => (b < a ? 1 : 0);

function getLoHiOrder(tid, week, loHiCtx, hcpSnapshot = null, hcpSnapshotRaw = null) {
  const ov = (loHiCtx.loHiOverrides || {})[`${tid}-${week}`];
  if (ov !== undefined) return { loPi: ov, hiPi: 1 - ov };

  // Precise snapshot, stamped on matches saved from 2027 on. Compared unrounded so
  // a 6.4 and a 6.6 resolve correctly instead of both rounding to 6 and falling to
  // roster order.
  const rawEntry = hcpSnapshotRaw?.[tid] ?? hcpSnapshotRaw?.[String(tid)];
  if (rawEntry) {
    const loPi = pickLo(rawEntry[0] || 0, rawEntry[1] || 0);
    return { loPi, hiPi: 1 - loPi };
  }

  // Legacy snapshot: rounded integers, which is all the spreadsheet-era records
  // carry. Kept as-is so archived seasons keep the pairings they were played and
  // scored with — changing this would rewrite settled standings.
  const snapEntry = hcpSnapshot?.[tid] ?? hcpSnapshot?.[String(tid)];
  if (snapEntry) {
    const loPi = pickLo(Math.round(snapEntry[0] || 0), Math.round(snapEntry[1] || 0));
    return { loPi, hiPi: 1 - loPi };
  }

  // Computed live (week not yet scored) — compare raw, no rounding.
  const cw = loHiCtx.cancelledWeeks || null;
  const r0 = getEffectiveHcpRaw(tid, 0, week, loHiCtx.results, loHiCtx.handicaps, loHiCtx.hcpOverrides || {}, cw);
  const r1 = getEffectiveHcpRaw(tid, 1, week, loHiCtx.results, loHiCtx.handicaps, loHiCtx.hcpOverrides || {}, cw);
  const loPi = pickLo(r0, r1);
  return { loPi, hiPi: 1 - loPi };
}

function calcSuggestedHcps(results, currentWeek, defaultHcp=DEFAULT_HCP, newMemberFn=isNewMember, cancelledWeeks=null) {
  const history = buildGrossHistory(results, currentWeek, defaultHcp, cancelledWeeks);
  const suggested = {};
  for (let t = 1; t <= 18; t++) {
    const startHcps = defaultHcp[t] || [0, 0];
    suggested[t] = [0, 1].map(pi =>
      calcAutoHcp(history[t][pi], startHcps[pi], newMemberFn(t, pi))
    );
  }
  return suggested;
}

// Returns per-week points earned by each team: { [teamId]: { [week]: { matchPts, bonusPts, totalPts } } }
function calcWeeklyTeamPts(results, handicaps, cancelledWeeksIn=null, maxWeek=REGULAR_SEASON_MAX_WEEK, schedule=SCHEDULE, loHiOverrides=null) {
  const weekly = {};
  for (let t = 1; t <= 18; t++) weekly[t] = {};

  for (let w = 1; w <= maxWeek; w++) {
    const week = schedule[w];
    if (!week?.pairs?.length) continue;
    if (isWeekCancelled(results[w]) || cancelledWeeksIn?.has(w)) continue;

    const bonus = calcWeekBonus(w, results, handicaps, schedule);

    for (const pair of week.pairs) {
      if (!Array.isArray(pair)) continue;
      const [ta, tb] = pair;
      const key = matchKey(w, ta, tb);
      const rec = results[w]?.[key];
      if (!rec) continue;

      const [tlow, thigh] = ta < tb ? [ta, tb] : [tb, ta];
      const totA = computeTeamTotal(rec, 0, tlow, handicaps);
      const totB = computeTeamTotal(rec, 1, thigh, handicaps);

      let mA = 0, mB = 0;
      const loHiCtx2 = { loHiOverrides: loHiOverrides || {}, results, handicaps, hcpOverrides: {}, cancelledWeeks: cancelledWeeksIn };
      const { loPi: plo, hiPi: phi } = getLoHiOrder(tlow, w, loHiCtx2, rec.hcpSnapshot, rec.hcpSnapshotRaw);
      const { loPi: qlo, hiPi: qhi } = getLoHiOrder(thigh, w, loHiCtx2, rec.hcpSnapshot, rec.hcpSnapshotRaw);
      for (const {piA, piB} of [{piA:plo,piB:qlo},{piA:phi,piB:qhi}]) {
        const pA = computePlayerTotal(rec, 0, piA, tlow, handicaps);
        const pB = computePlayerTotal(rec, 1, piB, thigh, handicaps);
        if (pA > pB) mA += 2; else if (pB > pA) mB += 2; else { mA += 1; mB += 1; }
      }
      if (totA > totB) mA += 4; else if (totB > totA) mB += 4; else { mA += 2; mB += 2; }

      const bA = bonus ? (bonus[tlow] || 0) : 0;
      const bB = bonus ? (bonus[thigh] || 0) : 0;
      weekly[tlow][w]  = { matchPts: mA, bonusPts: bA, totalPts: mA + bA, stab: totA };
      weekly[thigh][w] = { matchPts: mB, bonusPts: bB, totalPts: mB + bB, stab: totB };
    }
  }
  return weekly;
}

function initMatch() {
  return {
    t1scores:[Array(9).fill(0),Array(9).fill(0)],
    t2scores:[Array(9).fill(0),Array(9).fill(0)],
    t1types:["normal","normal"],
    t2types:["normal","normal"],
    rainout:false, holesPlayed:6,
  };
}


// ── Weekly recap text builder ───────────────────────────────────
// dynPairsByWeek lets the caller supply the seed-based Knockdown/playoff pairings
// for weeks 18-21 (they aren't in the static schedule): { 18:[[a,b]…], 19:…, … }.
function buildWeekRecap(week, results, handicaps, cancelledWeeks=null, loHiOverrides=null, dynPairsByWeek={}, schedule=SCHEDULE, teams=TEAMS, duesInfo=null) {
  const weekInfo = schedule[week];
  const ROUND = { 18: "Knockdown Round", 19: "Quarterfinals", 20: "Semifinals", 21: "Championship" };
  const pairsFor = (w) => (dynPairsByWeek[w]?.length ? dynPairsByWeek[w] : (schedule[w]?.pairs || []));
  if (!weekInfo && !pairsFor(week).length) return "";
  const lines = [];
  const hr = (char="─", len=42) => char.repeat(len);

  lines.push(`PVGC 2026 — ${ROUND[week] ? `${ROUND[week]} (Week ${week})` : `Week ${week}`} Recap${weekInfo?.date ? ` (${weekInfo.date})` : ""}`);
  lines.push(hr("="));
  lines.push("");

  // ── Tee Times ──
  const teeTimes = getTeeTimes(week) || [];
  lines.push("TEE TIMES");
  lines.push(hr());
  pairsFor(week).forEach((pair, i) => {
    if (!Array.isArray(pair)) return;
    const [ta, tb] = pair;
    const [tlow, thigh] = ta < tb ? [ta, tb] : [tb, ta];
    const time = teeTimes[i] || "";
    lines.push(`${time}  ${teams[tlow]?.name || `Team ${tlow}`} vs ${teams[thigh]?.name || `Team ${thigh}`}`);
  });
  lines.push("");

  // ── Match Results ──
  lines.push("MATCH RESULTS");
  lines.push(hr());

  const weekResults = results[week] || {};
  const allPlayerScores = []; // for top scorers

  for (const pair of pairsFor(week)) {
    if (!Array.isArray(pair)) continue;
    const [ta, tb] = pair;
    const [tlow, thigh] = ta < tb ? [ta, tb] : [tb, ta];
    const key = matchKey(week, tlow, thigh);
    const rec = weekResults[key];

    const tAname = teams[tlow]?.name || `Team ${tlow}`;
    const tBname = teams[thigh]?.name || `Team ${thigh}`;
    lines.push(`${tAname}  vs  ${tBname}`);

    if (!rec) {
      lines.push("  (no scores recorded)");
      lines.push("");
      continue;
    }

    // Per-player lines
    for (let tIdx = 0; tIdx < 2; tIdx++) {
      const tid = tIdx === 0 ? tlow : thigh;
      const scores = tIdx === 0 ? rec.t1scores : rec.t2scores;
      const types  = tIdx === 0 ? rec.t1types  : rec.t2types;
      let teamStab = 0;

      for (let pi = 0; pi < 2; pi++) {
        const sub = rec.subs && rec.subs[`${tid}-${pi}`];
        const name = sub && sub.name ? `${sub.name} (sub)` : (teams[tid]?.[pi === 0 ? "p1" : "p2"] || `P${pi+1}`);
        const type = (types || [])[pi] || "normal";
        const hcp  = slotHcp(rec, tid, pi, handicaps);

        if (type === "sub") {
          lines.push(`  ${name}: SUB (6 pts)`);
          teamStab += 6;
          continue;
        }
        if (type === "phantom") {
          lines.push(`  ${name}: PHANTOM (2 pts)`);
          teamStab += 2;
          continue;
        }

        let gross = 0, maxGrossTotal = 0, stab = 0;
        for (let hi = 0; hi < 9; hi++) {
          const effHi = (rec.rainout && !((scores || [[],[]])[pi]?.[hi]) && RAINOUT_SUB[hi] !== undefined) ? RAINOUT_SUB[hi] : hi;
          const g = (scores || [[],[]])[pi]?.[effHi] || 0;
          if (g > 0) {
            const str = hcpStr(hcp, SI[hi]);
            gross += g;
            maxGrossTotal += Math.min(g, maxGross(PAR[hi], str));
            stab += stabPts(g, PAR[hi], str) || 0;
          }
        }
        const scoreStr = gross > 0
          ? (gross !== maxGrossTotal ? `${gross} raw / ${maxGrossTotal} max` : `${gross} raw`)
          : "no score";
        lines.push(`  ${name} (HCP ${hcp}): ${scoreStr} — ${stab} stab`);
        teamStab += stab;
        if (gross > 0) allPlayerScores.push({ name, stab, gross });
      }
      lines.push(`  Team stableford: ${teamStab}`);
      lines.push("");
    }

    // Match outcome
    const totA = computeTeamTotal(rec, 0, tlow, handicaps);
    const totB = computeTeamTotal(rec, 1, thigh, handicaps);
    const pA0 = computePlayerTotal(rec, 0, 0, tlow, handicaps);
    const pA1 = computePlayerTotal(rec, 0, 1, tlow, handicaps);
    const pB0 = computePlayerTotal(rec, 1, 0, thigh, handicaps);
    const pB1 = computePlayerTotal(rec, 1, 1, thigh, handicaps);

    let matchLine = "  Result: ";
    if (totA > totB) matchLine += `${tAname} wins team match`;
    else if (totB > totA) matchLine += `${tBname} wins team match`;
    else matchLine += "Team match tied";
    lines.push(matchLine);

    const ind1 = pA0 > pB0 ? `${teams[tlow]?.p1} wins` : pB0 > pA0 ? `${teams[thigh]?.p1} wins` : "tied";
    const ind2 = pA1 > pB1 ? `${teams[tlow]?.p2} wins` : pB1 > pA1 ? `${teams[thigh]?.p2} wins` : "tied";
    lines.push(`  Individual: Match 1 — ${ind1} (${pA0} vs ${pB0})`);
    lines.push(`              Match 2 — ${ind2} (${pA1} vs ${pB1})`);
    lines.push("");
  }

  // ── Standings ── include the dynamic Knockdown pairing so Week 18 counts
  // (the default schedule has no W18 pairs, and calcLeagueStats otherwise caps
  // at Week 17). Cap at the Knockdown for playoff-week recaps — the QF/SF/Final
  // are a bracket, not standings points.
  const effSchedule = { ...schedule };
  for (const w of Object.keys(dynPairsByWeek || {})) {
    if (dynPairsByWeek[w]?.length) effSchedule[w] = { ...(schedule[w] || {}), pairs: dynPairsByWeek[w] };
  }
  const standingsMax = Math.min(week, PLAYOFF_START_WEEK);
  const stats = calcLeagueStats(results, handicaps, cancelledWeeks, standingsMax, effSchedule, undefined, undefined, loHiOverrides);
  const sorted = Object.entries(stats.teamStats)
    .filter(([,s]) => s.played > 0)
    .sort(([,a],[,b]) => b.totalPts - a.totalPts || b.stab - a.stab);

  lines.push(week >= PLAYOFF_START_WEEK ? "STANDINGS — FINAL SEEDING (THROUGH KNOCKDOWN)" : `STANDINGS AFTER WEEK ${week}`);
  lines.push(hr());
  sorted.forEach(([tid, s], i) => {
    lines.push(`${i+1}. ${teams[tid]?.name || `Team ${tid}`} — ${s.totalPts} pts (W${s.wins} L${s.losses} T${s.ties})`);
  });
  lines.push("");

  // ── Top stableford ──
  if (allPlayerScores.length) {
    allPlayerScores.sort((a, b) => b.stab - a.stab);
    lines.push(`TOP STABLEFORD — WEEK ${week}`);
    lines.push(hr());
    allPlayerScores.slice(0, 5).forEach((p, i) => {
      lines.push(`${i+1}. ${p.name} — ${p.stab} pts`);
    });
    lines.push("");
  }

  // ── Low gross ──
  if (allPlayerScores.length) {
    const byGross = [...allPlayerScores].sort((a, b) => a.gross - b.gross);
    const low = byGross[0].gross;
    const lowPlayers = byGross.filter(p => p.gross === low);
    lines.push(`LOW GROSS — WEEK ${week}`);
    lines.push(hr());
    lowPlayers.forEach(p => {
      lines.push(`${p.name} — ${p.gross} strokes`);
    });
    // also show top 3 if no tie
    if (lowPlayers.length === 1 && byGross.length > 1) {
      byGross.slice(1, 3).forEach((p, i) => {
        lines.push(`${i+2}. ${p.name} — ${p.gross} strokes`);
      });
    }
    lines.push("");
  }

  // ── Sub 40 Club ──
  if (allPlayerScores.length) {
    const sub40 = [...allPlayerScores]
      .filter(p => p.gross <= 40)
      .sort((a, b) => a.gross - b.gross);
    if (sub40.length) {
      lines.push(`SUB 40 CLUB — WEEK ${week}`);
      lines.push(hr());
      sub40.forEach(p => {
        lines.push(`${p.name} — ${p.gross} strokes`);
      });
      lines.push("");
    }
  }

  // ── Next Week Preview (regular schedule OR seed-based Knockdown/playoffs) ──
  const nextWeek = week + 1;
  const nextWeekInfo = schedule[nextWeek];
  const nextPairs = pairsFor(nextWeek);
  if (nextWeek <= 21 && nextPairs.length) {
    const nextTeeTimes = getTeeTimes(nextWeek) || [];
    const nextLabel = ROUND[nextWeek] ? `${ROUND[nextWeek].toUpperCase()} (WEEK ${nextWeek})` : `WEEK ${nextWeek}`;
    lines.push(`${nextLabel} PREVIEW${nextWeekInfo?.date ? ` (${nextWeekInfo.date})` : ""}`);
    lines.push(hr());
    nextPairs.forEach((pair, i) => {
      if (!Array.isArray(pair)) return;
      const [ta, tb] = pair;
      const [tlow, thigh] = ta < tb ? [ta, tb] : [tb, ta];
      const time = nextTeeTimes[i] || "";
      const tAname = teams[tlow]?.name  || `Team ${tlow}`;
      const tBname = teams[thigh]?.name || `Team ${thigh}`;
      lines.push(`${time}  ${tAname} vs ${tBname}`);
      for (const [tid, label] of [[tlow, tAname], [thigh, tBname]]) {
        for (let pi = 0; pi < 2; pi++) {
          const name = teams[tid]?.[pi === 0 ? "p1" : "p2"] || `P${pi+1}`;
          const hcp = getEffectiveHcp(tid, pi, nextWeek, results, handicaps, {}, cancelledWeeks);
          lines.push(`    ${name} (HCP ${hcp})`);
        }
      }
      lines.push("");
    });
  }

  // ── Outstanding Dues ──
  if (duesInfo && duesInfo.dues) {
    const paid = duesInfo.dues || {};
    const exemptSet = new Set((duesInfo.exempt || ["Brian Charles", "Jack Carickhoff", "Karl Dagg"]).map(n => n.trim().toLowerCase()));
    const per = duesInfo.perPlayer || 60;
    const unpaid = [];
    for (let t = 1; t <= 18; t++) for (let pi = 0; pi < 2; pi++) {
      const name = teams[t]?.[pi === 0 ? "p1" : "p2"]; if (!name) continue;
      if (exemptSet.has(name.trim().toLowerCase())) continue;
      if (!paid[`${t}-${pi}`]) unpaid.push(name);
    }
    lines.push(`OUTSTANDING DUES ($${per} each)`);
    lines.push(hr());
    if (!unpaid.length) lines.push("All dues collected — everyone has paid.");
    else {
      lines.push(`${unpaid.length} player${unpaid.length === 1 ? "" : "s"} still owe dues:`);
      unpaid.forEach(n => lines.push(`  • ${n}`));
      lines.push(`  Total outstanding: $${unpaid.length * per}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export {
  getPlayoffSeeds,
  getKnockdownPairs,
  getQFPairs,
  getSFPairs,
  getFinalPairs,
  getOpponent,
  matchKey,
  hcpStr,
  maxGross,
  stabPts,
  computeTeamTotal,
  computePlayerTotal,
  slotHcp,
  slotName,
  isMatchComplete,
  calcWeekBonus,
  isWeekFullyConfirmed,
  rankStandings,
  weeklyHighScorers,
  calcLeagueStats,
  calcWeeklyTeamPts,
  initLeague,
  calcAutoHcp,
  buildGrossHistory,
  getEffectiveHcp,
  getEffectiveHcpRaw,
  getLoHiOrder,
  calcLiveBoard,
  describeBonusPosition,
  calcPace,
  teamThruHoles,
  calcSuggestedHcps,
  initMatch,
  isWeekCancelled,
  getPlayoffWinner,
  getQFSeeds,
  getAllSeeds,
  buildWeekRecap,
};
