import React, { useState, useEffect, useRef } from "react";
import { SCHEDULE_RAW, TEAMS, getTeeTimes, SEASON_YEAR, PAR, SI } from "../constants/league";
import * as L2026 from "../constants/league_2026";
import { G, GO, M, CREAM, GOLD, CARD, FB, FD, R } from "../constants/theme";
import { fmtDate } from "../lib/format";
import { exportStandings, exportHandicaps, exportScores } from "../lib/exportUtils";
import { matchKey, getOpponent, buildWeekRecap, stabPts, hcpStr } from "../lib/leagueLogic";
import { Tag } from "./ui";
import BudgetScreen from "./BudgetScreen";

function AccordionSection({ id, open, onToggle, title, icon, badge, hint, danger, children }) {
  const accent = danger ? R : GOLD;
  return (
    <div style={{
      background: CARD, border: `1px solid ${accent}33`,
      borderRadius: "14px", marginBottom: "10px", overflow: "hidden",
    }}>
      <button
        onClick={() => onToggle(id)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "14px 18px", display: "flex", alignItems: "center", gap: "10px",
          textAlign: "left",
        }}
      >
        {icon && <span style={{ fontSize: "15px", flexShrink: 0 }}>{icon}</span>}
        <span style={{ flex: 1, fontSize: "13px", fontWeight: 700, color: danger ? R + "cc" : CREAM, letterSpacing: "0.02em" }}>
          {title}
        </span>
        {badge != null && (
          <span style={{
            fontSize: "11px", fontWeight: 600, padding: "2px 8px",
            borderRadius: "5px", background: accent + "22", color: accent,
            border: `1px solid ${accent}44`, flexShrink: 0,
          }}>{badge}</span>
        )}
        {!open && hint && (
          <span style={{ fontSize: "11px", color: M, flexShrink: 0 }}>{hint}</span>
        )}
        <span style={{ fontSize: "11px", color: M, flexShrink: 0, marginLeft: "2px" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "4px 18px 18px", borderTop: `1px solid ${accent}22` }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Add future year modules here as they become available
const PRINT_SCHEDULES = {
  2026: { scheduleRaw: L2026.SCHEDULE_RAW, getTeeTimes: L2026.getTeeTimes, teams: L2026.TEAMS },
};

function printStarterSheet(week, pairs, teeTimes, schedRaw, teams, allSlots, roundLabel) {
  const dateStr = fmtDate(schedRaw.find(r => r[0] === week)?.[1]) || "";
  const chk = `<span style="display:inline-block;width:14px;height:14px;border:1.5px solid #333;border-radius:2px;margin-right:4px;vertical-align:middle"></span>`;
  // Map each match to its tee time, then render every slot — filled matches + blank "open" rows.
  const byTime = {};
  pairs.forEach((p, i) => { const t = teeTimes[i]; if (t && Array.isArray(p)) byTime[t] = p; });
  const slots = (allSlots && allSlots.length) ? [...allSlots] : [...teeTimes];
  teeTimes.forEach(t => { if (t && !slots.includes(t)) slots.push(t); }); // never drop a scheduled match
  const rows = slots.map((time, i) => {
    const bg = i % 2 === 0 ? "background:#f9f9f9" : "background:#fff";
    const pr = byTime[time];
    if (!pr) {
      return `<tr style="${bg}">
      <td style="padding:11px 10px;font-weight:700;font-size:13px;white-space:nowrap;border-right:2px solid #ccc">${time}</td>
      <td colspan="2" style="padding:11px 12px;border-right:2px solid #ccc">
        <div style="font-size:10px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:8px">Open · League Play</div>
        <div style="display:flex;gap:18px">
          <div style="flex:1"><div style="border-bottom:1px solid #bbb;height:17px;margin-bottom:7px"></div><div style="border-bottom:1px solid #bbb;height:17px"></div></div>
          <div style="flex:1"><div style="border-bottom:1px solid #bbb;height:17px;margin-bottom:7px"></div><div style="border-bottom:1px solid #bbb;height:17px"></div></div>
        </div>
      </td>
      <td style="padding:8px 10px;min-width:120px"><div style="border-bottom:1px solid #ccc;height:14px;margin-bottom:4px"></div><div style="border-bottom:1px solid #ccc;height:14px"></div></td>
    </tr>`;
    }
    const [ta, tb] = pr;
    const t1 = teams[ta] || {};
    const t2 = teams[tb] || {};
    return `<tr style="${bg}">
      <td style="padding:8px 10px;font-weight:700;font-size:13px;white-space:nowrap;border-right:2px solid #ccc">${time}</td>
      <td style="padding:8px 10px;border-right:1px solid #ddd">
        <div style="font-weight:700;font-size:12px;color:#1e4d2b;margin-bottom:4px">T${ta} · ${t1.name || ""}</div>
        <div style="font-size:12px">${chk}${t1.p1 || "—"}</div>
        <div style="font-size:12px;margin-top:3px">${chk}${t1.p2 || "—"}</div>
      </td>
      <td style="padding:8px 10px;border-right:2px solid #ccc">
        <div style="font-weight:700;font-size:12px;color:#8a3a00;margin-bottom:4px">T${tb} · ${t2.name || ""}</div>
        <div style="font-size:12px">${chk}${t2.p1 || "—"}</div>
        <div style="font-size:12px;margin-top:3px">${chk}${t2.p2 || "—"}</div>
      </td>
      <td style="padding:8px 10px;min-width:120px">
        <div style="font-size:10px;color:#999;margin-bottom:4px">Notes / Subs</div>
        <div style="border-bottom:1px solid #ccc;height:14px;margin-bottom:4px"></div>
        <div style="border-bottom:1px solid #ccc;height:14px"></div>
      </td>
    </tr>`;
  });
  const title = roundLabel ? `${roundLabel} — Week ${week}` : `Week ${week}`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>PVGC ${title} Starter Sheet</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;color:#111;background:#fff;padding:16px 20px}
h1{font-size:16px;font-weight:700;margin-bottom:2px}
.sub{font-size:12px;color:#555;margin-bottom:12px}
table{width:100%;border-collapse:collapse;border:1.5px solid #999}
th{background:#1e4d2b;color:#fff;padding:7px 10px;font-size:11px;font-weight:600;text-align:left;border-right:1px solid #2e6d3b}
tr{border-bottom:1.5px solid #ccc}
.footer{margin-top:14px;font-size:11px;color:#666;display:flex;justify-content:space-between}
.footer-line{border-top:1px solid #bbb;padding-top:4px;min-width:160px}
@media print{body{padding:8px};@page{size:portrait;margin:12mm}}
</style></head><body>
<h1>⛳ PVGC Golf League — ${title} Starter Sheet</h1>
<div class="sub">${dateStr ? dateStr + " &nbsp;·&nbsp; " : ""}First tee 4:10 PM &nbsp;·&nbsp; QF groups shaded; blank rows are open for league play</div>
<table>
  <thead>
    <tr>
      <th style="width:80px">Tee Time</th>
      <th style="width:37%">Team (Home)</th>
      <th style="width:37%">Team (Away)</th>
      <th>Notes / Subs</th>
    </tr>
  </thead>
  <tbody>${rows.join("")}</tbody>
</table>
<div class="footer">
  <div class="footer-line">Weather: _______________________</div>
  <div class="footer-line">Groups out: ______ / ${slots.length}</div>
</div>
</body></html>`;

  const w = window.open("", "_blank", "width=820,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

// ── Round Replay helpers ─────────────────────────────────────────────────────

const REPLAY_COLORS = ["#1a6b3a", "#52b57a", "#b8600a", "#e8a060"];

function normScoresR(s) {
  if (!s) return [[], []];
  if (Array.isArray(s)) return s;
  return [s.p0 || [], s.p1 || []];
}

function RaceChart({ series }) {
  const [hoverHole, setHoverHole] = useState(null);
  const svgRef = useRef(null);

  const VW = 500, VH = 155;
  const pL = 26, pR = 14, pT = 12, pB = 22;
  const cW = VW - pL - pR, cH = VH - pT - pB;
  const maxV = Math.max(...series.flatMap(s => s.cum.filter(v => v != null)), 5);
  const yMax = Math.ceil(maxV / 5) * 5;
  const xOf = i => pL + (i / 9) * cW;
  const yOf = v => pT + cH - (v / yMax) * cH;
  const gridVals = [];
  for (let v = 0; v <= yMax; v += 5) gridVals.push(v);

  const pickHole = (clientX) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = ((clientX - rect.left) / rect.width * VW - pL) / cW * 9;
    setHoverHole(Math.round(Math.max(0, Math.min(9, frac))));
  };

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%", display: "block", cursor: "crosshair" }}
        onMouseMove={e => pickHole(e.clientX)}
        onMouseLeave={() => setHoverHole(null)}
        onTouchMove={e => { e.preventDefault(); pickHole(e.touches[0].clientX); }}
        onTouchEnd={() => setHoverHole(null)}
      >
        {gridVals.map(v => (
          <g key={v}>
            <line x1={pL} x2={VW - pR} y1={yOf(v)} y2={yOf(v)}
              stroke={v === 0 ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.05)"}
              strokeWidth="1" strokeDasharray={v > 0 ? "3 3" : ""} />
            <text x={pL - 3} y={yOf(v) + 3.5} textAnchor="end" fontSize="8" fill="#9aaa9a">{v}</text>
          </g>
        ))}
        <text x={xOf(0)} y={VH - 4} textAnchor="middle" fontSize="8.5" fill="#b0c0b0">S</text>
        {[1,2,3,4,5,6,7,8,9].map(h => (
          <text key={h} x={xOf(h)} y={VH - 4} textAnchor="middle" fontSize="8.5"
            fill={hoverHole === h ? "#1a2e1a" : "#8a9a8a"} fontWeight={hoverHole === h ? "700" : "400"}>{h}</text>
        ))}
        {series.map((s, si) => {
          const validPts = s.cum.map((v, i) => v != null ? `${xOf(i)},${yOf(v)}` : null).filter(Boolean);
          return (
            <g key={si}>
              <polyline points={validPts.join(" ")} fill="none" stroke={s.color}
                strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
                opacity={hoverHole != null ? 0.5 : 0.9} />
              {s.cum.map((v, i) => {
                if (i === 0 || v == null) return null;
                const isHovered = hoverHole === i;
                return (
                  <circle key={i} cx={xOf(i)} cy={yOf(v)} r={isHovered ? 5 : 2.8}
                    fill={s.color} stroke={isHovered ? "white" : "none"}
                    strokeWidth={isHovered ? 1.5 : 0}
                    style={{ transition: "r 0.1s" }} />
                );
              })}
            </g>
          );
        })}
        {hoverHole != null && hoverHole > 0 && (
          <line x1={xOf(hoverHole)} x2={xOf(hoverHole)} y1={pT} y2={VH - pB}
            stroke="rgba(0,0,0,0.18)" strokeWidth="1" strokeDasharray="3 2" />
        )}
      </svg>

      {/* Tooltip */}
      {hoverHole != null && hoverHole > 0 && (
        <div style={{
          position: "absolute", top: "6px",
          ...(hoverHole > 5 ? { left: "32px" } : { right: "16px" }),
          background: "rgba(255,255,255,0.97)",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: "8px", padding: "7px 10px",
          fontSize: "11px", pointerEvents: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)", zIndex: 10, minWidth: "140px",
        }}>
          <div style={{ fontWeight: 700, color: "#4a6a52", marginBottom: "5px", fontSize: "12px" }}>
            Hole {hoverHole} · Par {PAR[hoverHole - 1]}
          </div>
          {series.map((s, si) => {
            const cumV = s.cum[hoverHole] ?? 0;
            const holeV = (s.cum[hoverHole] ?? 0) - (s.cum[hoverHole - 1] ?? 0);
            return (
              <div key={si} style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: si < series.length - 1 ? "3px" : 0 }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "1.5px", background: s.color, flexShrink: 0 }} />
                <span style={{ color: "#1a2e1a", flex: 1, fontSize: "11px" }}>{s.name}</span>
                <span style={{ fontWeight: 700, color: s.color }}>{cumV}</span>
                <span style={{ color: "#9aaa9a", fontSize: "10px", minWidth: "24px", textAlign: "right" }}>
                  {holeV > 0 ? `+${holeV}` : holeV === 0 ? "—" : holeV}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const REPLAY_WEEK_LABEL = { 18: "Knockdown", 19: "Quarterfinals", 20: "Semifinals", 21: "Finals" };

function RoundReplayPanel({ league, initialWeek, initialTeam, dynPairsFor }) {
  const [week, setWeek] = useState(initialWeek || 1);
  const [team, setTeam] = useState(initialTeam || 1);
  const [playHole, setPlayHole] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    setPlayHole(0); setPlaying(false); clearTimeout(timerRef.current);
  }, [week, team]);

  useEffect(() => {
    if (!playing) return;
    if (playHole >= 9) { setPlaying(false); return; }
    timerRef.current = setTimeout(() => setPlayHole(h => h + 1), 1100);
    return () => clearTimeout(timerRef.current);
  }, [playing, playHole]);

  const doPlay = () => {
    if (playing) { setPlaying(false); return; }
    if (playHole >= 9) setPlayHole(0);
    setPlaying(true);
  };
  const doNext = () => { setPlaying(false); setPlayHole(h => Math.min(9, h + 1)); };
  const doReset = () => { setPlaying(false); setPlayHole(0); };

  const weeksWithData = [];
  for (let w = 1; w <= 21; w++) { // include Knockdown (18) + playoffs (19-21)
    if (league?.results?.[w] && Object.keys(league.results[w]).length > 0) weeksWithData.push(w);
  }
  const opp = getOpponent(team, week, dynPairsFor ? dynPairsFor(week) : undefined);
  const tlow = opp ? Math.min(team, opp) : 0;
  const thigh = opp ? Math.max(team, opp) : 0;
  const mk = tlow && thigh ? matchKey(week, tlow, thigh) : null;
  const rec = mk ? (league?.results?.[week]?.[mk] || null) : null;

  let players = null;
  if (rec) {
    const t1s = normScoresR(rec.t1scores);
    const t2s = normScoresR(rec.t2scores);
    const t1types = rec.t1types || ["normal","normal"];
    const t2types = rec.t2types || ["normal","normal"];
    const snap = rec.hcpSnapshot || {};
    players = [tlow, tlow, thigh, thigh].map((tid, idx) => {
      const pi = idx % 2;
      const td = TEAMS[tid];
      const name = pi === 0 ? td?.p1 : td?.p2;
      const hcp = (snap[tid] || league?.handicaps?.[tid] || [0,0])[pi] || 0;
      const type = (idx < 2 ? t1types : t2types)[pi] || "normal";
      const gross = (idx < 2 ? t1s : t2s)[pi] || [];
      const fixedPts = type === "sub" ? 6 : type === "phantom" ? 2 : null;
      let cumPts = 0;
      const cum = [0];
      const holeStab = [];
      if (fixedPts != null) {
        for (let hi = 0; hi < 9; hi++) { holeStab.push({ special: type }); cum.push(fixedPts); }
        cumPts = fixedPts;
      } else {
        for (let hi = 0; hi < 9; hi++) {
          const g = gross[hi] || 0;
          if (!g) { holeStab.push(null); cum.push(cumPts); }
          else { const pts = stabPts(g, PAR[hi], hcpStr(hcp, SI[hi])) || 0; holeStab.push({ pts, gross: g }); cumPts += pts; cum.push(cumPts); }
        }
      }
      return { name, hcp, type, holeStab, cum, total: cumPts, color: REPLAY_COLORS[idx], isFixed: fixedPts != null };
    });
  }

  const cellBg = pts => pts == null ? "transparent" : pts === 0 ? "#fce8e8" : pts === 1 ? "rgba(0,0,0,0.02)" : pts === 2 ? "#e8f5e8" : "#c8eec8";
  const cellFg = pts => pts >= 2 ? G : pts === 0 ? R : M;

  const teamSeries = players ? [
    { name: TEAMS[tlow]?.name || `Team ${tlow}`, color: REPLAY_COLORS[0],
      cum: Array.from({length: 10}, (_, i) => players[0].cum[i] + players[1].cum[i]),
      total: players[0].total + players[1].total },
    { name: TEAMS[thigh]?.name || `Team ${thigh}`, color: REPLAY_COLORS[2],
      cum: Array.from({length: 10}, (_, i) => players[2].cum[i] + players[3].cum[i]),
      total: players[2].total + players[3].total },
  ] : null;
  const visibleTeamSeries = teamSeries?.map(t => ({ ...t, cum: t.cum.slice(0, playHole + 1) }));

  const ctrlBtn = { padding: "6px 14px", borderRadius: "7px", border: `1px solid ${GOLD}44`, background: "transparent", color: CREAM, fontFamily: FB, fontSize: "12px", fontWeight: 600, cursor: "pointer" };

  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
        <div>
          <div style={{ fontSize: "11px", color: M, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px", fontWeight: 600 }}>Week</div>
          <select value={week} onChange={e => setWeek(parseInt(e.target.value))}
            style={{ padding: "7px 10px", borderRadius: "8px", border: `1px solid ${GOLD}44`, background: CARD, color: CREAM, fontFamily: FB, fontSize: "13px", cursor: "pointer", outline: "none" }}>
            {(weeksWithData.length ? weeksWithData : Array.from({length:21},(_,i)=>i+1)).map(w => (
              <option key={w} value={w}>{REPLAY_WEEK_LABEL[w] || `Week ${w}`}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: M, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px", fontWeight: 600 }}>Team</div>
          <select value={team} onChange={e => setTeam(parseInt(e.target.value))}
            style={{ padding: "7px 10px", borderRadius: "8px", border: `1px solid ${GOLD}44`, background: CARD, color: CREAM, fontFamily: FB, fontSize: "13px", cursor: "pointer", outline: "none" }}>
            {Array.from({length:18},(_,i)=>i+1).map(t => (
              <option key={t} value={t}>{TEAMS[t]?.name || `Team ${t}`}</option>
            ))}
          </select>
        </div>
      </div>

      {!rec ? (
        <div style={{ textAlign: "center", color: M, fontSize: "13px", padding: "20px 0" }}>
          No match data for Week {week} · {TEAMS[team]?.name || `Team ${team}`}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "12px", alignItems: "center" }}>
            {teamSeries.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: t.color }} />
                <span style={{ fontSize: "12px", fontWeight: 600, color: CREAM }}>{t.name}</span>
                <span style={{ fontSize: "11px", color: M }}>· {t.total} pts</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
            <button onClick={doPlay} style={{ ...ctrlBtn, background: G, color: "#fff", border: "none" }}>
              {playing ? "⏸ Pause" : playHole >= 9 ? "↩ Replay" : playHole === 0 ? "▶ Play" : "▶ Resume"}
            </button>
            <button onClick={doNext} disabled={playHole >= 9} style={{ ...ctrlBtn, opacity: playHole >= 9 ? 0.4 : 1 }}>
              Next →
            </button>
            <button onClick={doReset} disabled={playHole === 0} style={{ ...ctrlBtn, opacity: playHole === 0 ? 0.4 : 1 }}>
              ↩ Reset
            </button>
            <span style={{ fontSize: "12px", color: M }}>
              {playHole === 0 ? "Before Round" : `Hole ${playHole} of 9`}
            </span>
          </div>

          <div style={{ background: "rgba(255,255,255,0.6)", border: `1px solid ${GOLD}22`, borderRadius: "10px", padding: "12px 8px 6px", marginBottom: "12px" }}>
            <div style={{ fontSize: "10px", color: M, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "4px", paddingLeft: "4px" }}>
              Cumulative Stableford
            </div>
            <RaceChart series={visibleTeamSeries} />
          </div>

          <div style={{ background: "rgba(255,255,255,0.6)", border: `1px solid ${GOLD}22`, borderRadius: "10px", padding: "12px", overflowX: "auto" }}>
            <div style={{ fontSize: "10px", color: M, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "8px" }}>
              Hole by Hole
            </div>
            <table style={{ borderCollapse: "collapse", fontSize: "12px", minWidth: "460px", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 6px 6px", color: M, fontWeight: 600, fontSize: "11px", minWidth: "100px" }}>Player</th>
                  {PAR.map((par, hi) => (
                    <th key={hi} style={{ textAlign: "center", padding: "3px 4px 6px", minWidth: "34px", fontWeight: 400, fontSize: "10px", color: hi + 1 <= playHole ? CREAM : "#c0c8c0" }}>
                      <div style={{ fontWeight: hi + 1 === playHole ? 800 : 600 }}>{hi + 1}</div>
                      <div>P{par}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: "center", padding: "4px 8px 6px", color: GOLD, fontWeight: 700, fontSize: "11px" }}>Tot</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, idx) => (
                  <React.Fragment key={idx}>
                    {idx === 2 && <tr><td colSpan={11} style={{ padding: "3px 0" }}><div style={{ borderTop: `1px solid ${GOLD}33` }} /></td></tr>}
                    <tr>
                      <td style={{ padding: "5px 6px 5px 4px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: p.color, flexShrink: 0 }} />
                          <span style={{ fontSize: "12px", fontWeight: 600, color: CREAM }}>{p.name}</span>
                        </div>
                        <div style={{ fontSize: "10px", color: M, paddingLeft: "13px" }}>HCP {p.hcp}</div>
                      </td>
                      {p.isFixed ? (
                        <td colSpan={9} style={{ textAlign: "center", padding: "5px 8px" }}>
                          <span style={{ fontSize: "11px", color: p.type === "sub" ? GO : M, fontWeight: 600 }}>
                            {p.type === "sub" ? "Sub · 6 pts" : "Phantom · 2 pts"}
                          </span>
                        </td>
                      ) : p.holeStab.map((h, hi) => {
                        const revealed = hi + 1 <= playHole;
                        const isCur = hi + 1 === playHole;
                        return (
                          <td key={hi} style={{ textAlign: "center", padding: "5px 4px", background: revealed ? cellBg(h?.pts ?? null) : "transparent", boxShadow: isCur ? `inset 0 0 0 2px ${G}66` : "none", opacity: revealed ? 1 : 0.2 }}>
                            {h != null && revealed ? (
                              <><div style={{ fontSize: "12px", fontWeight: 700, color: cellFg(h.pts) }}>{h.pts}</div><div style={{ fontSize: "9px", color: M }}>{h.gross}</div></>
                            ) : (
                              <span style={{ fontSize: "10px", color: "#c0c8c0" }}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: "center", padding: "5px 8px", fontWeight: 700, color: p.color, fontSize: "14px" }}>
                        {playHole > 0 ? (p.cum[Math.min(playHole, 9)] || "—") : "—"}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function BannerPanel({ league, saveLeague }) {
  const saved = league.banner || {};
  const [msg, setMsg] = useState(saved.message || "");
  const [exp, setExp] = useState(saved.expiresAt || "");

  function saveBanner() {
    saveLeague({ ...league, banner: { message: msg.trim(), expiresAt: exp } });
  }
  function clearBanner() {
    setMsg(""); setExp("");
    saveLeague({ ...league, banner: { message: "", expiresAt: "" } });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={2}
        placeholder="e.g. Round 5 canceled due to weather — see you next week!"
        style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: `1px solid ${GOLD}44`, background: "rgba(255,255,255,0.07)", color: CREAM, fontFamily: FB, fontSize: "13px", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: "12px", color: M }}>Expires</label>
        <input type="date" value={exp} onChange={e => setExp(e.target.value)}
          style={{ padding: "5px 8px", borderRadius: "7px", border: `1px solid ${GOLD}44`, background: "rgba(255,255,255,0.07)", color: CREAM, fontFamily: FB, fontSize: "12px", outline: "none" }} />
        <span style={{ fontSize: "11px", color: M }}>(leave blank = show until cleared)</span>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={saveBanner}
          style={{ padding: "6px 16px", borderRadius: "7px", border: "none", background: G, color: "#fff", fontFamily: FB, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
          {saved.message ? "Update Banner" : "Set Banner"}
        </button>
        {saved.message && (
          <button onClick={clearBanner}
            style={{ padding: "6px 14px", borderRadius: "7px", border: `1px solid ${R}55`, background: "transparent", color: R, fontFamily: FB, fontSize: "12px", cursor: "pointer" }}>
            Clear Banner
          </button>
        )}
      </div>
      {saved.message && (
        <div style={{ fontSize: "11px", color: GO, marginTop: "2px" }}>
          Active: "{saved.message}"{saved.expiresAt ? ` · expires ${saved.expiresAt}` : ""}
        </div>
      )}
      {saved.message && (
        <a
          href={`mailto:pickeringvalleygolfleague@googlegroups.com?subject=${encodeURIComponent("PVGC League Update")}&body=${encodeURIComponent(saved.message)}`}
          style={{
            display: "inline-block", marginTop: "4px",
            padding: "6px 16px", borderRadius: "7px",
            border: `1px solid ${GOLD}66`, background: GOLD + "18",
            color: GOLD, fontFamily: FB, fontSize: "12px", fontWeight: 600,
            textDecoration: "none", cursor: "pointer"
          }}>
          ✉ Notify Members
        </a>
      )}
    </div>
  );
}

function AdminAccessPanel({ league, saveLeague }) {
  const [newEmail, setNewEmail] = useState("");
  const emails = league.adminEmails || [];

  function addEmail(e) {
    e.preventDefault();
    const val = newEmail.trim().toLowerCase();
    if (!val || emails.map(x => x.toLowerCase()).includes(val)) return;
    saveLeague({ ...league, adminEmails: [...emails, val] });
    setNewEmail("");
  }

  function removeEmail(em) {
    saveLeague({ ...league, adminEmails: emails.filter(x => x !== em) });
  }

  return (
    <div>
      <div style={{ fontSize: "12px", color: M, marginBottom: "10px", lineHeight: 1.5 }}>
        Only these emails can use admin mode. Anyone signed in with a different email will have admin automatically revoked, even if they know the PIN.
      </div>
      {emails.length === 0 && (
        <div style={{ fontSize: "13px", color: GOLD, marginBottom: "10px" }}>
          ⚠️ No admin emails set — PIN alone controls access (less secure)
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
        {emails.map(em => (
          <div key={em} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f7f7f2", borderRadius: "8px", padding: "8px 10px" }}>
            <div style={{ flex: 1, fontSize: "13px", color: CREAM }}>{em}</div>
            <button onClick={() => removeEmail(em)}
              style={{ background: "none", border: "none", color: R, cursor: "pointer", fontSize: "13px", padding: "2px 6px" }}>✕</button>
          </div>
        ))}
      </div>
      <form onSubmit={addEmail} style={{ display: "flex", gap: "8px" }}>
        <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
          placeholder="admin@email.com"
          style={{ flex: 1, padding: "8px 10px", borderRadius: "8px", border: "1px solid #c8d0c0", fontSize: "13px", outline: "none" }} />
        <button type="submit"
          style={{ padding: "8px 14px", borderRadius: "8px", border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
          Add
        </button>
      </form>
    </div>
  );
}

function MemberAccessPanel({ league, saveLeague }) {
  const [newEmail, setNewEmail] = useState("");
  const emails = league.allowedEmails || [];

  function addEmail(e) {
    e.preventDefault();
    const val = newEmail.trim().toLowerCase();
    if (!val || emails.map(x => x.toLowerCase()).includes(val)) return;
    saveLeague({ ...league, allowedEmails: [...emails, val] });
    setNewEmail("");
  }

  function removeEmail(em) {
    saveLeague({ ...league, allowedEmails: emails.filter(x => x !== em) });
  }

  return (
    <div>
      <div style={{ fontSize: "12px", color: M, marginBottom: "10px", lineHeight: 1.5 }}>
        Only these emails can sign in. Leave empty to allow anyone with a Google account.
      </div>
      {emails.length === 0 && (
        <div style={{ fontSize: "13px", color: GOLD, marginBottom: "10px" }}>
          ⚠️ No emails added — anyone can sign in
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
        {emails.map(em => (
          <div key={em} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f7f7f2", borderRadius: "8px", padding: "8px 10px" }}>
            <div style={{ flex: 1, fontSize: "13px", color: CREAM }}>{em}</div>
            <button onClick={() => removeEmail(em)}
              style={{ background: "none", border: "none", color: R, cursor: "pointer", fontSize: "13px", padding: "2px 6px" }}>✕</button>
          </div>
        ))}
      </div>
      <form onSubmit={addEmail} style={{ display: "flex", gap: "8px" }}>
        <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
          placeholder="member@email.com"
          style={{ flex: 1, padding: "8px 10px", borderRadius: "8px", border: "1px solid #c8d0c0", fontSize: "13px", outline: "none" }} />
        <button type="submit"
          style={{ padding: "8px 14px", borderRadius: "8px", border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
          Add
        </button>
      </form>
    </div>
  );
}

// Group consecutive teams that are tied on total points (rankStandings tags them
// with _tieWith). Returns [{ pts, startRank, teams:[...] }] in standings order.
function detectTieGroups(standings) {
  const groups = [];
  let i = 0;
  while (i < standings.length) {
    const s = standings[i];
    if (s._tieWith && s._tieWith.length) {
      const start = i, pts = s.totalPts, teams = [];
      while (i < standings.length && standings[i].totalPts === pts) teams.push(standings[i++]);
      groups.push({ pts, startRank: start + 1, teams });
    } else i++;
  }
  return groups;
}
function countTieGroups(standings) { return detectTieGroups(standings).length; }

const TB_METHOD = {
  override: { label: "Commissioner override", color: GO },
  h2h: { label: "Head-to-head (TB1)", color: G },
  tb2: { label: "Common opponent (TB2)", color: G },
  stableford: { label: "Unresolved — provisional (Stableford)", color: R },
  multi: { label: "Multi-team tie — provisional", color: R },
};

function TiebreakerManager({ league, teamStandings, saveLeague }) {
  const groups = detectTieGroups(teamStandings);
  const [working, setWorking] = useState({});
  const [msg, setMsg] = useState("");
  const overrides = league.seedOverrides || [];

  if (groups.length === 0) {
    return <div style={{ fontSize: "13px", color: M, padding: "4px 2px" }}>No ties in the current standings — nothing to set.</div>;
  }
  const orderOf = (g) => working[g.pts] || g.teams.map((t) => t.id);
  const move = (g, idx, dir) => {
    const o = [...orderOf(g)]; const j = idx + dir;
    if (j < 0 || j >= o.length) return;
    [o[idx], o[j]] = [o[j], o[idx]];
    setWorking((w) => ({ ...w, [g.pts]: o }));
  };
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2600); };
  const saveGroup = (g) => {
    const o = orderOf(g);
    const groupIds = new Set(g.teams.map((t) => t.id));
    const kept = overrides.filter((id) => !groupIds.has(id));
    saveLeague({ ...league, seedOverrides: [...kept, ...o] });
    flash(`Saved seed order for the ${g.pts}-point tie.`);
  };
  const clearGroup = (g) => {
    const groupIds = new Set(g.teams.map((t) => t.id));
    saveLeague({ ...league, seedOverrides: overrides.filter((id) => !groupIds.has(id)) });
    setWorking((w) => { const n = { ...w }; delete n[g.pts]; return n; });
    flash("Override cleared — reverting to head-to-head / TB2.");
  };

  return (
    <div style={{ padding: "2px" }}>
      <div style={{ fontSize: "12px", color: M, marginBottom: "12px", lineHeight: 1.5 }}>
        Teams level on total points are ordered automatically by <b>head-to-head (TB1)</b>, then <b>result vs. a common opponent (TB2)</b> — this applies to every tie, the 8th seed included.
        If TB1 and TB2 don't separate them, set the order here (the rulebook's final decision). Overrides feed the standings, the Week 18 Knockdown, and the playoff seeds.
      </div>
      {groups.map((g) => {
        const order = orderOf(g);
        const method = g.teams[0]?._tb;
        const overridden = g.teams.some((t) => overrides.includes(t.id));
        const touchesBubble = g.startRank <= 8 && g.startRank + g.teams.length - 1 >= 8;
        const dirty = !!working[g.pts];
        return (
          <div key={g.pts} style={{ border: `1px solid ${touchesBubble ? GO : GOLD}44`, borderRadius: "10px", padding: "12px", marginBottom: "12px", background: touchesBubble ? GO + "0a" : "transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: CREAM }}>
                Tie at {g.pts} pts · seeds {g.startRank}–{g.startRank + g.teams.length - 1}
              </span>
              {touchesBubble && <Tag color={GO}>8th-seed bubble</Tag>}
              <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 600, color: (TB_METHOD[overridden ? "override" : method] || {}).color || M }}>
                {(TB_METHOD[overridden ? "override" : method] || {}).label || "—"}
              </span>
            </div>
            {order.map((id, idx) => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: idx < order.length - 1 ? `1px solid ${GOLD}14` : "none" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: idx + g.startRank <= 8 ? G : M, minWidth: "26px" }}>{g.startRank + idx}{idx + g.startRank <= 8 ? "" : ""}</span>
                <span style={{ flex: 1, fontSize: "14px", color: CREAM }}>{TEAMS[id]?.name || `Team ${id}`}</span>
                <button onClick={() => move(g, idx, -1)} disabled={idx === 0}
                  style={{ width: "30px", height: "30px", borderRadius: "6px", border: `1px solid ${GOLD}44`, background: "transparent", color: idx === 0 ? "#ccc" : CREAM, cursor: idx === 0 ? "default" : "pointer", fontSize: "14px" }}>▲</button>
                <button onClick={() => move(g, idx, 1)} disabled={idx === order.length - 1}
                  style={{ width: "30px", height: "30px", borderRadius: "6px", border: `1px solid ${GOLD}44`, background: "transparent", color: idx === order.length - 1 ? "#ccc" : CREAM, cursor: idx === order.length - 1 ? "default" : "pointer", fontSize: "14px" }}>▼</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <button onClick={() => saveGroup(g)}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: G, color: "#fff", fontFamily: FB, fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                {dirty ? "Save this order" : "Set as override"}
              </button>
              {overridden && (
                <button onClick={() => clearGroup(g)}
                  style={{ padding: "8px 16px", borderRadius: "8px", border: `1px solid ${R}55`, background: R + "12", color: R, fontFamily: FB, fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  Clear override
                </button>
              )}
            </div>
          </div>
        );
      })}
      {msg && <div style={{ fontSize: "12px", color: G, fontWeight: 600, marginTop: "4px" }}>{msg}</div>}
    </div>
  );
}

export default function AdminScreen({ league, knockdownPairs, qfPairs, sfPairs, finalPairs, saveLeague, unlockMatch, clearMatch, clearSeason, isAdmin, adminPin, adminUnlock, adminLock, saveAdminPin, teamStandings, potyList, createSnapshot, listSnapshots, restoreSnapshot, match, setMatch, activeWeek, activeTeam, cancelledWeeks, toggleCancelWeek }) {
  const printYears = Object.keys(PRINT_SCHEDULES).map(Number).sort();
  const [printYear, setPrintYear] = useState(printYears[printYears.length - 1] || SEASON_YEAR);

  // Admin PIN state
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [changingPin, setChangingPin] = useState(false);

  // Clear match state
  const [clearWeek, setClearWeek] = useState(1);
  const [clearTeam, setClearTeam] = useState(1);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearMsg, setClearMsg] = useState("");

  // Reset season state
  const [resetPhase, setResetPhase] = useState(0); // 0=idle, 1=confirm1, 2=confirm2

  // Accordion state — open by default: access + starter
  const [openSections, setOpenSections] = useState(() => new Set(["access", "starter"]));
  const isOpen = (id) => openSections.has(id);
  const toggleSection = (id) => setOpenSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Recap state
  const [recapWeek, setRecapWeek] = useState(1);
  const [recapCopied, setRecapCopied] = useState(false);

  function copyRecap() {
    const dynPairsByWeek = {
      18: knockdownPairs || [],
      19: qfPairs || [],
      20: sfPairs || [],
      21: finalPairs ? [finalPairs.championship, finalPairs.thirdPlace].filter(Boolean) : [],
    };
    const text = buildWeekRecap(recapWeek, league.results || {}, league.handicaps || {}, league.cancelledWeeks, league.loHiOverrides, dynPairsByWeek, undefined, undefined,
      { dues: league.dues || {}, exempt: league.budget?.exempt, perPlayer: league.budget?.duesPerPlayer });
    navigator.clipboard.writeText(text).then(() => {
      setRecapCopied(true);
      setTimeout(() => setRecapCopied(false), 2500);
    });
  }

  // Snapshot state
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [snapshotStatus, setSnapshotStatus] = useState(""); // "saving"|"saved"|"error"|"restoring"|"restored"
  const [restoreId, setRestoreId] = useState(null);

  useEffect(() => {
    if (!isAdmin || !listSnapshots) return;
    listSnapshots().then(setSnapshots);
  }, [isAdmin]);

  async function handleCreateSnapshot() {
    setSnapshotStatus("saving");
    const ok = await createSnapshot?.(snapshotLabel);
    setSnapshotStatus(ok ? "saved" : "error");
    if (ok) {
      setSnapshotLabel("");
      const updated = await listSnapshots?.();
      if (updated) setSnapshots(updated);
      setTimeout(() => setSnapshotStatus(""), 3000);
    }
  }

  async function handleRestore(id) {
    setSnapshotStatus("restoring");
    setRestoreId(id);
    const ok = await restoreSnapshot?.(id);
    setSnapshotStatus(ok ? "restored" : "error");
    setRestoreId(null);
    setTimeout(() => setSnapshotStatus(""), 3000);
  }


  const activeSched = PRINT_SCHEDULES[printYear] || PRINT_SCHEDULES[SEASON_YEAR];
  const schedRaw = activeSched.scheduleRaw;
  const schedTeams = activeSched.teams;

  const regularWeeks = schedRaw.filter(([w]) => w < 18).map(([w]) => w);
  const playoffWeeks = [[18, "Knockdown"], [19, "Quarterfinals"], [20, "Semifinals"], [21, "Championship"]];
  const [selWeek, setSelWeek] = useState(regularWeeks[regularWeeks.length - 1] || 1);

  const weekRow = schedRaw.find(([w]) => w === selWeek);
  const rawPairs = weekRow ? weekRow.slice(2).filter(Array.isArray) : [];
  // Playoff pairs only apply for current season
  const dynPairs = printYear === SEASON_YEAR
    ? (selWeek === 18 ? knockdownPairs
      : selWeek === 19 ? qfPairs
      : selWeek === 20 ? (sfPairs || [])
      : selWeek === 21 ? (finalPairs ? [finalPairs.championship, finalPairs.thirdPlace] : [])
      : null)
    : null;
  const pairs = dynPairs || rawPairs;

  const readOnlyWeeks = league?.readOnlyWeeks || [];

  // Clear match derived values
  const clearDynPairs = clearWeek === 18 ? knockdownPairs : clearWeek === 19 ? qfPairs
    : clearWeek === 20 ? (sfPairs || []) : clearWeek === 21 ? (finalPairs ? [finalPairs.championship, finalPairs.thirdPlace] : []) : null;
  const clearOpp = getOpponent(clearTeam, clearWeek, clearDynPairs);
  const clearTlow = clearOpp ? Math.min(clearTeam, clearOpp) : 0;
  const clearThigh = clearOpp ? Math.max(clearTeam, clearOpp) : 0;
  const clearMk = clearTlow && clearThigh ? matchKey(clearWeek, clearTlow, clearThigh) : null;
  const clearHasData = clearMk ? !!(league?.results?.[clearWeek]?.[clearMk]) : false;


  function toggleReadOnly(w) {
    if (!saveLeague) return;
    const cur = readOnlyWeeks.includes(w);
    const next = { ...league, readOnlyWeeks: cur ? readOnlyWeeks.filter(x => x !== w) : [...readOnlyWeeks, w] };
    saveLeague(next);
  }

  // Collect locked + confirmed matches
  const lockedMatches = [];
  for (const [wStr, weekRecs] of Object.entries(league?.results || {})) {
    const w = parseInt(wStr);
    for (const [mk, rec] of Object.entries(weekRecs || {})) {
      if (!rec) continue;
      if (rec.locked || (rec.confirmations && Object.keys(rec.confirmations).length > 0)) {
        lockedMatches.push({ week: w, mk, rec });
      }
    }
  }
  lockedMatches.sort((a, b) => a.week - b.week);

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ fontFamily: FD, fontSize: "26px", fontWeight: 600, color: CREAM, marginBottom: "16px" }}>
        Admin
      </div>

      {/* ── Feature toggle: Weekly Recap tab ── */}
      <div style={{ background: "#fff", border: "1px solid rgba(26,61,36,.14)", borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <div style={{ fontWeight: 700, color: "#17281e", fontSize: "14px" }}>📋 Weekly Recap tab</div>
          <div style={{ fontSize: "12px", color: "#6a7c6f", marginTop: "2px" }}>{league.recapEnabled ? "Visible to everyone in the nav." : "Hidden. Turn on to show the member-facing Recap tab."}</div>
        </div>
        <button onClick={() => saveLeague({ ...league, recapEnabled: !league.recapEnabled })} aria-label="Toggle Recap tab"
          style={{ flexShrink: 0, width: "54px", height: "30px", borderRadius: "16px", border: "none", cursor: "pointer", background: league.recapEnabled ? "#1c854a" : "#c9c4b4", position: "relative", transition: "background .2s" }}>
          <span style={{ position: "absolute", top: "3px", left: league.recapEnabled ? "27px" : "3px", width: "24px", height: "24px", borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
        </button>
      </div>

      {/* ── Season lock (archive) ── */}
      <div style={{
        background: league.locked ? "#fdf3f2" : "#fff",
        border: `1px solid ${league.locked ? "rgba(185,28,28,.3)" : "rgba(26,61,36,.14)"}`,
        borderRadius: "12px", padding: "12px 14px", marginBottom: "16px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
      }}>
        <div>
          <div style={{ fontWeight: 700, color: "#17281e", fontSize: "14px" }}>
            {league.locked ? "🔒" : "🔓"} Season {SEASON_YEAR} — {league.locked ? "archived" : "open"}
          </div>
          <div style={{ fontSize: "12px", color: "#6a7c6f", marginTop: "2px" }}>
            {league.locked
              ? "Read-only. Scores, confirmations and settings can't be changed."
              : "Lock when the season is finished to make it permanently read-only."}
          </div>
        </div>
        <button
          onClick={() => {
            const msg = league.locked
              ? `Unlock season ${SEASON_YEAR}? Scores will become editable again.`
              : `Archive season ${SEASON_YEAR}?\n\nThis makes the whole season read-only — no score edits, confirmations, clears or restores. You can unlock it here later.`;
            if (window.confirm(msg)) saveLeague({ ...league, locked: !league.locked });
          }}
          style={{
            flexShrink: 0, padding: "8px 14px", borderRadius: "8px", border: "none", cursor: "pointer",
            background: league.locked ? "#b91c1c" : "#1c854a", color: "#fff", fontSize: "13px", fontWeight: 700,
          }}>
          {league.locked ? "Unlock" : "Archive"}
        </button>
      </div>

      {/* ── Admin Access ──────────────────────────────────────────── */}
      <AccordionSection
        id="access" open={isOpen("access")} onToggle={toggleSection}
        title="Admin Access" icon={isAdmin ? "🔓" : "🔒"}
        hint={isAdmin ? "Unlocked" : "Locked"}
      >
      {isAdmin ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>🔓</span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: G }}>Admin Unlocked</div>
                <div style={{ fontSize: "11px", color: M }}>Full edit access active</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {!changingPin ? (
                <button onClick={() => setChangingPin(true)}
                  style={{ padding: "6px 14px", borderRadius: "7px", border: `1px solid ${GOLD}44`, background: "transparent", color: M, fontFamily: FB, fontSize: "12px", cursor: "pointer" }}>
                  Change PIN
                </button>
              ) : (
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input
                    type="password" placeholder="New PIN" value={newPin}
                    onChange={e => setNewPin(e.target.value)}
                    style={{ width: "90px", padding: "6px 8px", borderRadius: "7px", border: `1px solid ${GOLD}44`, fontFamily: FB, fontSize: "13px", outline: "none" }}
                  />
                  <button onClick={async () => {
                    if (!newPin) return;
                    await saveAdminPin(newPin);
                    setNewPin(""); setChangingPin(false);
                  }}
                    style={{ padding: "6px 12px", borderRadius: "7px", border: `1px solid ${G}55`, background: G + "18", color: G, fontFamily: FB, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                    Save
                  </button>
                  <button onClick={() => { setNewPin(""); setChangingPin(false); }}
                    style={{ padding: "6px 10px", borderRadius: "7px", border: `1px solid ${GOLD}33`, background: "transparent", color: M, fontFamily: FB, fontSize: "12px", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              )}
              <button onClick={adminLock}
                style={{ padding: "6px 14px", borderRadius: "7px", border: `1px solid ${R}44`, background: R + "10", color: R, fontFamily: FB, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                Lock
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ fontSize: "16px" }}>🔒</span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: M }}>Admin Locked</div>
                <div style={{ fontSize: "11px", color: M }}>Enter PIN to unlock editing</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="password" placeholder="Enter PIN"
                value={pinInput}
                onChange={e => { setPinInput(e.target.value); setPinError(false); }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const ok = adminUnlock(pinInput);
                    if (!ok) setPinError(true);
                    else setPinInput("");
                  }
                }}
                style={{
                  width: "120px", padding: "8px 10px", borderRadius: "8px",
                  border: `1px solid ${pinError ? R : GOLD}44`,
                  fontFamily: FB, fontSize: "14px", outline: "none",
                  background: pinError ? R + "08" : "#fff",
                }}
              />
              <button onClick={() => {
                const ok = adminUnlock(pinInput);
                if (!ok) setPinError(true);
                else setPinInput("");
              }}
                style={{ padding: "8px 18px", borderRadius: "8px", border: `1px solid ${GOLD}66`, background: GOLD + "18", color: GOLD, fontFamily: FB, fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
                Unlock
              </button>
              {pinError && <span style={{ fontSize: "12px", color: R, fontWeight: 600 }}>Incorrect PIN</span>}
              {!adminPin && <span style={{ fontSize: "11px", color: M }}>No PIN set — set one after unlocking</span>}
            </div>
          </div>
        )}
      </AccordionSection>

      {/* ── Admin Access ─────────────────────────────────────────── */}
      {isAdmin && (
        <AccordionSection
          id="adminaccess" open={isOpen("adminaccess")} onToggle={toggleSection}
          title="Admin Access" icon="🛡"
          hint={`${(league.adminEmails||[]).length} admin${(league.adminEmails||[]).length !== 1 ? "s" : ""}`}
        >
          <AdminAccessPanel league={league} saveLeague={saveLeague} />
        </AccordionSection>
      )}

      {/* ── Member Access ────────────────────────────────────────── */}
      {isAdmin && (
        <AccordionSection
          id="members" open={isOpen("members")} onToggle={toggleSection}
          title="Member Access" icon="🔑"
          hint={`${(league.allowedEmails||[]).length} emails`}
        >
          <MemberAccessPanel league={league} saveLeague={saveLeague} />
        </AccordionSection>
      )}

      {/* ── Banner ───────────────────────────────────────────────── */}
      {isAdmin && (
        <AccordionSection
          id="banner" open={isOpen("banner")} onToggle={toggleSection}
          title="League Banner" icon="📢"
          hint={league.banner?.message ? "Active" : "None"}
        >
          <BannerPanel league={league} saveLeague={saveLeague} />
        </AccordionSection>
      )}

      {/* ── Print Starter Sheet ──────────────────────────────────── */}
      <AccordionSection
        id="starter" open={isOpen("starter")} onToggle={toggleSection}
        title="Starter Sheet" icon="🖨"
        hint={`Week ${selWeek} · ${pairs.length} groups`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", paddingTop: "8px" }}>
          {printYears.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", color: M }}>Year</span>
              <select
                value={printYear}
                onChange={e => { setPrintYear(parseInt(e.target.value)); setSelWeek(1); }}
                style={{
                  background: "#fff", border: `1px solid ${GOLD}44`, borderRadius: "7px",
                  color: "#0f2a14", fontFamily: FB, fontSize: "14px",
                  padding: "6px 10px", cursor: "pointer", outline: "none",
                }}
              >
                {printYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", color: M }}>Week</span>
            <select
              value={selWeek}
              onChange={e => setSelWeek(parseInt(e.target.value))}
              style={{
                background: "#fff", border: `1px solid ${GOLD}44`, borderRadius: "7px",
                color: "#0f2a14", fontFamily: FB, fontSize: "14px",
                padding: "6px 10px", cursor: "pointer", outline: "none",
              }}
            >
              {schedRaw.map(([w]) => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => printStarterSheet(selWeek, pairs, activeSched.getTeeTimes(selWeek), schedRaw, schedTeams, activeSched.getTeeTimes(1), REPLAY_WEEK_LABEL[selWeek])}
            disabled={pairs.length === 0}
            style={{
              padding: "8px 18px", borderRadius: "8px", cursor: pairs.length ? "pointer" : "not-allowed",
              border: `1px solid ${GOLD}66`, background: GOLD + "18",
              color: GOLD, fontFamily: FB, fontSize: "14px", fontWeight: 600,
              opacity: pairs.length ? 1 : 0.4,
            }}
          >
            Print Sheet
          </button>
          {weekRow && (
            <span style={{ fontSize: "12px", color: M }}>
              {fmtDate(weekRow[1])} &nbsp;·&nbsp; {pairs.length} groups
            </span>
          )}
        </div>
      </AccordionSection>

      {/* ── Admin-only sections ─────────────────────────────────── */}
      {!isAdmin && (
        <div style={{ textAlign: "center", padding: "16px", fontSize: "13px", color: M }}>
          Unlock admin to access week controls, match management, and data tools.
        </div>
      )}
      {isAdmin && <>

      {/* ── Week Controls ─────────────────────────────────────── */}
      <AccordionSection
        id="week-controls" open={isOpen("week-controls")} onToggle={toggleSection}
        title="Week Controls" icon="📅"
        badge={readOnlyWeeks.length > 0 || (cancelledWeeks?.size > 0) ? `${readOnlyWeeks.length + (cancelledWeeks?.size||0)} active` : null}
      >
        <div style={{ fontSize: "11px", fontWeight: 700, color: M, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "12px", marginBottom: "8px" }}>
          🔒 Read-Only Weeks
          <span style={{ fontSize: "11px", fontWeight: 400, marginLeft: "6px", textTransform: "none" }}>— lock past weeks from editing</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
          {regularWeeks.map(w => {
            const isRO = readOnlyWeeks.includes(w);
            return (
              <button key={w} onClick={() => toggleReadOnly(w)}
                style={{
                  padding: "6px 12px", borderRadius: "7px", fontFamily: FB, fontSize: "13px",
                  fontWeight: isRO ? 700 : 400, cursor: "pointer",
                  border: isRO ? `2px solid #e6a817` : `1px solid ${GOLD}44`,
                  background: isRO ? "#fff3cd" : "transparent",
                  color: isRO ? "#7a4f00" : M,
                }}>
                {isRO ? "🔒" : ""} W{w}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
          {playoffWeeks.map(([w, label]) => {
            const isRO = readOnlyWeeks.includes(w);
            return (
              <button key={w} onClick={() => toggleReadOnly(w)}
                style={{
                  padding: "6px 12px", borderRadius: "7px", fontFamily: FB, fontSize: "13px",
                  fontWeight: isRO ? 700 : 400, cursor: "pointer",
                  border: isRO ? `2px solid #e6a817` : `1px solid ${GO}55`,
                  background: isRO ? "#fff3cd" : "transparent",
                  color: isRO ? "#7a4f00" : GO,
                }}>
                {isRO ? "🔒 " : ""}W{w} · {label}
              </button>
            );
          })}
        </div>
        {readOnlyWeeks.length > 0 && (
          <div style={{ fontSize: "12px", color: M, marginBottom: "16px" }}>
            Locked: {readOnlyWeeks.sort((a,b)=>a-b).map(w => `W${w}`).join(", ")}
          </div>
        )}

        <div style={{ fontSize: "11px", fontWeight: 700, color: M, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "8px", marginBottom: "8px" }}>
          ⛈ Cancel Week — Weather
          <span style={{ fontSize: "11px", fontWeight: 400, marginLeft: "6px", textTransform: "none" }}>— no points awarded</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {regularWeeks.map(w => {
            const isCancelled = cancelledWeeks?.has(w);
            return (
              <button key={w} onClick={() => toggleCancelWeek?.(w)}
                style={{
                  padding: "6px 12px", borderRadius: "7px", fontFamily: FB, fontSize: "13px",
                  fontWeight: isCancelled ? 700 : 400, cursor: "pointer",
                  border: isCancelled ? `2px solid #e6a817` : `1px solid ${GOLD}44`,
                  background: isCancelled ? "#fff3cd" : "transparent",
                  color: isCancelled ? "#7a4f00" : M,
                }}>
                {isCancelled ? "⛈" : ""} W{w}
              </button>
            );
          })}
        </div>
        {cancelledWeeks?.size > 0 && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "#e6a817" }}>
            Cancelled: {[...cancelledWeeks].sort((a,b)=>a-b).map(w => `W${w}`).join(", ")}
          </div>
        )}

        {/* Rainout — inline when match context available */}
        {match && setMatch && (
          <>
            <div style={{ fontSize: "11px", fontWeight: 700, color: M, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "16px", marginBottom: "8px" }}>
              ☔ Rainout — Week {activeWeek} · T{activeTeam}
              <span style={{ fontSize: "11px", fontWeight: 400, marginLeft: "6px", textTransform: "none" }}>— H7→H1 · H8→H4 · H9→H3</span>
            </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", color: match.rainout ? GO : M }}>
                {match.rainout ? "Rainout active" : "No rainout"}
              </span>
              <button onClick={() => setMatch(p => ({ ...p, rainout: !p.rainout }))}
                style={{
                  width: "42px", height: "22px", borderRadius: "13px", border: "none", cursor: "pointer",
                  background: match.rainout ? GOLD : "rgba(255,255,255,0.25)", position: "relative", transition: "background 0.2s"
                }}>
                <span style={{
                  position: "absolute", top: "3px", left: match.rainout ? "22px" : "3px",
                  width: "16px", height: "16px", borderRadius: "50%",
                  background: match.rainout ? "#0f2a14" : "#888", transition: "left 0.2s"
                }} />
              </button>
            </div>
            {match.rainout && (
              <select value={match.holesPlayed} onChange={e => setMatch(p => ({ ...p, holesPlayed: parseInt(e.target.value) }))}
                style={{ background: "#fff", border: `1px solid ${GOLD}44`, borderRadius: "7px", color: "#0f2a14", fontFamily: FB, fontSize: "14px", padding: "6px 10px", cursor: "pointer", outline: "none" }}>
                {[6, 7, 8].map(n => <option key={n} value={n}>Stopped after H{n}</option>)}
              </select>
            )}
          </div>
          </>
        )}
      </AccordionSection>

      {/* ── Confirmed Matches ────────────────────────────────────── */}
      {lockedMatches.length > 0 && (
        <AccordionSection
          id="locked" open={isOpen("locked")} onToggle={toggleSection}
          title="Confirmed Matches" icon="✅"
          badge={`${lockedMatches.length}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "10px" }}>
            {lockedMatches.map(({ week, mk, rec }) => {
              const parts = mk.split("-");
              const tlow = parseInt(parts[1]), thigh = parseInt(parts[2]);
              const confs = rec.confirmations || {};
              const t1c = confs[tlow], t2c = confs[thigh];
              return (
                <div key={`${week}-${mk}`} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: "8px", padding: "10px 12px", borderRadius: "9px",
                  background: rec.locked ? G + "0d" : GOLD + "0a",
                  border: `1px solid ${rec.locked ? G + "33" : GOLD + "33"}`,
                  flexWrap: "wrap"
                }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: CREAM }}>
                      W{week} — T{tlow} vs T{thigh}
                      {rec.locked && <span style={{ marginLeft: "8px", color: G, fontSize: "12px" }}>✅ Locked</span>}
                    </div>
                    <div style={{ fontSize: "11px", color: M, marginTop: "3px" }}>
                      {t1c ? <span style={{ color: G }}>T{tlow}: {t1c.confirmedBy} {t1c.confirmedAt}</span> : <span style={{ color: M }}>T{tlow}: pending</span>}
                      <span style={{ color: M }}> · </span>
                      {t2c ? <span style={{ color: G }}>T{thigh}: {t2c.confirmedBy} {t2c.confirmedAt}</span> : <span style={{ color: M }}>T{thigh}: pending</span>}
                    </div>
                  </div>
                  {rec.locked && unlockMatch && (
                    <button onClick={() => unlockMatch(week, mk)}
                      style={{ padding: "5px 12px", borderRadius: "6px", border: `1px solid ${R}44`, background: R + "10", color: R, fontFamily: FB, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                      Unlock
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </AccordionSection>
      )}

      {/* ── Weekly Recap ─────────────────────────────────────────── */}
      <AccordionSection
        id="recap" open={isOpen("recap")} onToggle={toggleSection}
        title="Weekly Recap" icon="📋"
        hint="copy for AI"
      >
        <div style={{ fontSize: "12px", color: M, margin: "10px 0 14px" }}>
          Copy formatted match data to paste into an AI for a weekly recap.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <select value={recapWeek} onChange={e => setRecapWeek(parseInt(e.target.value))}
            style={{ background: "#fff", border: `1px solid ${GOLD}44`, borderRadius: "7px", color: "#0f2a14", fontFamily: FB, fontSize: "14px", padding: "6px 10px", cursor: "pointer", outline: "none" }}>
            {regularWeeks.map(w => <option key={w} value={w}>Week {w}</option>)}
            {[[18, "Knockdown"], [19, "Quarterfinals"], [20, "Semifinals"], [21, "Championship"]].map(([w, l]) => (
              <option key={w} value={w}>Week {w} — {l}</option>
            ))}
          </select>
          <button onClick={copyRecap} style={{
            padding: "8px 18px", borderRadius: "8px", fontFamily: FB, fontSize: "14px", fontWeight: 600,
            border: `1px solid ${recapCopied ? G : GOLD}55`,
            background: recapCopied ? G + "18" : GOLD + "18",
            color: recapCopied ? G : CREAM, cursor: "pointer"
          }}>
            {recapCopied ? "✓ Copied!" : "Copy Recap"}
          </button>
        </div>
      </AccordionSection>

      {/* ── Clear Match ──────────────────────────────────────────── */}
      <AccordionSection
        id="clear" open={isOpen("clear")} onToggle={toggleSection}
        title="Clear Match" icon="🗑"
        hint="delete a match's scores"
      >
        <div style={{ fontSize: "12px", color: M, margin: "10px 0 14px" }}>
          Delete scores for a single match. All other data is untouched.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: M }}>Week</span>
            <select value={clearWeek} onChange={e => { setClearWeek(parseInt(e.target.value)); setClearConfirm(false); setClearMsg(""); }}
              style={{ background: "#fff", border: `1px solid ${GOLD}44`, borderRadius: "7px", color: "#0f2a14", fontFamily: FB, fontSize: "14px", padding: "6px 10px", cursor: "pointer", outline: "none" }}>
              {Array.from({ length: 21 }, (_, i) => i + 1).map(w => <option key={w} value={w}>Week {w}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: M }}>Team</span>
            <select value={clearTeam} onChange={e => { setClearTeam(parseInt(e.target.value)); setClearConfirm(false); setClearMsg(""); }}
              style={{ background: "#fff", border: `1px solid ${GOLD}44`, borderRadius: "7px", color: "#0f2a14", fontFamily: FB, fontSize: "14px", padding: "6px 10px", cursor: "pointer", outline: "none" }}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map(t => (
                <option key={t} value={t}>T{t}: {TEAMS[t]?.name}</option>
              ))}
            </select>
          </div>
          {clearOpp && (
            <span style={{ fontSize: "13px", color: M }}>
              vs <span style={{ color: CREAM, fontWeight: 600 }}>T{clearOpp} {TEAMS[clearOpp]?.name}</span>
              {clearHasData ? <span style={{ color: GOLD, marginLeft: "8px" }}>● has scores</span> : <span style={{ color: M, marginLeft: "8px" }}>○ no data</span>}
            </span>
          )}
          {!clearOpp && <span style={{ fontSize: "13px", color: M }}>No match this week</span>}
        </div>
        {clearOpp && clearHasData && (
          <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
            {!clearConfirm ? (
              <button onClick={() => setClearConfirm(true)}
                style={{ padding: "8px 18px", borderRadius: "8px", border: `1px solid ${R}55`, background: R + "12", color: R, fontFamily: FB, fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
                Clear Scores
              </button>
            ) : (
              <>
                <span style={{ fontSize: "13px", color: R, fontWeight: 600 }}>Delete W{clearWeek} T{clearTeam} vs T{clearOpp}?</span>
                <button onClick={async () => { await clearMatch?.(clearWeek, clearMk); setClearConfirm(false); setClearMsg("✓ Cleared"); setTimeout(() => setClearMsg(""), 3000); }}
                  style={{ padding: "7px 16px", borderRadius: "7px", border: `1px solid ${R}`, background: R, color: "#fff", fontFamily: FB, fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                  Yes, delete
                </button>
                <button onClick={() => setClearConfirm(false)}
                  style={{ padding: "7px 14px", borderRadius: "7px", border: `1px solid ${GOLD}44`, background: "transparent", color: M, fontFamily: FB, fontSize: "13px", cursor: "pointer" }}>
                  Cancel
                </button>
              </>
            )}
            {clearMsg && <span style={{ fontSize: "13px", color: G, fontWeight: 600 }}>{clearMsg}</span>}
          </div>
        )}
      </AccordionSection>

      {/* ── Data + Snapshots ─────────────────────────────────────── */}
      <AccordionSection
        id="data" open={isOpen("data")} onToggle={toggleSection}
        title="Export &amp; Snapshots" icon="💾"
        badge={snapshots.length > 0 ? `${snapshots.length} snapshots` : null}
      >
        <div style={{ fontSize: "11px", fontWeight: 700, color: M, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "12px", marginBottom: "10px" }}>
          Export CSV
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
          <button onClick={() => exportStandings(teamStandings || [])} style={exportBtn}>↓ Standings</button>
          <button onClick={() => exportHandicaps(league)} style={exportBtn}>↓ Handicaps</button>
          <button onClick={() => exportScores(league)} style={exportBtn}>↓ All Scores</button>
        </div>

        <div style={{ fontSize: "11px", fontWeight: 700, color: M, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>
          Snapshots
          <span style={{ fontSize: "11px", fontWeight: 400, marginLeft: "6px", textTransform: "none" }}>— full Firestore backups</span>
        </div>

        {/* Create snapshot */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          <input
            value={snapshotLabel}
            onChange={e => setSnapshotLabel(e.target.value)}
            placeholder="Label (optional, e.g. 'After Week 3')"
            style={{ flex: 1, minWidth: "180px", background: "rgba(26,61,36,0.07)", border: `1px solid ${GOLD}44`, borderRadius: "8px", color: CREAM, fontFamily: FB, fontSize: "13px", padding: "8px 12px", outline: "none" }}
          />
          <button
            onClick={handleCreateSnapshot}
            disabled={snapshotStatus === "saving"}
            style={{ ...exportBtn, background: GOLD + "22", borderColor: GOLD + "66", color: GOLD }}>
            {snapshotStatus === "saving" ? "Saving…" : snapshotStatus === "saved" ? "✓ Saved!" : "Create Snapshot"}
          </button>
        </div>

        {snapshotStatus === "error" && (
          <div style={{ fontSize: "12px", color: R, marginBottom: "10px" }}>Something went wrong. Try again.</div>
        )}
        {snapshotStatus === "restored" && (
          <div style={{ fontSize: "12px", color: G, marginBottom: "10px" }}>✓ Snapshot restored successfully.</div>
        )}

        {/* Snapshot list */}
        {snapshots.length === 0 ? (
          <div style={{ fontSize: "12px", color: M }}>No snapshots yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {snapshots.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", background: "rgba(26,61,36,0.04)", border: `1px solid ${GOLD}22`, borderRadius: "8px", padding: "10px 12px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: CREAM }}>
                    {s.label || s.createdAt}
                  </div>
                  <div style={{ fontSize: "11px", color: M, marginTop: "2px" }}>
                    {s.label ? s.createdAt + " · " : ""}{s.weeksCovered} week{s.weeksCovered !== 1 ? "s" : ""} of data
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Restore snapshot "${s.label || s.createdAt}"? This will overwrite all current scores.`)) {
                      handleRestore(s.id);
                    }
                  }}
                  disabled={snapshotStatus === "restoring"}
                  style={{ padding: "6px 14px", borderRadius: "7px", border: `1px solid ${GOLD}55`, background: "transparent", color: GOLD, fontFamily: FB, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                  {snapshotStatus === "restoring" && restoreId === s.id ? "Restoring…" : "Restore"}
                </button>
              </div>
            ))}
          </div>
        )}
      </AccordionSection>

      {/* ── Winnings & Budget (admin-only, like the old tab) ──────── */}
      {isAdmin && (
        <AccordionSection
          id="winnings" open={isOpen("winnings")} onToggle={toggleSection}
          title="Winnings & Budget" icon="💰"
        >
          <BudgetScreen league={league} saveLeague={saveLeague} teamStandings={teamStandings} potyList={potyList} embedded />
        </AccordionSection>
      )}

      {/* ── Standings Tiebreakers ───────────────────────────────── */}
      {teamStandings?.length > 0 && (
        <AccordionSection
          id="tiebreakers" open={isOpen("tiebreakers")} onToggle={toggleSection}
          title="Standings Tiebreakers" icon="⚖️"
          badge={(() => { const n = countTieGroups(teamStandings); return n > 0 ? `${n} tie${n > 1 ? "s" : ""}` : null; })()}
        >
          <TiebreakerManager league={league} teamStandings={teamStandings} saveLeague={saveLeague} />
        </AccordionSection>
      )}

      {/* ── Leaderboard ─────────────────────────────────────────── */}
      {teamStandings?.length > 0 && (
        <AccordionSection
          id="leaderboard" open={isOpen("leaderboard")} onToggle={toggleSection}
          title="Leaderboard" icon="🏆"
          badge={`${teamStandings.length} teams`}
        >
          <div style={{ overflowX: "auto", marginTop: "4px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "520px" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${GOLD}33` }}>
                  {["#","Team","W","L","T","Match","Bonus","Total","Played",""].map((h, i) => (
                    <td key={i} style={{ padding: "7px 8px", color: M, fontSize: "11px", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: i >= 2 ? "center" : "left" }}>{h}</td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamStandings.map((s, idx) => {
                  const rank = idx + 1;
                  const inPlayoffs = rank <= 8;
                  const rc = rank === 1 ? GO : rank <= 3 ? G : inPlayoffs ? CREAM : M;
                  return (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${GOLD}11` }}>
                      <td style={{ padding: "8px", fontWeight: 700, color: rc, fontSize: "12px" }}>{rank}</td>
                      <td style={{ padding: "8px" }}>
                        <div style={{ fontSize: "13px", color: inPlayoffs ? CREAM : M }}>{TEAMS[s.id]?.name}</div>
                        <div style={{ fontSize: "10px", color: M }}>{TEAMS[s.id]?.p1} · {TEAMS[s.id]?.p2}</div>
                      </td>
                      <td style={{ padding: "8px", textAlign: "center", color: G, fontWeight: 600 }}>{s.wins}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: R }}>{s.losses}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: M }}>{s.ties}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: "#c0a060" }}>{s.matchPts}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: G }}>{s.bonusPts}</td>
                      <td style={{ padding: "8px", textAlign: "center", fontWeight: 700, color: inPlayoffs ? G : M }}>{s.totalPts}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: M }}>{s.played}</td>
                      <td style={{ padding: "8px" }}>
                        {rank <= 8 && s.played > 0 && <Tag color={G}>Playoffs</Tag>}
                        {(rank === 8 || rank === 9) && <Tag color={GO}>Bubble</Tag>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: "11px", color: M, marginTop: "10px" }}>
            Match pts: Win=2, Tie=1, Loss=0 · Bonus: 1st-2nd=8, 3rd-4th=6, 5th-6th=4, 7th-8th+=2
          </div>
        </AccordionSection>
      )}

      {/* ── Round Replay ─────────────────────────────────────────── */}
      <AccordionSection
        id="replay" open={isOpen("replay")} onToggle={toggleSection}
        title="Round Replay" icon="📈"
        hint="charts"
      >
        <RoundReplayPanel league={league} initialWeek={activeWeek || 1} initialTeam={activeTeam || 1}
          dynPairsFor={(w) => w === 18 ? knockdownPairs : w === 19 ? qfPairs : w === 20 ? (sfPairs || []) : w === 21 ? (finalPairs ? [finalPairs.championship, finalPairs.thirdPlace] : []) : null} />
      </AccordionSection>

      {/* ── Reset Season ─────────────────────────────────────────── */}
      <AccordionSection
        id="reset" open={isOpen("reset")} onToggle={toggleSection}
        title="Reset Season" icon="⚠️" danger
        hint="destructive"
      >
        <div style={{ fontSize: "12px", color: M, margin: "10px 0 14px" }}>
          Deletes all match scores for every week. Handicaps, rules, and settings are preserved.
        </div>
        {resetPhase === 0 && (
          <button onClick={() => setResetPhase(1)}
            style={{ padding: "8px 18px", borderRadius: "8px", border: `1px solid ${R}55`, background: R + "12", color: R, fontFamily: FB, fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
            Reset Season…
          </button>
        )}
        {resetPhase === 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", color: R, fontWeight: 600 }}>This will delete ALL scores. Are you sure?</span>
            <button onClick={() => setResetPhase(2)}
              style={{ padding: "7px 16px", borderRadius: "7px", border: `1px solid ${R}`, background: R + "20", color: R, fontFamily: FB, fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              Yes, continue
            </button>
            <button onClick={() => setResetPhase(0)}
              style={{ padding: "7px 14px", borderRadius: "7px", border: `1px solid ${GOLD}44`, background: "transparent", color: M, fontFamily: FB, fontSize: "13px", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}
        {resetPhase === 2 && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", color: R, fontWeight: 700 }}>Last chance — this cannot be undone.</span>
            <button onClick={async () => { setResetPhase(0); await clearSeason?.(); }}
              style={{ padding: "7px 16px", borderRadius: "7px", border: `1px solid ${R}`, background: R, color: "#fff", fontFamily: FB, fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              Delete everything
            </button>
            <button onClick={() => setResetPhase(0)}
              style={{ padding: "7px 14px", borderRadius: "7px", border: `1px solid ${GOLD}44`, background: "transparent", color: M, fontFamily: FB, fontSize: "13px", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}
      </AccordionSection>

      </>}
    </div>
  );
}

const exportBtn = {
  padding: "8px 16px", borderRadius: "8px", border: `1px solid ${GOLD}44`,
  background: "transparent", color: GOLD, fontFamily: FB, fontSize: "13px",
  fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em",
};
