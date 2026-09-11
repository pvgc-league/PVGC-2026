import { PAR, SI, RAINOUT_SUB, TEAMS, SCHEDULE } from "../constants/league";
import { stabPts, hcpStr, maxGross, getEffectiveHcp, getEffectiveHcpRaw, computeTeamTotal, matchKey, getLoHiOrder, calcPace } from "../lib/leagueLogic";
import { BG, CARD, CARD2, CREAM, FB, FD, G, GO, GOLD, M, R } from "../constants/theme";
import { fmtDate } from "../lib/format";
import { Tag, PtsBadge } from "./ui";
import { useState, useEffect, useRef } from "react";

const LOST_BALL_SECS = 180;

// Module-level AudioContext — created on first user tap so iOS allows it later
let _audioCtx = null;

function unlockAudio() {
  try {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    // Play a silent buffer — fully unlocks iOS audio policy
    const buf = _audioCtx.createBuffer(1, 1, 22050);
    const src = _audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_audioCtx.destination);
    src.start(0);
  } catch(e) {}
}

function playHorn() {
  try {
    const ctx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    // Clown horn: three descending "honk" blasts
    const honks = [
      { startFreq: 480, endFreq: 320, start: 0.0, dur: 0.25 },
      { startFreq: 420, endFreq: 280, start: 0.3, dur: 0.25 },
      { startFreq: 360, endFreq: 220, start: 0.6, dur: 0.35 },
    ];
    honks.forEach(({ startFreq, endFreq, start, dur }) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(startFreq, ctx.currentTime + start);
      osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + start + dur);
      env.gain.setValueAtTime(0, ctx.currentTime + start);
      env.gain.linearRampToValueAtTime(0.6, ctx.currentTime + start + 0.02);
      env.gain.setValueAtTime(0.6, ctx.currentTime + start + dur - 0.05);
      env.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
      osc.connect(env);
      env.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    });
  } catch(e) {}
}

// liftPx raises the timer clear of play mode's fixed dock; hideButton tucks the
// floating button away while the bonus drawer is open so it can't sit on top of it.
function LostBallTimer({ liftPx = 0, hideButton = false }) {
  const [running, setRunning] = useState(false);
  const [secsLeft, setSecsLeft] = useState(LOST_BALL_SECS);
  const [expired, setExpired] = useState(false);
  const intervalRef = useRef(null);

  function start() {
    unlockAudio(); // must happen during the tap — unlocks iOS audio
    setSecsLeft(LOST_BALL_SECS);
    setExpired(false);
    setRunning(true);
  }

  function cancel() {
    setRunning(false);
    setExpired(false);
    setSecsLeft(LOST_BALL_SECS);
    clearInterval(intervalRef.current);
  }

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecsLeft(s => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          setExpired(true);
          playHorn();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  const timeStr = `${mins}:${String(secs).padStart(2, "0")}`;
  const urgent = secsLeft <= 30 && running;
  const pct = secsLeft / LOST_BALL_SECS;

  return (
    <>
      {/* Floating button — bottom right */}
      {!running && !expired && !hideButton && (
        <button onClick={start}
          title="Start 3-min lost ball timer"
          style={{
            position: "fixed", bottom: `${20 + liftPx}px`, right: "18px", zIndex: 47,
            width: "52px", height: "52px", borderRadius: "50%",
            background: GOLD + "22", border: `2px solid ${GOLD}66`,
            color: GOLD, fontSize: "22px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)", touchAction: "manipulation",
          }}>
          ⏱
        </button>
      )}

      {/* Running / expired banner */}
      {(running || expired) && (
        <div style={{
          position: "fixed", bottom: `${liftPx}px`, left: "0", right: "0", zIndex: 100,
          background: expired ? R : urgent ? R + "ee" : "rgba(20,45,20,0.96)",
          borderTop: `3px solid ${expired ? R : urgent ? R : GOLD}`,
          padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px",
          boxShadow: "0 -4px 16px rgba(0,0,0,0.3)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1 }}>
            <span style={{ fontSize: "26px" }}>{expired ? "🚫" : "⏱"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: expired ? "#fff" : GOLD, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "2px" }}>
                {expired ? "Time's Up — Lost Ball!" : "Lost Ball Timer"}
              </div>
              {!expired && (
                <>
                  <div style={{ fontFamily: FB, fontSize: "32px", fontWeight: 700, color: urgent ? "#fff" : GOLD, lineHeight: 1 }}>
                    {timeStr}
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: "3px", background: "rgba(255,255,255,0.15)", borderRadius: "2px", marginTop: "4px" }}>
                    <div style={{
                      height: "100%", borderRadius: "2px",
                      background: urgent ? "#fff" : GOLD,
                      width: `${pct * 100}%`,
                      transition: "width 1s linear",
                    }} />
                  </div>
                </>
              )}
              {expired && (
                <div style={{ fontSize: "14px", color: "#fff", fontWeight: 600 }}>
                  Drop and play a penalty stroke
                </div>
              )}
            </div>
          </div>
          <button onClick={cancel}
            style={{
              padding: "10px 20px", borderRadius: "9px", fontFamily: FB, fontSize: "14px",
              fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
              border: "2px solid rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.15)", color: "#fff",
            }}>
            {expired ? "Dismiss" : "Cancel"}
          </button>
        </div>
      )}
    </>
  );
}

function ScoringScreen({
  playMode,
  setPlayMode,
  selWeek,
  setWeek,
  selTeam,
  setTeam,
  opp,
  match,
  setMatch,
  hole,
  setHole,
  t1id,
  t2id,
  league,
  saveLeague,
  weekBonus,
  cancelledWeeks,
  toggleCancelWeek,
  confirmMatch,
  unlockMatch,
  currentUserTid,
  isAdmin,
}) {
  const isReadOnly = (league.readOnlyWeeks || []).includes(selWeek);
  const isCancelled = cancelledWeeks?.has(selWeek);
  const [tlow, thigh] = t1id && t2id ? (t1id<t2id?[t1id,t2id]:[t2id,t1id]) : [0,0];
  const mk = tlow && thigh ? matchKey(selWeek, tlow, thigh) : null;
  const matchDoc = mk ? league.results[selWeek]?.[mk] : null;
  const isLocked = !!(matchDoc?.locked);
  const canEdit = isAdmin || (currentUserTid != null && (currentUserTid === t1id || currentUserTid === t2id));
  const isDisabled = isLocked || isReadOnly || !canEdit;
  const confirmations = matchDoc?.confirmations || {};
  const hasConfirmed = !!(confirmations[t1id]);
  const oppConfirmed = !!(confirmations[t2id]);

  const effH = (hi) =>
    match.rainout && hi >= match.holesPlayed && RAINOUT_SUB[hi] !== undefined
      ? RAINOUT_SUB[hi]
      : hi;
  const isRain = (hi) =>
    match.rainout && hi >= match.holesPlayed && RAINOUT_SUB[hi] !== undefined;

  function setScoreVal(tIdx, pi, hi, val) {
    setMatch((prev) => {
      const n = { ...prev, t1scores: prev.t1scores.map((a) => [...a]), t2scores: prev.t2scores.map((a) => [...a]) };
      if (tIdx === 0) n.t1scores[pi][hi] = val;
      else n.t2scores[pi][hi] = val;
      return n;
    });
  }

  function setTypeVal(tIdx, pi, val) {
    setMatch((prev) => {
      const n = {
        ...prev,
        t1types: [...(Array.isArray(prev.t1types) ? prev.t1types : ["normal","normal"])],
        t2types: [...(Array.isArray(prev.t2types) ? prev.t2types : ["normal","normal"])],
      };
      if (tIdx === 0) n.t1types[pi] = val;
      else n.t2types[pi] = val;
      if (val === "phantom" || val === "sub") {
        const sc = tIdx === 0 ? prev.t1scores.map((a) => [...a]) : prev.t2scores.map((a) => [...a]);
        for (let h = 0; h < 9; h++) sc[pi][h] = 0;
        if (tIdx === 0) n.t1scores = sc;
        else n.t2scores = sc;
      }
      return n;
    });
  }

  function printScorecard() {
    if (!opp) return;
    const getHcpForPrint = (tid, pi) => getEffectiveHcp(tid, pi, selWeek, league.results, league.handicaps, league.hcpOverrides || {}, league.cancelledWeeks);
    const snap = matchDoc?.hcpSnapshot;
    const { loPi: o1lo, hiPi: o1hi } = getLoHiOrder(t1id, selWeek, league, snap);
    const { loPi: o2lo, hiPi: o2hi } = getLoHiOrder(t2id, selWeek, league, snap);
    const players = [
      { tid: t1id, tIdx: 0, pi: o1lo, label: "Low"  },
      { tid: t1id, tIdx: 0, pi: o1hi, label: "High" },
      { tid: t2id, tIdx: 1, pi: o2lo, label: "Low"  },
      { tid: t2id, tIdx: 1, pi: o2hi, label: "High" },
    ].map(p => {
      const hcp = getHcpForPrint(p.tid, p.pi);
      // strokes per hole (0, 1, or 2)
      const strokes = Array(9).fill(0).map((_, h) => hcpStr(hcp, SI[h]));
      return {
        ...p,
        hcp,
        strokes,
        name: TEAMS[p.tid]?.[p.pi === 0 ? "p1" : "p2"] || "",
      };
    });

    const dateStr = fmtDate(SCHEDULE[selWeek]?.date) || "";
    const t1name = TEAMS[t1id]?.name || `Team ${t1id}`;
    const t2name = TEAMS[t2id]?.name || `Team ${t2id}`;

    // Stroke indicator: shaded cell bg + small dots at top
    const scoreCell = (str) => {
      const bg = str === 2 ? "#c8e6c9" : str === 1 ? "#e8f5e9" : "#fff";
      const dots = str > 0 ? `<div style="font-size:7px;color:#1a6b3a;line-height:1;margin-bottom:1px">${"●".repeat(str)}</div>` : "";
      return `<td style="background:${bg};width:36px;height:38px;vertical-align:top;padding-top:3px">${dots}</td>`;
    };

    const playerRows = players.map((p, pi) => {
      const isFirst = pi === 0 || pi === 2;
      const sep = isFirst && pi === 2 ? `<tr><td colspan="12" style="height:6px;background:#e8f0e8;border:none"></td></tr>` : "";
      return sep + `<tr>
        <td style="text-align:left;padding:4px 6px;white-space:nowrap;font-size:11px">
          <strong>${p.name}</strong><br>
          <span style="color:#666;font-size:10px">HCP ${p.hcp} · ${p.label}</span>
        </td>
        ${p.strokes.map(str => scoreCell(str)).join("")}
        <td style="width:38px;height:38px;background:#f5f5f5"></td>
      </tr>`;
    });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>PVGC Wk ${selWeek}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;color:#111;background:#fff;padding:14px 16px}
h1{font-size:14px;font-weight:700;text-align:center;margin-bottom:2px}
.sub{font-size:11px;text-align:center;color:#555;margin-bottom:10px}
table{width:100%;border-collapse:collapse}
td,th{border:1px solid #999;text-align:center;vertical-align:middle}
.hdr th{background:#1e4d2b;color:#fff;font-size:11px;font-weight:600;padding:4px 2px;height:24px}
.par td{background:#f5f0e0;font-weight:700;font-size:12px;padding:3px 2px}
.si  td{background:#fafafa;font-size:10px;color:#888;padding:2px}
.match-section{margin-top:10px;font-size:11px}
.match-row{display:flex;gap:8px;margin-top:6px;align-items:center}
.match-box{border:1px solid #bbb;border-radius:4px;padding:5px 10px;flex:1;font-size:11px}
.match-label{font-weight:700;font-size:10px;color:#555;margin-bottom:3px}
.score-line{display:flex;justify-content:space-between;align-items:center;gap:6px}
.score-blank{border-bottom:1px solid #333;width:32px;height:18px;display:inline-block}
@media print{body{padding:6px};@page{size:portrait;margin:10mm}}
</style></head><body>

<h1>PVGC Golf League — Week ${selWeek}</h1>
<div class="sub">${t1name} &nbsp;vs&nbsp; ${t2name}${dateStr ? " &nbsp;·&nbsp; " + dateStr : ""}</div>

<table>
  <thead>
    <tr class="hdr">
      <th style="text-align:left;padding-left:6px;width:130px">Player</th>
      ${Array(9).fill(0).map((_,h) => `<th style="width:36px">${h+1}</th>`).join("")}
      <th style="width:38px">Total</th>
    </tr>
    <tr class="par">
      <td style="text-align:left;padding-left:6px">Par</td>
      ${PAR.map(p => `<td>${p}</td>`).join("")}
      <td>36</td>
    </tr>
    <tr class="si">
      <td style="text-align:left;padding-left:6px">SI</td>
      ${SI.map(s => `<td>${s}</td>`).join("")}
      <td></td>
    </tr>
  </thead>
  <tbody>
    ${playerRows.join("")}
  </tbody>
</table>

<div class="match-section">
  <div style="font-size:10px;font-weight:700;color:#1e4d2b;margin-bottom:4px;letter-spacing:.06em">MATCH RESULTS</div>
  <div class="match-row">
    <div class="match-box">
      <div class="match-label">LOW vs LOW</div>
      <div class="score-line">
        <span>${players[0].name.split(" ").slice(-1)[0]}</span>
        <span class="score-blank"></span>
        <span style="color:#999">—</span>
        <span class="score-blank"></span>
        <span>${players[2].name.split(" ").slice(-1)[0]}</span>
      </div>
    </div>
    <div class="match-box">
      <div class="match-label">HIGH vs HIGH</div>
      <div class="score-line">
        <span>${players[1].name.split(" ").slice(-1)[0]}</span>
        <span class="score-blank"></span>
        <span style="color:#999">—</span>
        <span class="score-blank"></span>
        <span>${players[3].name.split(" ").slice(-1)[0]}</span>
      </div>
    </div>
    <div class="match-box" style="flex:0.6">
      <div class="match-label">MATCH PTS</div>
      <div class="score-line">
        <span style="font-size:10px">${t1name.split(" - ")[0]}</span>
        <span class="score-blank"></span>
        <span style="color:#999">—</span>
        <span class="score-blank"></span>
        <span style="font-size:10px">${t2name.split(" - ")[0]}</span>
      </div>
    </div>
  </div>
  <div style="font-size:9px;color:#888;margin-top:5px">● = handicap stroke &nbsp;|&nbsp; ●● = 2 strokes &nbsp;|&nbsp; Shaded cells indicate stroke holes</div>
</div>
</body></html>`;

    const w = window.open("", "_blank", "width=780,height=600");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  // Pace nudge — private to this group. Only shown when a full hole has opened up
  // beyond the natural slot separation, so normal noise stays quiet.
  const pace = playMode ? calcPace(selWeek, league.results, SCHEDULE, selTeam) : null;
  const behindBy = pace && pace.behind >= 1 ? pace.behind : 0;

  return (<div style={{ maxWidth: "820px", margin: "0 auto", padding: "14px 10px" }}>

    {playMode && (
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        background: "#16351f", color: "#fff", margin: "-14px -10px 12px",
        padding: "9px 12px",
      }}>
        <div style={{ flex: 1, fontWeight: 700, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Wk {selWeek} · {TEAMS[selTeam]?.name}
        </div>
        <button onClick={() => setPlayMode(false)}
          style={{ background: "rgba(255,255,255,0.16)", border: "none", color: "#fff", borderRadius: "6px", padding: "5px 9px", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: FB }}>
          Exit
        </button>
      </div>
    )}

    {playMode && behindBy > 0 && (
      <div style={{
        display: "flex", alignItems: "center", gap: "7px",
        background: GO + "1a", border: `1px solid ${GO}44`, borderRadius: "10px",
        padding: "8px 11px", margin: "0 0 12px", fontSize: "12.5px", color: GO, fontWeight: 600,
      }}>
        <span style={{ fontSize: "14px" }}>⏱</span>
        <span>
          {behindBy === 1 ? "About a hole behind" : `About ${behindBy} holes behind`}
          {pace.basis === "ahead" ? " the group ahead" : " the field"} — pick it up if you can.
        </span>
      </div>
    )}

    {/* Week / Team selectors */}
    {!playMode && (
    <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <span style={{ fontSize: "12px", color: M, letterSpacing: "0.08em", textTransform: "uppercase" }}>Week</span>
        <select value={selWeek} onChange={e => setWeek(parseInt(e.target.value))}
          style={{
            background: "rgba(255,255,255,0.95)", border: `1px solid ${GOLD}44`,
            borderRadius: "7px", color: CREAM, fontFamily: FB, fontSize: "14px", padding: "6px 9px", cursor: "pointer", outline: "none"
          }}>
          {Array.from({ length: 21 }, (_, i) => i + 1).map(w => {
            const d = SCHEDULE[w]?.date;
            const round = { 18: "Knockdown", 19: "Quarterfinals", 20: "Semifinals", 21: "Championship" }[w];
            const label = round ? (d ? `${round} · ${fmtDate(d)}` : round) : fmtDate(d);
            return <option key={w} value={w}>W{w} — {label}</option>;
          })}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <span style={{ fontSize: "12px", color: M, letterSpacing: "0.08em", textTransform: "uppercase" }}>Team</span>
        <select value={selTeam} onChange={e => setTeam(parseInt(e.target.value))}
          style={{
            background: "rgba(255,255,255,0.95)", border: `1px solid ${GOLD}44`,
            borderRadius: "7px", color: CREAM, fontFamily: FB, fontSize: "14px", padding: "6px 9px", cursor: "pointer", outline: "none"
          }}>
          {Array.from({ length: 18 }, (_, i) => i + 1).map(t => (
            <option key={t} value={t}>T{t}: {TEAMS[t]?.name}</option>
          ))}
        </select>
      </div>
      {opp && (
        <button onClick={printScorecard} style={{
          padding: "6px 12px", borderRadius: "7px", border: `1px solid ${GOLD}44`,
          background: "rgba(26,61,36,0.06)", color: CREAM, fontFamily: FB, fontSize: "13px",
          cursor: "pointer", display: "flex", alignItems: "center", gap: "5px"
        }}>
          🖨 Print
        </button>
      )}
      {cancelledWeeks?.has(selWeek)
        ? <div style={{ marginLeft: "auto", fontSize: "13px", color: "#e6a817", fontWeight: 700 }}>⛈ Cancelled</div>
        : opp
          ? <div style={{ marginLeft: "auto", fontSize: "14px", color: M, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
              <span>vs <span style={{ color: GO }}>{TEAMS[opp]?.name}</span></span>
              {match.updatedBy && <span style={{ fontSize: "12px", color: GOLD, fontFamily: FB }}>
                ✎ {match.updatedBy}{match.updatedAt ? " · " + match.updatedAt : ""}
              </span>}
            </div>
          : <div style={{ marginLeft: "auto", fontSize: "13px", color: R }}>No match this week</div>
      }
      {opp && !isCancelled && (
        <button onClick={() => setPlayMode(true)}
          style={{
            marginLeft: "auto", background: G, border: "none", color: "#fff",
            borderRadius: "9px", padding: "8px 13px", fontSize: "13px", fontWeight: 700,
            cursor: "pointer", fontFamily: FB, display: "flex", alignItems: "center", gap: "6px",
          }}
          title="Strip the page down for entering scores on the course">
          ⛳ Play mode
        </button>
      )}
    </div>
    )}

    {!canEdit && currentUserTid && opp && (
      <div style={{ background: "rgba(180,120,0,0.1)", border: `1px solid ${GOLD}44`, borderRadius: "10px", padding: "10px 14px", marginBottom: "12px", fontSize: "13px", color: GOLD }}>
        View only — you can only enter scores for your own team's match.
      </div>
    )}


    {!opp ? (
      <div style={{ textAlign: "center", padding: "50px 20px", color: M, fontSize: "12px" }}>
        No match scheduled for Week {selWeek}.
      </div>
    ) : (<>

      {/* Rainout toggle */}
      {!playMode && (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "7px",
        background: CARD, border: `1px solid ${match.rainout ? GO + "44" : "rgba(255,255,255,0.95)"}`,
        borderRadius: "12px", padding: "9px 13px", marginBottom: "13px"
      }}>
        <div style={{ fontSize: "14px" }}>☔ Rainout
          <span style={{ fontSize: "12px", color: M, marginLeft: "7px" }}>H7→H1 · H8→H4 · H9→H3</span>
        </div>
        <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
          {match.rainout && (
            <select value={match.holesPlayed} onChange={e => setMatch(p => ({ ...p, holesPlayed: parseInt(e.target.value) }))}
              style={{
                background: "rgba(255,255,255,0.95)", border: `1px solid ${GOLD}44`,
                borderRadius: "6px", color: CREAM, fontFamily: FB, fontSize: "13px", padding: "4px 8px", cursor: "pointer", outline: "none"
              }}>
              {[6, 7, 8].map(n => <option key={n} value={n}>Stopped H{n}</option>)}
            </select>
          )}
          <button onClick={() => setMatch(p => ({ ...p, rainout: !p.rainout }))}
            style={{
              width: "38px", height: "20px", borderRadius: "13px", border: "none", cursor: "pointer",
              background: match.rainout ? GOLD : "rgba(255,255,255,0.6)", position: "relative", transition: "background 0.2s"
            }}>
            <span style={{
              position: "absolute", top: "2px", left: match.rainout ? "19px" : "2px",
              width: "16px", height: "16px", borderRadius: "50%", background: match.rainout ? BG : "#888", transition: "left 0.2s"
            }} />
          </button>
        </div>
      </div>
      )}

      {/* ── 4-ROW SCORECARD ── */}
      {(() => {
        // Build the 4 players in match order
        const hcpSnap = matchDoc?.hcpSnapshot;
        const { loPi: o1lo, hiPi: o1hi } = getLoHiOrder(t1id, selWeek, league, hcpSnap);
        const { loPi: o2lo, hiPi: o2hi } = getLoHiOrder(t2id, selWeek, league, hcpSnap);

        // rows: [{label, tIdx, pi, tid, color, rival: {tIdx,pi,tid}}]
        // Grouped by team: T1-Low, T1-High, T2-Low, T2-High
        const rows = [
          { label: "Low",  tIdx: 0, pi: o1lo, tid: t1id, color: G,  rivalTIdx: 1, rivalPi: o2lo },
          { label: "High", tIdx: 0, pi: o1hi, tid: t1id, color: G,  rivalTIdx: 1, rivalPi: o2hi },
          { label: "Low",  tIdx: 1, pi: o2lo, tid: t2id, color: GO, rivalTIdx: 0, rivalPi: o1lo },
          { label: "High", tIdx: 1, pi: o2hi, tid: t2id, color: GO, rivalTIdx: 0, rivalPi: o1hi },
        ];

        // Play mode shows first names. 13 of 36 players share one (three Scotts),
        // so fall back to a last initial only when two players ON THIS CARD clash —
        // short almost always, unambiguous exactly when it matters.
        const fullNameFor = (r) => (match.subs && match.subs[`${r.tid}-${r.pi}`])
          ? match.subs[`${r.tid}-${r.pi}`].name
          : (TEAMS[r.tid]?.[r.pi === 0 ? "p1" : "p2"] || "");
        const firstOf = (n) => (n || "").trim().split(/\s+/)[0] || "";
        const firstCounts = rows.reduce((acc, r) => {
          const f = firstOf(fullNameFor(r));
          acc[f] = (acc[f] || 0) + 1;
          return acc;
        }, {});
        const shortName = (r) => {
          const full = fullNameFor(r);
          const first = firstOf(full);
          if (firstCounts[first] < 2) return first;
          const last = (full || "").trim().split(/\s+/).slice(1).join(" ");
          return last ? `${first} ${last[0]}.` : first;
        };

        // Grouped by matchup for play mode: low pair, then high pair.
        const orderedRows = playMode ? [rows[0], rows[2], rows[1], rows[3]] : rows;

        const getGross = (tIdx, pi, hi) => (tIdx === 0 ? match.t1scores : match.t2scores)[pi]?.[hi] || 0;
        // Score-aware rainout sub: only redirect to substitute hole if actual hole has no score
        const scoreEffH = (tIdx, pi, hi) => {
          if (!match.rainout || RAINOUT_SUB[hi] === undefined) return hi;
          return getGross(tIdx, pi, hi) ? hi : RAINOUT_SUB[hi];
        };
        const scoreName = (gross, par) => {
          if (!gross) return "";
          const d = gross - par;
          if (d <= -3) return "Eagle+";
          if (d === -2) return "Eagle";
          if (d === -1) return "Birdie";
          if (d === 0) return "Par";
          if (d === 1) return "Bogey";
          if (d === 2) return "Dbl Bogey";
          return "+" + d;
        };
        const getNet = (tIdx, pi, tid, hi) => {
          const gross = getGross(tIdx, pi, scoreEffH(tIdx, pi, hi));
          if (!gross) return null;
          const strokes = hcpStr(getHcp(tid, pi), SI[hi]);
          return Math.min(gross, maxGross(PAR[scoreEffH(tIdx, pi, hi)], strokes)) - strokes;
        };
        const getGrossTotal = (tIdx, pi) => Array(9).fill(0).reduce((s, _, h) => s + (getGross(tIdx, pi, scoreEffH(tIdx, pi, h)) || 0), 0);
        const getMaxTotal = (tIdx, pi, tid) => Array(9).fill(0).reduce((s, _, h) => {
          const g = getGross(tIdx, pi, scoreEffH(tIdx, pi, h)); if (!g) return s;
          const str = hcpStr(getHcp(tid, pi), SI[h]);
          return s + Math.min(g, maxGross(PAR[h], str));
        }, 0);
        const getNetTotal = (tIdx, pi, tid) => Array(9).fill(0).reduce((s, _, h) => {
          const g = getGross(tIdx, pi, scoreEffH(tIdx, pi, h)); if (!g) return s;
          const str = hcpStr(getHcp(tid, pi), SI[h]);
          return s + Math.min(g, maxGross(PAR[h], str)) - str;
        }, 0);
        const getType = (tIdx, pi) => (tIdx === 0 ? match.t1types : match.t2types)[pi] || "normal";
        const getHcp = (tid, pi) => {
          const sub = match.subs && match.subs[`${tid}-${pi}`];
          if (sub && Number.isFinite(sub.hcp)) return sub.hcp; // playing sub off their own handicap
          return getEffectiveHcp(tid, pi, selWeek, league.results, league.handicaps, league.hcpOverrides||{}, league.cancelledWeeks);
        };

        const getPtsFor = (tIdx, pi, tid, hi) => {
          const type = getType(tIdx, pi);
          if (type === "sub") return 6;
          const gross = getGross(tIdx, pi, scoreEffH(tIdx, pi, hi));
          if (!gross) return null;
          return stabPts(gross, PAR[hi], hcpStr(getHcp(tid, pi), SI[hi]));
        };

        const getRunTotal = (tIdx, pi, tid) => {
          if (isCancelled) return 0;
          const type = getType(tIdx, pi);
          if (type === "sub") return 6;
          if (type === "phantom") return 2;
          let t = 0;
          for (let h = 0; h < 9; h++) t += getPtsFor(tIdx, pi, tid, h) || 0;
          return t;
        };

        // Individual match pts per pairing
        const matchResults = [
          {
            label: "Low vs Low",
            t1name: TEAMS[t1id]?.[o1lo === 0 ? "p1" : "p2"],
            t2name: TEAMS[t2id]?.[o2lo === 0 ? "p1" : "p2"],
            t1pts: getRunTotal(0, o1lo, t1id),
            t2pts: getRunTotal(1, o2lo, t2id)
          },
          {
            label: "High vs High",
            t1name: TEAMS[t1id]?.[o1hi === 0 ? "p1" : "p2"],
            t2name: TEAMS[t2id]?.[o2hi === 0 ? "p1" : "p2"],
            t1pts: getRunTotal(0, o1hi, t1id),
            t2pts: getRunTotal(1, o2hi, t2id)
          },
        ];

        return (<>
          {/* Hole navigation */}
          <div style={{ display: "flex", gap: "4px", justifyContent: "center", alignItems: "center", marginBottom: "13px", flexWrap: "wrap", minHeight: "44px" }}>
            {Array(9).fill(0).map((_, h) => {
              const done = rows.every(r => {
                const type = getType(r.tIdx, r.pi);
                return type === "sub" || type === "phantom" || getGross(r.tIdx, r.pi, scoreEffH(r.tIdx, r.pi, h)) > 0;
              });
              return (
                <button key={h} onClick={() => setHole(h)}
                  style={{
                    // The hole you're on is filled solid green and sized up — the old
                    // gold outline read as just another state at arm's length.
                    width: hole === h ? "42px" : "34px",
                    height: hole === h ? "42px" : "34px",
                    borderRadius: "50%", fontFamily: FB, cursor: "pointer",
                    fontSize: hole === h ? "18px" : "14px",
                    fontWeight: hole === h ? 800 : 400,
                    border: hole === h ? `2px solid ${G}` : done ? `1px solid ${G}55` : `1px solid ${GOLD}33`,
                    background: hole === h ? G : done ? G + "0a" : "transparent",
                    color: hole === h ? "#fff" : done ? G + "cc" : M,
                    boxShadow: hole === h ? `0 2px 8px ${G}55` : "none",
                    position: "relative", flexShrink: 0, transition: "all .12s",
                  }}>
                  {h + 1}
                  {isRain(h) && <span style={{ position: "absolute", top: 0, right: 1, fontSize: "7px", color: GO }}>R</span>}
                </button>
              );
            })}
          </div>

          {/* Score entry card — all 4 players, current hole */}
          <div style={{
            background: CARD2, border: `1px solid ${GOLD}33`, borderRadius: "13px",
            overflow: "hidden", marginBottom: "12px"
          }}>
            {/* Hole header */}
            <div style={{
              background: "rgba(26,61,36,0.08)", borderBottom: `1px solid ${GOLD}44`,
              padding: "10px 15px", display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontFamily: FD, fontSize: "19px", color: GOLD }}>Hole {hole + 1}</span>
                <span style={{ fontSize: "13px", color: M }}>Par {PAR[hole]}</span>
                <span style={{ fontSize: "13px", color: M }}>SI {SI[hole]}</span>
                {isRain(hole) && <Tag color={GO}>☔ → H{RAINOUT_SUB[hole] + 1}</Tag>}
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                <button onClick={() => setHole(h => Math.max(0, h - 1))} disabled={hole === 0}
                  style={{
                    padding: "5px 12px", borderRadius: "6px", border: `1px solid ${GOLD}33`,
                    background: "rgba(26,61,36,0.04)", color: CREAM, fontFamily: FB, fontSize: "13px",
                    cursor: hole === 0 ? "not-allowed" : "pointer", opacity: hole === 0 ? 0.3 : 1
                  }}>Prev Hole</button>
                <button onClick={() => setHole(h => Math.min(8, h + 1))} disabled={hole === 8}
                  style={{
                    padding: "5px 12px", borderRadius: "6px", border: `1px solid ${GOLD}33`,
                    background: "rgba(26,61,36,0.04)", color: CREAM, fontFamily: FB, fontSize: "13px",
                    cursor: hole === 8 ? "not-allowed" : "pointer", opacity: hole === 8 ? 0.3 : 1
                  }}>Next Hole</button>
              </div>
            </div>

            {/* 4 player rows */}
            {orderedRows.map((r, ri) => {
              const type = getType(r.tIdx, r.pi);
              const hcp = getHcp(r.tid, r.pi);
              const strokes = hcpStr(hcp, SI[hole]);
              const gross = getGross(r.tIdx, r.pi, scoreEffH(r.tIdx, r.pi, hole));
              const pts = getPtsFor(r.tIdx, r.pi, r.tid, hole);
              const subForRow = match.subs && match.subs[`${r.tid}-${r.pi}`];
              const pname = playMode ? shortName(r) : (subForRow ? subForRow.name : (TEAMS[r.tid]?.[r.pi === 0 ? "p1" : "p2"] || ""));
              // Team order separates after 2; matchup order needs a header before each pair.
              const isSep = !playMode && ri === 2;
              const matchupHead = playMode && (ri === 0 || ri === 2) ? (ri === 0 ? "Low vs Low" : "High vs High") : null;

              const cap = maxGross(PAR[scoreEffH(r.tIdx, r.pi, hole)], strokes);
              const adjGross = (delta) => {
                if (isDisabled) return;
                const cur = getGross(r.tIdx, r.pi, scoreEffH(r.tIdx, r.pi, hole));
                const next = Math.max(1, (cur || PAR[hole]) + delta);
                setScoreVal(r.tIdx, r.pi, scoreEffH(r.tIdx, r.pi, hole), next);
              };
              const atMax = gross > 0 && gross > cap; // above cap — indicator only, not a blocker

              const ptColor = pts === null ? M : pts >= 3 ? G : pts === 1 ? "#c0a060" : pts === 0 ? M : R;

              return (
                <div key={ri}>
                  {isSep && <div style={{ height: "1px", background: "rgba(26,61,36,0.08)", margin: "0 0" }} />}
                  {matchupHead && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: "8px", padding: "4px 14px",
                      background: ri === 0 ? G + "1a" : GOLD + "1f",
                    }}>
                      <span style={{
                        fontSize: "9px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
                        color: ri === 0 ? G : GOLD,
                      }}>{matchupHead}</span>
                      <i style={{ flex: 1, height: "1px", background: (ri === 0 ? G : GOLD) + "38" }} />
                    </div>
                  )}
                  <div style={{
                    padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px",
                    background: ri % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                    borderBottom: ri < 3 ? `1px solid ${GOLD}22` : "none"
                  }}>

                    {/* Player info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                        <span style={{
                          width: "6px", height: "6px", borderRadius: "50%",
                          background: r.color, flexShrink: 0, display: "inline-block"
                        }} />
                        <span style={{
                          fontSize: "12px", fontWeight: 600, color: CREAM,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        }}>{pname}</span>
                        {!playMode && <Tag color={r.label === "Low" ? "#4db8f0" : "#b97df5"}>{r.label} HCP</Tag>}
                        {type === "sub" && <Tag color={GO}>Sub</Tag>}
                        {type === "phantom" && <Tag color={R}>Phantom</Tag>}
                      </div>
                      <div style={{ fontSize: "12px", color: M, marginTop: "2px", paddingLeft: "14px" }}>
                        HCP {hcp}
                        {strokes > 0 && <span style={{ color: G }}> +{strokes} stroke{strokes > 1 ? "s" : ""}</span>}
                        {strokes < 0 && <span style={{ color: R }}> {strokes} stroke</span>}
                        {/* Running total is noise on the tee — play mode shows the
                            strokes given on this hole and nothing else. */}
                        {!playMode && <>
                          {" · "}
                          <span style={{ color: r.color }}>Total: {getRunTotal(r.tIdx, r.pi, r.tid)}</span>
                        </>}
                      </div>
                    </div>

                    {/* Type selector — hidden in play mode; set it in Entry instead */}
                    {!playMode && <select value={type} onChange={e => !isDisabled && setTypeVal(r.tIdx, r.pi, e.target.value)}
                      disabled={isDisabled}
                      style={{
                        background: "rgba(26,61,36,0.04)", border: `1px solid ${GOLD}33`,
                        borderRadius: "5px", color: CREAM, fontFamily: FB, fontSize: "12px",
                        padding: "3px 5px", cursor: isDisabled ? "not-allowed" : "pointer",
                        outline: "none", flexShrink: 0, opacity: isDisabled ? 0.5 : 1
                      }}>
                      <option value="normal">Regular</option>
                      <option value="sub">Sub</option>
                      <option value="phantom">Phantom</option>
                    </select>}

                    {/* +/- Score entry + net + stab */}
                    {(type === "sub" || type === "phantom") ? (
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        minWidth: "90px", gap: "2px"
                      }}>
                        <span style={{ fontSize: "13px", color: type === "phantom" ? R : GO }}>
                          {type === "phantom" ? "2 pts fixed" : "6 pts fixed"}
                        </span>
                        <span style={{ fontSize: "12px", color: M }}>
                          {type === "phantom" ? "Phantom" : "Sub"}
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                        {/* −/+ stepper */}
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <button onClick={() => adjGross(-1)}
                            style={{
                              width: "42px", height: "52px", borderRadius: "9px 0 0 9px",
                              border: `1px solid ${GOLD}44`, borderRight: "none",
                              background: "rgba(26,61,36,0.08)", color: CREAM, fontSize: "22px",
                              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                              userSelect: "none", touchAction: "manipulation"
                            }}>−</button>
                          <div onClick={() => !gross && !isDisabled && setScoreVal(r.tIdx, r.pi, scoreEffH(r.tIdx, r.pi, hole), PAR[hole])}
                            style={{
                              width: "52px", height: "52px",
                              border: !gross && !isDisabled
                                ? `2px dashed ${G}99`
                                : `1px solid ${atMax ? GO + "99" : GOLD + "44"}`,
                              background: !gross && !isDisabled
                                ? `${G}18`
                                : atMax ? GO + "12" : "rgba(26,61,36,0.08)",
                              display: "flex", flexDirection: "column",
                              alignItems: "center", justifyContent: "center", gap: "1px",
                              cursor: !gross && !isDisabled ? "pointer" : "default",
                              touchAction: "manipulation",
                              borderRadius: "2px",
                            }}>
                            <span style={{ fontSize: !gross ? "11px" : "20px", fontWeight: 700, color: gross ? ptColor : G, lineHeight: 1 }}>
                              {gross ? gross : "PAR"}
                            </span>
                            <span style={{ fontSize: "10px", lineHeight: 1, color: gross ? ptColor : G, opacity: gross ? 1 : 0.8 }}>
                              {!gross ? `tap = ${PAR[hole]}` : scoreName(gross, PAR[hole])}
                            </span>
                          </div>
                          <button onClick={() => adjGross(+1)}
                            style={{
                              width: "42px", height: "52px", borderRadius: "0 9px 9px 0",
                              border: `1px solid ${GOLD}44`, borderLeft: "none",
                              background: "rgba(26,61,36,0.08)", color: CREAM, fontSize: "22px",
                              cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              userSelect: "none", touchAction: "manipulation"
                            }}>+</button>
                        </div>
                        {/* Result column. Play mode shows just net + points — the
                            raw/max breakdown is detail you don't need on the tee. */}
                        {gross > 0 && playMode && (
                          <div style={{ minWidth: "44px", textAlign: "right" }}>
                            <div style={{ fontSize: "15px", fontWeight: 800, color: CREAM, lineHeight: 1 }}>
                              {getNet(r.tIdx, r.pi, r.tid, hole)}
                            </div>
                            <div style={{ fontSize: "10px", color: M, lineHeight: 1, margin: "2px 0 3px" }}>net</div>
                            <div style={{
                              fontSize: "15px", fontWeight: 800, lineHeight: 1,
                              color: pts > 0 ? G : pts < 0 ? R : "#1a2e1a",
                            }}>{pts}</div>
                          </div>
                        )}
                        {gross > 0 && !playMode && (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px", minWidth: "44px" }}>
                            <div style={{ fontSize: "9px", color: M, letterSpacing: "0.04em", lineHeight: 1.2 }}>RAW</div>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: atMax ? GO : CREAM, lineHeight: 1 }}>{gross}</div>
                            <div style={{ fontSize: "9px", color: M, letterSpacing: "0.04em", lineHeight: 1.2 }}>MAX</div>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: CREAM, lineHeight: 1 }}>{cap}</div>
                            <div style={{ fontSize: "9px", color: M, letterSpacing: "0.04em", lineHeight: 1.2 }}>NET</div>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#c8d4c0", lineHeight: 1 }}>
                              {getNet(r.tIdx, r.pi, r.tid, hole)}
                            </div>
                            <PtsBadge pts={pts} />
                          </div>
                        )}
                        {!gross && <div style={{ width: "44px" }} />}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Play mode: one Us / Them / Match strip instead of the per-player
              breakdown cards below — the match state at a glance, nothing else. */}
          {playMode && (() => {
            const teamStab = (tIdx) => rows.filter(r => r.tIdx === tIdx)
              .reduce((sum, r) => sum + getRunTotal(r.tIdx, r.pi, r.tid), 0);
            const us = teamStab(0), them = teamStab(1);
            const diff = us - them;
            const cell = (lbl, val, sub, bg) => (
              <div style={{ flex: 1, padding: "9px 10px", textAlign: "center", background: bg }}>
                <div style={{ fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#a9c6b4" }}>{lbl}</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "#fff", marginTop: "4px" }}>{val}</div>
                <div style={{ fontSize: "10px", color: "#a9c6b4", marginTop: "3px" }}>{sub}</div>
              </div>
            );
            return (
              <div style={{ display: "flex", background: "#1d3f28", borderRadius: "12px", overflow: "hidden", marginBottom: "13px" }}>
                {cell("Us", us, TEAMS[t1id]?.name, "#215030")}
                {cell("Them", them, TEAMS[t2id]?.name, "transparent")}
                {cell("Match", diff > 0 ? `+${diff}` : diff, diff > 0 ? "up" : diff < 0 ? "down" : "level", "transparent")}
              </div>
            );
          })()}

          {/* Head-to-head: low plays low, high plays high — two match points each.
              Kept under the team strip rather than between rows so the card stays clean. */}
          {playMode && (
            <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", marginBottom: "13px" }}>
              {[{ tag: "Low", mine: rows[0], theirs: rows[2] }, { tag: "High", mine: rows[1], theirs: rows[3] }].map((mu, i) => {
                const a = getRunTotal(mu.mine.tIdx, mu.mine.pi, mu.mine.tid);
                const b = getRunTotal(mu.theirs.tIdx, mu.theirs.pi, mu.theirs.tid);
                // green ahead, red behind, neutral when level
                const col = (mine, other) => ({ fontSize: "14px", fontWeight: 800, width: "22px", textAlign: "center", color: mine > other ? G : mine < other ? R : CREAM });
                return (
                  <div key={mu.tag} style={{
                    display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px",
                    borderTop: i === 0 ? "none" : `1px solid ${GOLD}1f`,
                  }}>
                    <span style={{ width: "34px", fontSize: "8.5px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: M }}>
                      {mu.tag}
                    </span>
                    <span style={{ flex: 1, textAlign: "right", fontSize: "12.5px", fontWeight: 600, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {shortName(mu.mine)}
                    </span>
                    <span style={col(a, b)}>{a}</span>
                    <span style={{ fontSize: "9px", fontWeight: 600, color: M }}>vs</span>
                    <span style={col(b, a)}>{b}</span>
                    <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {shortName(mu.theirs)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Gross / Net / Stab summary strip */}
          {!playMode && (
          <div style={{
            background: CARD2, border: `1px solid ${GOLD}22`,
            borderRadius: "14px", padding: "10px 14px", marginBottom: "13px",
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px"
          }}>
            {rows.map((r, ri) => {
              const type = getType(r.tIdx, r.pi);
              const pname = TEAMS[r.tid]?.[r.pi === 0 ? "p1" : "p2"] || "";
              const gross = (type === "sub" || type === "phantom") ? null : getGrossTotal(r.tIdx, r.pi);
              const maxT  = (type === "sub" || type === "phantom") ? null : getMaxTotal(r.tIdx, r.pi, r.tid);
              const net = (type === "sub" || type === "phantom") ? null : getNetTotal(r.tIdx, r.pi, r.tid);
              const stab = getRunTotal(r.tIdx, r.pi, r.tid);
              const rivalStab = getRunTotal(r.rivalTIdx, r.rivalPi, ri < 2 ? t2id : t1id);
              const winning = stab > rivalStab, losing = stab < rivalStab;
              return (
                <div key={ri} style={{
                  background: "rgba(26,61,36,0.05)", borderRadius: "8px",
                  padding: "8px 10px", border: `1px solid ${winning ? r.color + "33" : losing ? R + "22" : "rgba(26,61,36,0.04)"}`
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "5px" }}>
                    <span style={{
                      width: "5px", height: "5px", borderRadius: "50%", background: r.color,
                      display: "inline-block", flexShrink: 0
                    }} />
                    <span style={{
                      fontSize: "13px", fontWeight: 600, color: CREAM,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                    }}>{pname}{type === "phantom" ? " (P)" : type === "sub" ? " (S)" : ""}</span>
                    {winning && <span style={{ marginLeft: "auto", fontSize: "12px", color: r.color }}>▲ leading</span>}
                    {losing && <span style={{ marginLeft: "auto", fontSize: "12px", color: R }}>▼ trailing</span>}
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: M, letterSpacing: "0.04em" }}>RAW</div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: CREAM, lineHeight: 1.1 }}>
                        {(type === "sub" || type === "phantom") ? "—" : gross || "—"}
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: M, letterSpacing: "0.04em" }}>MAX</div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: gross !== maxT ? GO : CREAM, lineHeight: 1.1 }}>
                        {(type === "sub" || type === "phantom") ? "—" : maxT || "—"}
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: M, letterSpacing: "0.04em" }}>NET</div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "#c8d4c0", lineHeight: 1.1 }}>
                        {(type === "sub" || type === "phantom") ? "—" : net || "—"}
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: G, letterSpacing: "0.04em" }}>STAB</div>
                      <div style={{
                        fontSize: "15px", fontWeight: 700,
                        color: winning ? r.color : losing ? R : G, lineHeight: 1.1
                      }}>{stab}</div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Team totals row */}
            {[{tid: t1id, tIdx: 0, color: G}, {tid: t2id, tIdx: 1, color: GO}].map(({tid, tIdx, color}) => {
              const teamRows = rows.filter(r => r.tIdx === tIdx);
              const stab = teamRows.reduce((s, r) => s + getRunTotal(r.tIdx,r.pi,r.tid), 0);
              const rivalStab = rows.filter(r => r.tIdx !== tIdx).reduce((s, r) => s + getRunTotal(r.tIdx,r.pi,r.tid), 0);
              const winning = stab > rivalStab, losing = stab < rivalStab;
              return (
                <div key={tid} style={{
                  gridColumn: "span 1", background: color + "10", borderRadius: "8px",
                  padding: "8px 10px", border: `1px solid ${winning ? color+"44" : losing ? R+"22" : color+"22"}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between"
                }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {TEAMS[tid]?.name}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "9px", color: G, letterSpacing: "0.04em" }}>STAB</div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: winning ? color : losing ? R : G, lineHeight: 1.1 }}>{stab}</div>
                  </div>
                </div>
              );
            })}
          </div>
          )}

          {/* Full 4-row scrollable scorecard */}
          {!playMode && (
          <div style={{
            background: CARD2, border: `1px solid ${GOLD}22`,
            borderRadius: "14px", overflow: "hidden", marginBottom: "12px"
          }}>
            <div style={{
              padding: "8px 13px", borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <span style={{ fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase", color: M }}>Full Scorecard</span>
              <span style={{ fontSize: "12px", color: M }}>gross <span style={{ color: "#555" }}>·</span> <span style={{ color: G }}>stab</span></span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", minWidth: "520px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <td style={{ padding: "6px 10px", color: M, fontSize: "12px", whiteSpace: "nowrap" }}>Player</td>
                    {Array(9).fill(0).map((_, h) => (
                      <td key={h} style={{
                        padding: "6px 4px", textAlign: "center",
                        color: h === hole ? G : M, fontWeight: h === hole ? 600 : 400, fontSize: "12px"
                      }}>
                        {h + 1}{isRain(h) && <span style={{ color: GO, fontSize: "7px" }}>R</span>}
                      </td>
                    ))}
                    <td style={{ padding: "6px 8px", textAlign: "center", fontSize: "12px" }}>
                      <div style={{ color: M }}>Gross</div>
                      <div style={{ color: "#c8d4c0" }}>Net</div>
                      <div style={{ color: G }}>Stab</div>
                    </td>
                  </tr>
                  <tr style={{
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                    background: "rgba(26,61,36,0.03)", fontSize: "12px", color: M
                  }}>
                    <td style={{ padding: "3px 10px" }}>Par</td>
                    {PAR.map((p, h) => (
                      <td key={h} style={{ padding: "3px 4px", textAlign: "center" }}>{p}</td>
                    ))}
                    <td style={{ padding: "3px 8px", textAlign: "center" }}>
                      <div>36</div>
                      <div style={{ color: G }}>—</div>
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => {
                    const type = getType(r.tIdx, r.pi);
                    const pname = TEAMS[r.tid]?.[r.pi === 0 ? "p1" : "p2"] || "";
                    const total = getRunTotal(r.tIdx, r.pi, r.tid);
                    // find rival for this player
                    const rivalTotal = getRunTotal(r.rivalTIdx, r.rivalPi, ri < 2 ? t2id : t1id);
                    const winning = total > rivalTotal, losing = total < rivalTotal;
                    return (
                      <tr key={ri} style={{
                        borderBottom: ri < 3 ? `1px solid ${GOLD}22` : "none",
                        background: ri === 2 ? "rgba(26,61,36,0.04)" : "transparent"
                      }}>
                        <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{
                              width: "5px", height: "5px", borderRadius: "50%",
                              background: r.color, display: "inline-block", flexShrink: 0
                            }} />
                            <span style={{ fontSize: "13px", color: CREAM, fontWeight: 600 }}>{pname}</span>
                          </div>
                          <div style={{ fontSize: "8px", color: M, paddingLeft: "12px" }}>
                            HCP {getHcp(r.tid, r.pi)} · {r.label}
                          </div>
                        </td>
                        {Array(9).fill(0).map((_, h) => {
                          const strokesH = hcpStr(getHcp(r.tid, r.pi), SI[h]);
                          if (type === "sub") return (
                            <td key={h} style={{ padding: "7px 4px", textAlign: "center", color: GO, fontSize: "13px" }}>S</td>
                          );
                          if (type === "phantom") return (
                            <td key={h} style={{ padding: "7px 4px", textAlign: "center", color: R, fontSize: "13px" }}>P</td>
                          );
                          const pts = getPtsFor(r.tIdx, r.pi, r.tid, h);
                          const gross = getGross(r.tIdx, r.pi, scoreEffH(r.tIdx, r.pi, h));
                          const ptColor2 = pts === null ? (gross ? "#555" : M) : pts >= 3 ? G : pts === 1 ? "#c0a060" : pts === 0 ? M : R;
                          return (
                            <td key={h} onClick={() => setHole(h)}
                              style={{
                                padding: "4px 3px", textAlign: "center", cursor: "pointer",
                                background: h === hole ? "rgba(184,150,46,0.05)" : "transparent",
                                minWidth: "28px"
                              }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
                                {strokesH > 0 && <span style={{ fontSize: "9px", color: G, fontWeight: 700, lineHeight: 1 }}>{"•".repeat(strokesH)}</span>}
                                {gross > 0 ? (<>
                                  <span style={{ fontSize: "14px", fontWeight: 600, color: CREAM }}>{gross}</span>
                                  <span style={{ fontSize: "11px", color: "#c8d4c0" }}>{getNet(r.tIdx, r.pi, r.tid, h)}</span>
                                  <span style={{ fontSize: "12px", fontWeight: pts !== null && pts >= 3 ? 700 : 400, color: ptColor2 }}>
                                    {pts !== null ? pts : "?"}
                                  </span>
                                </>) : (
                                  <span style={{ color: CREAM, fontSize: "14px" }}>–</span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td style={{ padding: "4px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                          <div style={{ fontSize: "14px", fontWeight: 700, color: CREAM }}>
                            {(type === "sub" || type === "phantom") ? "—" : getGrossTotal(r.tIdx, r.pi) || "—"}
                          </div>
                          <div style={{ fontSize: "14px", fontWeight: 600, color: "#c8d4c0" }}>
                            {(type === "sub" || type === "phantom") ? "—" : getNetTotal(r.tIdx, r.pi, r.tid) || "—"}
                          </div>
                          <div style={{ fontSize: "14px", fontWeight: 700, color: winning ? r.color : losing ? R : G }}>
                            {total}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {/* Match Summary */}
          {!playMode && (() => {
            if (isCancelled) return (
              <div style={{ background: "rgba(180,120,0,0.1)", border: `1px solid #e6a81744`, borderRadius: "12px", padding: "12px 16px", marginBottom: "12px", fontSize: "13px", color: "#e6a817", fontWeight: 600 }}>
                ⛈ Week {selWeek} was cancelled — no match points awarded
              </div>
            );
            const t1m = matchResults.reduce((s, m) => s + (m.t1pts > m.t2pts ? 2 : m.t1pts === m.t2pts ? 1 : 0), 0);
            const t2m = matchResults.reduce((s, m) => s + (m.t2pts > m.t1pts ? 2 : m.t1pts === m.t2pts ? 1 : 0), 0);
            const t1teamTotal = matchResults.reduce((s, m) => s + m.t1pts, 0);
            const t2teamTotal = matchResults.reduce((s, m) => s + m.t2pts, 0);
            const t1teamPts = t1teamTotal > t2teamTotal ? 4 : t1teamTotal === t2teamTotal ? 2 : 0;
            const t2teamPts = t2teamTotal > t1teamTotal ? 4 : t1teamTotal === t2teamTotal ? 2 : 0;
            const t1matchTotal = t1m + t1teamPts;
            const t2matchTotal = t2m + t2teamPts;
            const t1bonus = weekBonus ? (weekBonus[t1id] || 0) : null;
            const t2bonus = weekBonus ? (weekBonus[t2id] || 0) : null;
            const t1grand = t1matchTotal + (t1bonus || 0);
            const t2grand = t2matchTotal + (t2bonus || 0);

            // Fixed-width score cell — all rows share the same column widths
            const scoreCell = (val, color, align = "right") => (
              <td style={{ width: "36px", textAlign: align, fontWeight: 700, fontSize: "15px", color, padding: "9px 4px", whiteSpace: "nowrap" }}>{val}</td>
            );
            const dashCell = () => (
              <td style={{ width: "18px", textAlign: "center", color: M, fontSize: "12px", padding: "9px 0" }}>—</td>
            );
            const tagCell = (text, color) => (
              <td style={{ width: "76px", textAlign: "right", padding: "9px 14px 9px 4px" }}>
                <span style={{
                  fontSize: "11px", fontWeight: 600, padding: "2px 7px", borderRadius: "5px",
                  background: color + "22", color, border: `1px solid ${color}44`, whiteSpace: "nowrap"
                }}>{text}</span>
              </td>
            );

            return (
              <div style={{
                background: CARD2, border: `1px solid ${GOLD}22`,
                borderRadius: "14px", overflow: "hidden", marginBottom: "12px"
              }}>
                {/* Header */}
                <div style={{
                  padding: "8px 13px", borderBottom: `1px solid ${GOLD}33`,
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <span style={{ fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase", color: M }}>Match Summary</span>
                  <div style={{ fontSize: "12px" }}>
                    <span style={{ color: G, fontWeight: 700 }}>{TEAMS[t1id]?.name}</span>
                    <span style={{ color: M, margin: "0 6px" }}>vs</span>
                    <span style={{ color: GO, fontWeight: 700 }}>{TEAMS[t2id]?.name}</span>
                  </div>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {/* Individual matchup rows */}
                    {matchResults.map((m, i) => {
                      const t1w = m.t1pts > m.t2pts, t2w = m.t2pts > m.t1pts, tied = m.t1pts === m.t2pts;
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${GOLD}18` }}>
                          <td style={{ padding: "9px 8px 9px 14px" }}>
                            <div style={{ fontSize: "11px", color: M, letterSpacing: "0.06em", textTransform: "uppercase" }}>{m.label}</div>
                            <div style={{ fontSize: "12px", marginTop: "2px" }}>
                              <span style={{ color: t1w ? G : CREAM, fontWeight: t1w ? 700 : 400 }}>{m.t1name}</span>
                              <span style={{ color: M, margin: "0 5px" }}>vs</span>
                              <span style={{ color: t2w ? GO : CREAM, fontWeight: t2w ? 700 : 400 }}>{m.t2name}</span>
                            </div>
                          </td>
                          {scoreCell(m.t1pts, t1w ? G : tied ? CREAM : "#555")}
                          {dashCell()}
                          {scoreCell(m.t2pts, t2w ? GO : tied ? CREAM : "#555", "left")}
                          {tagCell(t1w ? "+2" : t2w ? "+2" : "1 — 1", t1w ? G : t2w ? GO : M)}
                        </tr>
                      );
                    })}

                    {/* Team match row */}
                    <tr style={{ borderBottom: `1px solid ${GOLD}18` }}>
                      <td style={{ padding: "9px 8px 9px 14px" }}>
                        <div style={{ fontSize: "11px", color: M, letterSpacing: "0.06em", textTransform: "uppercase" }}>Team Match</div>
                        <div style={{ fontSize: "11px", color: M, marginTop: "2px" }}>stab totals · tie splits 2–2</div>
                      </td>
                      {scoreCell(t1teamTotal, t1teamPts === 4 ? G : t1teamPts === 2 ? CREAM : "#555")}
                      {dashCell()}
                      {scoreCell(t2teamTotal, t2teamPts === 4 ? GO : t2teamPts === 2 ? CREAM : "#555", "left")}
                      {tagCell(
                        t1teamTotal > t2teamTotal ? "+4" : t2teamTotal > t1teamTotal ? "+4" : "2 — 2",
                        t1teamTotal > t2teamTotal ? G : t2teamTotal > t1teamTotal ? GO : M
                      )}
                    </tr>

                    {/* Match pts subtotal */}
                    <tr style={{
                      borderBottom: weekBonus ? `1px solid ${GOLD}18` : "none",
                      background: "rgba(26,61,36,0.07)"
                    }}>
                      <td style={{ padding: "9px 8px 9px 14px", fontSize: "12px", fontWeight: 700, color: CREAM }}>
                        Match Points
                        <span style={{ fontSize: "10px", color: M, fontWeight: 400, marginLeft: "5px" }}>of 8</span>
                      </td>
                      {scoreCell(t1matchTotal, t1matchTotal > t2matchTotal ? G : t1matchTotal === t2matchTotal ? CREAM : "#555")}
                      {dashCell()}
                      {scoreCell(t2matchTotal, t2matchTotal > t1matchTotal ? GO : t2matchTotal === t1matchTotal ? CREAM : "#555", "left")}
                      <td />
                    </tr>

                    {/* Bonus row */}
                    {weekBonus && (
                      <tr style={{ borderBottom: `1px solid ${GOLD}18` }}>
                        <td style={{ padding: "9px 8px 9px 14px", fontSize: "11px", color: GOLD, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          Bonus Points
                        </td>
                        {scoreCell(t1bonus, GOLD)}
                        {dashCell()}
                        {scoreCell(t2bonus, GOLD, "left")}
                        <td />
                      </tr>
                    )}

                    {/* Grand total row */}
                    {weekBonus && (
                      <tr style={{ background: "rgba(26,61,36,0.1)" }}>
                        <td style={{ padding: "10px 8px 10px 14px", fontSize: "13px", fontWeight: 700, color: CREAM }}>Total This Week</td>
                        {scoreCell(t1grand, t1grand > t2grand ? G : t1grand === t2grand ? CREAM : "#555")}
                        {dashCell()}
                        {scoreCell(t2grand, t2grand > t1grand ? GO : t2grand === t1grand ? CREAM : "#555", "left")}
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}

        </>);
      })()}

      {/* Read-only / Lock banner */}
      {isReadOnly && (
        <div style={{
          background: "#fff3cd", border: "2px solid #e6a817", borderRadius: "12px",
          padding: "12px 16px", marginBottom: "12px", fontSize: "14px",
          color: "#7a4f00", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px"
        }}>
          🔒 Week {selWeek} is read-only — scores are locked by the admin.
        </div>
      )}
      {!isReadOnly && isLocked && (
        <div style={{
          background: G + "12", border: `2px solid ${G}55`, borderRadius: "12px",
          padding: "12px 16px", marginBottom: "12px", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: "8px", flexWrap: "wrap"
        }}>
          <div style={{ fontSize: "14px", color: G, fontWeight: 700 }}>
            ✅ Scores confirmed &amp; locked
            <span style={{ fontSize: "12px", fontWeight: 400, color: M, marginLeft: "8px" }}>
              Both teams agreed
            </span>
          </div>
          {unlockMatch && (
            <button onClick={() => unlockMatch(selWeek, mk)}
              style={{
                padding: "6px 14px", borderRadius: "7px", border: `1px solid ${R}55`,
                background: R + "12", color: R, fontFamily: FB, fontSize: "13px",
                fontWeight: 600, cursor: "pointer"
              }}>
              Unlock
            </button>
          )}
        </div>
      )}
      {!playMode && !isReadOnly && !isLocked && opp && mk && (
        <div style={{
          background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px",
          padding: "12px 16px", marginBottom: "12px", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: "8px", flexWrap: "wrap"
        }}>
          <div>
            <div style={{ fontSize: "13px", color: M, marginBottom: "4px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Confirm Scores
            </div>
            <div style={{ fontSize: "12px", color: M, display: "flex", gap: "12px" }}>
              <span style={{ color: hasConfirmed ? G : M }}>
                {hasConfirmed ? "✓" : "○"} T{t1id} {hasConfirmed ? `(${confirmations[t1id]?.confirmedBy||"confirmed"})` : ""}
              </span>
              <span style={{ color: oppConfirmed ? GO : M }}>
                {oppConfirmed ? "✓" : "○"} T{t2id} {oppConfirmed ? `(${confirmations[t2id]?.confirmedBy||"confirmed"})` : ""}
              </span>
            </div>
          </div>
          {!hasConfirmed && confirmMatch && (
            <button onClick={() => confirmMatch(selWeek, mk, t1id)}
              style={{
                padding: "8px 18px", borderRadius: "8px", border: `1px solid ${G}55`,
                background: G + "18", color: G, fontFamily: FB, fontSize: "14px",
                fontWeight: 600, cursor: "pointer"
              }}>
              Confirm T{t1id} Scores
            </button>
          )}
          {hasConfirmed && !oppConfirmed && (
            <span style={{ fontSize: "12px", color: GOLD, fontWeight: 600 }}>
              Waiting for T{t2id} to confirm…
            </span>
          )}
        </div>
      )}

      {/* All-team bonus league table — shown only once all scores are in */}
      {!playMode && weekBonus && (
        <div style={{ background: GOLD + "08", border: `1px solid ${GOLD}22`, borderRadius: "14px", padding: "10px 14px", marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, marginBottom: "7px" }}>
            Week {selWeek} Bonus — All Teams
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {(() => {
              const weekTotals = {};
              for (const [ta, tb] of (SCHEDULE[selWeek]?.pairs || [])) {
                const [tlow, thigh] = ta < tb ? [ta, tb] : [tb, ta];
                const rec = league.results[selWeek]?.[matchKey(selWeek, tlow, thigh)];
                if (rec) {
                  weekTotals[tlow]  = computeTeamTotal(rec, 0, tlow,  league.handicaps);
                  weekTotals[thigh] = computeTeamTotal(rec, 1, thigh, league.handicaps);
                }
              }
              return Object.entries(weekBonus).sort((a, b) => b[1] - a[1]).map(([tid, bp]) => (
                <div key={tid} style={{
                  padding: "3px 8px", borderRadius: "6px", fontSize: "12px",
                  background: parseInt(tid) === t1id || parseInt(tid) === t2id ? G + "20" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${parseInt(tid) === t1id || parseInt(tid) === t2id ? G + "44" : "rgba(255,255,255,0.08)"}`,
                }}>
                  <span style={{ color: G, fontWeight: 600 }}>+{bp}</span>
                  <span style={{ color: CREAM, marginLeft: "5px" }}>{TEAMS[parseInt(tid)]?.name}</span>
                  {weekTotals[parseInt(tid)] != null && (
                    <span style={{ color: GOLD, marginLeft: "5px", fontSize: "11px" }}>{weekTotals[parseInt(tid)]}</span>
                  )}
                </div>
              ));
            })()}
          </div>
        </div>
      )}


      {/* Save */}
      {/* Auto-saves on score change */}

    </>)}

    <LostBallTimer />

  </div>
  );
}

export default ScoringScreen;
