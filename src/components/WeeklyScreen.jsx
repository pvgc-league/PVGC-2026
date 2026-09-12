import { useState } from "react";
import { TEAMS, SCHEDULE_RAW, SCHEDULE } from "../constants/league";
import { isWeekFullyConfirmed, isMatchComplete, matchKey } from "../lib/leagueLogic";
import { G, GO, R, M, CREAM, GOLD, CARD2, FD, FB } from "../constants/theme";

const AMBER = "#e6a817";

// Derive list of regular season weeks from schedule, including the
// Week 18 Knockdown round (which also awards stableford points)
const REGULAR_WEEKS = SCHEDULE_RAW
  .filter(([w]) => w <= 18)
  .map(([w, date]) => ({ week: w, date }));

// Find the highest hole (1-based) that has any score entered for a team in a match
function getThruHole(results, week, tid, schedule) {
  const weekInfo = (schedule || SCHEDULE)[week];
  if (!weekInfo) return null;
  const pair = (weekInfo.pairs || []).find(p => Array.isArray(p) && p.includes(tid));
  if (!pair) return null;
  const [ta, tb] = pair;
  const [tlow, thigh] = ta < tb ? [ta, tb] : [tb, ta];
  const mk = `${week}-${tlow}-${thigh}`;
  const rec = results?.[week]?.[mk];
  if (!rec) return null;

  const isThisTlow = tid === tlow;
  const scores = isThisTlow ? rec.t1scores : rec.t2scores;
  if (!scores) return null;

  // Normalize: array-of-arrays or {p0, p1}
  const arr = Array.isArray(scores) ? scores : [scores.p0 || [], scores.p1 || []];
  let maxHole = -1;
  for (const playerScores of arr) {
    if (!Array.isArray(playerScores)) continue;
    for (let h = 8; h >= 0; h--) {
      if ((playerScores[h] || 0) > 0) { maxHole = Math.max(maxHole, h); break; }
    }
  }
  return maxHole >= 0 ? maxHole + 1 : null; // 1-based hole number
}

export default function WeeklyScreen({ weeklyTeamPts, results, cancelledWeeks, schedule }) {
  const pts = weeklyTeamPts || {};

  // Default to most recent week that has data
  const playedWeeks = REGULAR_WEEKS.filter(({ week }) =>
    Object.values(pts).some(t => t[week] !== undefined) || cancelledWeeks?.has(week)
  );
  const defaultWeek = playedWeeks.length ? playedWeeks[playedWeeks.length - 1].week : 1;
  const [selWeek, setSelWeek] = useState(defaultWeek);

  const isCancelled = cancelledWeeks?.has(selWeek);
  const bonusConfirmed = !isCancelled && results ? isWeekFullyConfirmed(selWeek, results) : false;
  // Bonus ranks all 18 teams against each other, so it cannot be computed at all
  // until every match in the week is in — calcWeekBonus returns null before that.
  // Without this the table showed "~0" for everyone, which reads as a calculated
  // zero rather than "not yet available".
  const weekPairs = ((schedule || SCHEDULE)[selWeek]?.pairs || []).filter(Array.isArray);
  const bonusReady = !isCancelled && weekPairs.length > 0 && weekPairs.every(([a, b]) =>
    isMatchComplete(results?.[selWeek]?.[matchKey(selWeek, Math.min(a, b), Math.max(a, b))])
  );
  const matchesIn = weekPairs.filter(([a, b]) =>
    isMatchComplete(results?.[selWeek]?.[matchKey(selWeek, Math.min(a, b), Math.max(a, b))])
  ).length;

  // Build ranked list — include cancelled weeks showing 0 pts
  const weekEntries = isCancelled
    ? Object.keys(TEAMS).map(tid => ({ tid: parseInt(tid), matchPts: 0, bonusPts: 0, totalPts: 0, stab: 0 }))
    : Object.entries(pts)
        .map(([tid, weeks]) => ({ tid: parseInt(tid), ...weeks[selWeek] }))
        .filter(e => e.stab !== undefined)
        .sort((a, b) => b.stab - a.stab);

  const weekInfo = REGULAR_WEEKS.find(w => w.week === selWeek);

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, letterSpacing: "0.02em", marginBottom: "4px" }}>
        Weekly Results
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        Total stableford points earned per team each week
      </div>

      {/* Week picker */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "18px" }}>
        {REGULAR_WEEKS.map(({ week, date }) => {
          const hasData = Object.values(pts).some(t => t[week] !== undefined) || cancelledWeeks?.has(week);
          const isSel = week === selWeek;
          const wasCancelled = cancelledWeeks?.has(week);
          return (
            <button key={week} onClick={() => setSelWeek(week)} disabled={!hasData}
              style={{
                padding: "6px 12px", borderRadius: "8px", fontFamily: FB, fontSize: "13px",
                border: isSel ? `2px solid ${wasCancelled ? "#e6a817" : GOLD}` : `1px solid ${GOLD}33`,
                background: isSel ? (wasCancelled ? "#e6a81722" : GOLD + "22") : hasData ? "rgba(26,61,36,0.06)" : "transparent",
                color: isSel ? (wasCancelled ? "#e6a817" : GOLD) : hasData ? CREAM : M + "55",
                cursor: hasData ? "pointer" : "not-allowed",
                fontWeight: isSel ? 700 : 400,
              }}>
              W{week}{wasCancelled ? " ⛈" : ""}
            </button>
          );
        })}
      </div>

      {isCancelled && (
        <div style={{ background: "rgba(180,120,0,0.1)", border: `1px solid #e6a81744`, borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#e6a817", fontWeight: 600 }}>
          ⛈ Week {selWeek} was cancelled — no points awarded
        </div>
      )}

      {weekEntries.length === 0 ? (
        <div style={{ color: M, fontSize: "14px", textAlign: "center", padding: "40px 0" }}>
          No scores recorded for Week {selWeek} yet.
        </div>
      ) : (
        <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", overflow: "hidden" }}>
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${GOLD}33`,
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <span style={{ fontFamily: FD, fontSize: "16px", color: CREAM }}>Week {selWeek}</span>
            {weekInfo?.date && <span style={{ fontSize: "13px", color: M }}>{weekInfo.date}</span>}
          </div>

          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "32px 1fr 42px 56px 64px",
            padding: "7px 14px", borderBottom: `1px solid ${GOLD}22`,
            background: "rgba(26,61,36,0.05)"
          }}>
            {["#", "Team", "Thru", "Bonus", "Pts"].map((h, i) => (
              <div key={i} style={{
                fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase",
                textAlign: i >= 2 ? "center" : "left"
              }}>{h}</div>
            ))}
          </div>

          {weekEntries.map((e, idx) => {
            const rank = idx + 1;
            const rc = rank === 1 ? GO : rank === 2 ? G : rank === 3 ? CREAM : M;
            const isTop = rank <= 3;
            const thruHole = !isCancelled && results ? getThruHole(results, selWeek, e.tid, schedule) : null;
            const thruLabel = thruHole === 9 ? "F" : thruHole ? `${thruHole}` : "—";
            const thruColor = thruHole === 9 ? G : thruHole ? GOLD : M + "66";
            return (
              <div key={e.tid} style={{
                display: "grid", gridTemplateColumns: "32px 1fr 42px 56px 64px",
                padding: "11px 14px",
                borderBottom: idx < weekEntries.length - 1 ? `1px solid ${GOLD}11` : "none",
                background: rank === 1 && !isCancelled ? GOLD + "08" : "transparent",
                alignItems: "center",
              }}>
                <div style={{ fontSize: "15px", fontWeight: 700, color: isCancelled ? M : rc }}>{isCancelled ? "—" : rank}</div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: isTop && !isCancelled ? 600 : 400, color: isCancelled ? M : isTop ? CREAM : M }}>
                    {TEAMS[e.tid]?.name}
                  </div>
                  <div style={{ fontSize: "11px", color: M, marginTop: "1px" }}>
                    {TEAMS[e.tid]?.p1} · {TEAMS[e.tid]?.p2}
                  </div>
                </div>
                <div style={{ textAlign: "center", fontSize: "13px", fontWeight: 700, color: isCancelled ? M + "66" : thruColor }}>
                  {isCancelled ? "—" : thruLabel}
                </div>
                <div style={{
                  textAlign: "center", fontSize: "13px", fontWeight: 700,
                  color: isCancelled || !bonusReady ? M : bonusConfirmed ? G : AMBER
                }} title={isCancelled ? "" : !bonusReady ? "Not yet available — every match in the week must be complete" : bonusConfirmed ? "Confirmed" : "Estimated — not all teams have confirmed yet"}>
                  {isCancelled || !bonusReady ? "—" : `${bonusConfirmed ? "" : "~"}${e.bonusPts ?? 0}`}
                </div>
                <div style={{
                  textAlign: "center", fontSize: "18px", fontWeight: 700,
                  color: isCancelled ? M : rank === 1 ? GOLD : rank <= 3 ? G : CREAM
                }}>{isCancelled ? "0" : e.stab}</div>
              </div>
            );
          })}

          <div style={{
            padding: "9px 14px", borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: "12px", color: M
          }}>
            {isCancelled ? "Week cancelled — 0 points awarded to all teams" : "Stableford total for both players on the team"}
          </div>
          {!isCancelled && (
            <div style={{
              padding: "0 14px 9px", fontSize: "11px", color: !bonusReady ? M : bonusConfirmed ? M : AMBER, fontWeight: bonusConfirmed || !bonusReady ? 400 : 600
            }}>
              {!bonusReady
                ? `Bonus points need every match in the week — ${matchesIn} of ${weekPairs.length} are complete. They rank all 18 teams, so there is nothing to award until the field is in.`
                : bonusConfirmed
                  ? "✓ Bonus points confirmed — all matches locked in"
                  : "~ Bonus points are estimated until every team this week confirms their score"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
