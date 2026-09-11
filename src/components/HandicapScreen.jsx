import { ALL_PLAYERS, TEAMS, DEFAULT_HCP, isNewMember, HCP_PCT, HCP_CAP, HCP_ROUNDS, NEW_MEMBER_HCP_PCT, RAINOUT_SUB, PAR, SI, SCHEDULE } from "../constants/league";
import { G, GO, R, M, CREAM, GOLD, CARD2, FD, FB } from "../constants/theme";
import { getEffectiveHcp, getEffectiveHcpRaw, getOpponent, matchKey, hcpStr, maxGross } from "../lib/leagueLogic";

function HandicapScreen({ league, saveLeague, isAdmin, schedule = SCHEDULE }) {

  // Build gross score history for a player — caps each hole at max gross for handicap accuracy.
  // Includes the Week 18 Knockdown and the playoff rounds (QF/SF/Final) — opponents
  // are resolved via the passed schedule, which carries the dynamic playoff pairings.
  function getGrossHistory(tid, pi) {
    const grosses = [];
    for (let w = 1; w <= 21; w++) {
      if (league.cancelledWeeks?.has(w)) continue; // exclude admin-cancelled weeks (matches the HCP calc)
      const opp = getOpponent(tid, w, null, schedule);
      if (!opp) continue;
      const mk = matchKey(w, Math.min(tid, opp), Math.max(tid, opp));
      const rec = league.results[w]?.[mk];
      if (!rec || rec.w1stab) continue;
      if (rec.subs && rec.subs[`${tid}-${pi}`]) continue; // a sub played this slot — not this player's round
      const tIdx = tid < opp ? 0 : 1;
      const scores = (tIdx === 0 ? rec.t1scores : rec.t2scores) || [];
      const types  = (tIdx === 0 ? rec.t1types  : rec.t2types)  || [];
      if ((types[pi] || "normal") !== "normal") continue;
      // Use hcpSnapshot for accurate per-hole cap, fall back to current handicap
      const hcp = rec.hcpSnapshot ? (rec.hcpSnapshot[tid] || [0,0])[pi] : (league.handicaps[tid] || [0,0])[pi];
      let g = 0;
      for (let hi = 0; hi < 9; hi++) {
        const effHi = (rec.rainout && !((scores[pi] || [])[hi]) && RAINOUT_SUB[hi] !== undefined)
          ? RAINOUT_SUB[hi]
          : hi;
        const raw = (scores[pi] || [])[effHi] || 0;
        if (raw > 0) g += Math.min(raw, maxGross(PAR[effHi], hcpStr(hcp, SI[effHi])));
      }
      if (g > 0) grosses.push({ week: w, gross: g });
    }
    return grosses;
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM }}>Handicaps</div>
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: isAdmin ? "16px" : "8px" }}>
        9-hole handicaps · Auto-calculated after each round
      </div>
      {!isAdmin && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          background: "#fff3cd", border: "1px solid #e6a81766",
          borderRadius: "8px", padding: "6px 12px", marginBottom: "14px",
          fontSize: "12px", color: "#7a4f00", fontWeight: 600
        }}>
          🔒 Read-only — admin login required to edit handicaps
        </div>
      )}

      {/* Week-by-week table */}
      <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", overflow: "clip" }}>
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "72vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "900px" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${GOLD}33`, background: "rgba(26,61,36,0.07)" }}>
              <td style={{ padding: "9px 12px", fontWeight: 700, color: CREAM, fontSize: "13px", position: "sticky", left: 0, top: 0, background: "rgba(240,236,224,0.98)", zIndex: 3, whiteSpace: "nowrap", borderBottom: `2px solid ${GOLD}33` }}>Player</td>
              <td style={{ padding: "9px 8px", fontWeight: 700, color: M, fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", position: "sticky", top: 0, background: "rgba(240,236,224,0.98)", zIndex: 2, borderBottom: `2px solid ${GOLD}33` }}>Team</td>
              <td style={{ padding: "9px 8px", fontWeight: 700, color: GOLD, fontSize: "12px", textAlign: "center", borderRight: `2px solid ${GOLD}44`, position: "sticky", top: 0, background: "rgba(240,236,224,0.98)", zIndex: 2, borderBottom: `2px solid ${GOLD}33` }}>Start</td>
              {Array.from({ length: 21 }, (_, i) => i + 1).map((w) => {
                const isPlayoff = w >= 19;
                const label = w === 19 ? "QF" : w === 20 ? "SF" : w === 21 ? "F" : `W${w}`;
                return (
                <td key={w} style={{
                  padding: "9px 6px", fontWeight: isPlayoff ? 700 : 600, color: isPlayoff ? GOLD : M, fontSize: "11px",
                  textAlign: "center", letterSpacing: "0.04em",
                  borderRight: w === 18 ? `2px solid ${GOLD}44` : `1px solid ${GOLD}11`,
                  position: "sticky", top: 0, background: "rgba(240,236,224,0.98)", zIndex: 2,
                  borderBottom: `2px solid ${GOLD}33`,
                }}>{label}</td>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ALL_PLAYERS.map((player, rowIdx) => {
              const { tid, pi, name } = player;
              const team = TEAMS[tid];
              const startHcp = (league.handicaps[tid] || DEFAULT_HCP[tid] || [0, 0])[pi];
              const isNew = isNewMember(tid, pi);
              const isEvenRow = rowIdx % 2 === 0;
              const isNewTeam = rowIdx > 0 && ALL_PLAYERS[rowIdx - 1].tid !== tid;
              return (
                <tr key={`${tid}-${pi}`} style={{
                  borderTop: isNewTeam ? `2px solid ${GOLD}33` : `1px solid ${GOLD}11`,
                  background: isEvenRow ? "transparent" : "rgba(26,61,36,0.02)",
                }}>
                  <td style={{
                    padding: "8px 12px", fontWeight: 600, color: CREAM,
                    position: "sticky", left: 0,
                    background: isEvenRow ? "rgba(240,236,224,0.98)" : "rgba(235,231,218,0.98)",
                    zIndex: 1, whiteSpace: "nowrap",
                  }}>
                    {name}
                    {isNew && (
                      <span style={{ marginLeft: "5px", fontSize: "10px", color: "#f0a050", border: "1px solid #f0a05055", borderRadius: "3px", padding: "1px 4px" }}>New</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 8px", color: M, fontSize: "12px", whiteSpace: "nowrap" }}>{team?.name}</td>
                  <td style={{ padding: "4px 6px", textAlign: "center", borderRight: `2px solid ${GOLD}44` }}>
                    {isAdmin ? (
                      <input
                        type="number" min="0" max="36"
                        value={startHcp}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          if (isNaN(v)) return;
                          const next = { ...league, handicaps: { ...league.handicaps } };
                          next.handicaps[tid] = [...(league.handicaps[tid] || DEFAULT_HCP[tid] || [0,0])];
                          next.handicaps[tid][pi] = v;
                          saveLeague(next);
                        }}
                        style={{
                          width: "42px", height: "30px", textAlign: "center",
                          background: "#fff8e6", border: `1px solid ${GOLD}88`,
                          borderRadius: "5px", color: GOLD, fontWeight: 700,
                          fontSize: "14px", fontFamily: FB, outline: "none",
                          MozAppearance: "textfield", appearance: "textfield",
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: "14px", fontWeight: 700, color: GOLD }}>{startHcp}</span>
                    )}
                  </td>
                  {Array.from({ length: 21 }, (_, i) => i + 1).map((w) => {
                    const autoHcp = getEffectiveHcp(tid, pi, w, league.results, league.handicaps, {}, league.cancelledWeeks);
                    const rawHcp  = getEffectiveHcpRaw(tid, pi, w, league.results, league.handicaps, {}, league.cancelledWeeks);
                    const overrideKey = `${tid}-${pi}-${w}`;
                    const override = (league.hcpOverrides || {})[overrideKey];
                    const opp = getOpponent(tid, w, null, schedule);
                    const mk = opp ? matchKey(w, Math.min(tid, opp), Math.max(tid, opp)) : null;
                    const rec = mk ? league.results[w]?.[mk] : null;
                    const played = !!rec;
                    const isRainout = rec?.rainout;
                    const tIdx = opp && tid < opp ? 0 : 1;
                    const scores = rec ? (tIdx === 0 ? rec.t1scores : rec.t2scores) : null;
                    const gross = scores ? (() => {
                      const hcp = rec?.hcpSnapshot ? (rec.hcpSnapshot[tid] || [0,0])[pi] : (league.handicaps[tid] || [0,0])[pi];
                      let g = 0;
                      for (let hi = 0; hi < 9; hi++) {
                        const effHi = (rec.rainout && hi >= rec.holesPlayed && RAINOUT_SUB[hi] !== undefined) ? RAINOUT_SUB[hi] : hi;
                        const raw = (scores[pi] || [])[effHi] || 0;
                        if (raw > 0) g += Math.min(raw, maxGross(PAR[effHi], hcpStr(hcp, SI[effHi])));
                      }
                      return g;
                    })() : 0;
                    const prevPlayed = w === 1 || (() => {
                      const prevOpp = getOpponent(tid, w - 1, null, schedule);
                      return prevOpp && !!league.results[w - 1]?.[matchKey(w - 1, Math.min(tid, prevOpp), Math.max(tid, prevOpp))];
                    })();
                    const showHcp = w === 1 || played || prevPlayed;

                    return (
                      <td key={w} style={{
                        padding: "3px 4px", textAlign: "center", verticalAlign: "middle",
                        borderRight: w === 18 ? `2px solid ${GOLD}44` : `1px solid ${GOLD}11`,
                      }}>
                        {showHcp ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
                            {isAdmin ? (
                              <input
                                type="number"
                                min="-9"
                                max={isNew ? 99 : startHcp + (HCP_CAP ?? 99)}
                                value={override !== undefined ? override : autoHcp}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const next = { ...league, hcpOverrides: { ...(league.hcpOverrides || {}) } };
                                  if (v === "") delete next.hcpOverrides[overrideKey];
                                  else next.hcpOverrides[overrideKey] = parseInt(v) || 0;
                                  saveLeague(next);
                                }}
                                style={{
                                  width: "36px", height: "26px", textAlign: "center",
                                  background: override !== undefined ? "#fff8e6" : "transparent",
                                  border: override !== undefined ? `1px solid ${GOLD}88` : "1px solid transparent",
                                  borderRadius: "4px",
                                  color: override !== undefined ? GOLD : G,
                                  fontWeight: 600, fontSize: "13px", fontFamily: FB,
                                  outline: "none", MozAppearance: "textfield", appearance: "textfield",
                                }}
                              />
                            ) : (
                              <span style={{
                                fontSize: "13px", fontWeight: 600,
                                color: override !== undefined ? GOLD : G,
                              }}>{override !== undefined ? override : autoHcp}</span>
                            )}
                            {override === undefined && (
                              <span style={{ fontSize: "9px", color: "#aaa", lineHeight: 1 }}>{rawHcp.toFixed(2)}</span>
                            )}
                            {played && (gross > 0 ? (
                              <span style={{ fontSize: "10px", color: isRainout ? GO : M }}>
                                {gross}{isRainout ? "R" : ""}
                              </span>
                            ) : isRainout ? (
                              <span style={{ fontSize: "9px", color: GO, fontWeight: 600 }}>R</span>
                            ) : null)}
                          </div>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: "12px" }}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>

      <div style={{ marginTop: "10px", fontSize: "12px", color: M, display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <span><span style={{ color: G, fontWeight: 700 }}>Green</span> = auto HCP</span>
        <span><span style={{ color: GOLD, fontWeight: 700 }}>Gold</span> = overridden (click any cell to edit)</span>
        <span style={{ color: "#aaa", fontSize: "11px" }}>Small decimal = raw unrounded HCP (for lo/hi tiebreaking)</span>
        <span>Small number = gross score shot</span>
        <span><span style={{ color: GO, fontWeight: 700 }}>R</span> = rainout</span>
        <span><span style={{ color: "#ccc" }}>—</span> = not yet reached</span>
        <span style={{ color: GOLD }}><strong>QF / SF / F</strong> = handicap going into each playoff round (updates after the prior round)</span>
      </div>

      {/* ── Calculation Breakdown ── */}
      <div style={{ marginTop: "28px" }}>
        <div style={{ fontFamily: FD, fontSize: "22px", color: CREAM, marginBottom: "6px" }}>How Handicaps Are Calculated</div>
        <div style={{
          background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "10px",
          padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: M, lineHeight: 1.6
        }}>
          <strong style={{ color: CREAM }}>Formula:</strong> <code style={{ color: G }}>round(PCT × (avg gross − 36))</code>
          {HCP_CAP != null && ` · capped at start HCP + ${HCP_CAP} for returning members`}
          <div style={{ marginTop: "6px", display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <span><strong style={{ color: CREAM }}>Veterans:</strong> 90%{HCP_ROUNDS ? ` of avg of best ${HCP_ROUNDS} scores` : ""}</span>
            <span><strong style={{ color: "#f0a050" }}>New members:</strong> {Math.round(NEW_MEMBER_HCP_PCT * 100)}% rounds 1–{HCP_ROUNDS}, then 90% of best {HCP_ROUNDS} from round {HCP_ROUNDS + 1}+, no cap</span>
          </div>
        </div>

        <div style={{ overflowX: "auto", background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${GOLD}33`, background: "rgba(26,61,36,0.06)", fontSize: "11px", color: M, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>Player</td>
                <td style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>Team</td>
                <td style={{ padding: "8px 8px", textAlign: "center" }}>Rounds</td>
                <td style={{ padding: "8px 8px", textAlign: "center" }}>PCT</td>
                <td style={{ padding: "8px 8px", textAlign: "center" }}>Scores used</td>
                <td style={{ padding: "8px 8px", textAlign: "center" }}>Avg</td>
                <td style={{ padding: "8px 8px", textAlign: "center" }}>Formula</td>
                <td style={{ padding: "8px 8px", textAlign: "center" }}>HCP</td>
              </tr>
            </thead>
            <tbody>
              {ALL_PLAYERS.map((player, rowIdx) => {
                const { tid, pi, name } = player;
                const isNew = isNewMember(tid, pi);
                const startHcp = (league.handicaps[tid] || DEFAULT_HCP[tid] || [0, 0])[pi];
                const history = getGrossHistory(tid, pi);
                const n = history.length;
                const isEvenRow = rowIdx % 2 === 0;

                if (n === 0) {
                  return (
                    <tr key={`${tid}-${pi}`} style={{ borderBottom: `1px solid ${GOLD}11`, background: isEvenRow ? "transparent" : "rgba(26,61,36,0.02)" }}>
                      <td style={{ padding: "7px 12px", fontWeight: 600, color: CREAM, whiteSpace: "nowrap" }}>{name}</td>
                      <td style={{ padding: "7px 8px", color: M, fontSize: "12px" }}>{TEAMS[tid]?.name}</td>
                      <td colSpan={6} style={{ padding: "7px 8px", color: "#ccc", fontSize: "12px", textAlign: "center" }}>No rounds played yet — using start HCP {startHcp}</td>
                    </tr>
                  );
                }

                const pct = isNew ? (HCP_ROUNDS && n > HCP_ROUNDS ? 0.90 : NEW_MEMBER_HCP_PCT) : 0.90;
                const pctLabel = `${Math.round(pct * 100)}%`;
                let scoresUsed, avgGross;
                const useBest = HCP_ROUNDS && n > (isNew ? HCP_ROUNDS : 4);
                if (useBest) {
                  const sorted = [...history].sort((a, b) => a.gross - b.gross);
                  const best = sorted.slice(0, Math.min(HCP_ROUNDS, n));
                  scoresUsed = best.map(h => h.gross);
                  avgGross = scoresUsed.reduce((s, g) => s + g, 0) / scoresUsed.length;
                } else {
                  scoresUsed = history.map(h => h.gross);
                  avgGross = scoresUsed.reduce((s, g) => s + g, 0) / n;
                }
                const raw = pct * (avgGross - 36);
                const cap = HCP_CAP != null ? startHcp + HCP_CAP : Infinity;
                const calcHcp = isNew ? Math.round(raw) : Math.min(Math.round(raw), cap);
                const capped = !isNew && HCP_CAP != null && Math.round(raw) > cap;

                return (
                  <tr key={`${tid}-${pi}`} style={{ borderBottom: `1px solid ${GOLD}11`, background: isEvenRow ? "transparent" : "rgba(26,61,36,0.02)" }}>
                    <td style={{ padding: "7px 12px", fontWeight: 600, color: CREAM, whiteSpace: "nowrap" }}>
                      {name}{isNew && <span style={{ marginLeft: "5px", fontSize: "10px", color: "#f0a050", border: "1px solid #f0a05055", borderRadius: "3px", padding: "1px 4px" }}>New</span>}
                    </td>
                    <td style={{ padding: "7px 8px", color: M, fontSize: "12px", whiteSpace: "nowrap" }}>{TEAMS[tid]?.name}</td>
                    <td style={{ padding: "7px 8px", textAlign: "center", color: M }}>{n}</td>
                    <td style={{ padding: "7px 8px", textAlign: "center", fontWeight: 700, color: G }}>{pctLabel}</td>
                    <td style={{ padding: "7px 8px", textAlign: "center", color: M, fontSize: "12px" }}>
                      {scoresUsed.join(", ")}
                      {HCP_ROUNDS && n > HCP_ROUNDS && <span style={{ color: "#aaa", fontSize: "11px" }}> (best {scoresUsed.length} of {n})</span>}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "center", color: CREAM, fontWeight: 600 }}>{avgGross.toFixed(2)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "center", color: M, fontSize: "12px", whiteSpace: "nowrap" }}>
                      {pctLabel} × ({avgGross.toFixed(2)} − 36) = {raw.toFixed(2)}
                      {capped && <span style={{ color: GO }}> → capped</span>}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "center" }}>
                      <span style={{ fontWeight: 700, color: G, fontSize: "15px" }}>{calcHcp}</span>
                      <div style={{ fontSize: "10px", color: "#aaa" }}>{raw.toFixed(2)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default HandicapScreen;
