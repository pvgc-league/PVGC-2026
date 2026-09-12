import React, { useState, useMemo } from "react";
import { ALL_PLAYERS, TEAMS, PAR, SI, RAINOUT_SUB, SCHEDULE } from "../constants/league";
import { getEffectiveHcp, getEffectiveHcpRaw, getOpponent, matchKey, stabPts, hcpStr, getLoHiOrder } from "../lib/leagueLogic";
import { G, GO, R, M, CREAM, GOLD, CARD, CARD2, FB, FD } from "../constants/theme";
import { auth } from "../firebase/client";
import { winsFor, winYearsFor } from "../constants/champions";

// Trophy badge — a single icon, with a ×N multiplier for repeat champions.
function TrophyBadge({ count, size = 12 }) {
  if (!count) return null;
  return (
    <span style={{ fontSize: `${size}px`, fontWeight: 700, color: GOLD, display: "inline-flex", alignItems: "center", gap: "2px", flexShrink: 0 }} title={`${count} championship${count === 1 ? "" : "s"}`}>
      🏆{count > 1 && <span>×{count}</span>}
    </span>
  );
}

const PROFILE_WEEKS = Array.from({ length: 21 }, (_, i) => i + 1); // full season: regular + knockdown (18) + playoffs (19-21)
const ALL_SEASON_WEEKS = Array.from({ length: 18 }, (_, i) => i + 1); // includes knockdown (W18)

// Returns { played, missed, weeksLeft, minEligible, totalEligible, status }
// status: "eligible" | "onPace" | "atRisk" | "ineligible"
// Denominator shrinks for cancelled/rainout weeks.
function getEligibility(tid, pi, league, schedule = SCHEDULE) {
  const cancelled = league.cancelledWeeks || new Set();

  // Eligible weeks = season weeks that were not cancelled
  const eligibleWeeks = ALL_SEASON_WEEKS.filter(w => !cancelled.has(w));
  const minEligible = Math.ceil(eligibleWeeks.length * (2 / 3));

  // Weeks the league has actually played so far (has data, not cancelled)
  const weeksWithData = eligibleWeeks.filter(w =>
    league.results[w] && Object.keys(league.results[w]).length > 0
  ).length;
  const weeksLeft = eligibleWeeks.length - weeksWithData;

  let played = 0;
  for (const w of eligibleWeeks) {
    const opp = getOpponent(tid, w, null, schedule); // dynamic schedule so the W18 Knockdown resolves
    if (!opp) continue;
    const mk = matchKey(w, Math.min(tid, opp), Math.max(tid, opp));
    const rec = league.results[w]?.[mk];
    if (!rec) continue;
    if (rec.subs && rec.subs[`${tid}-${pi}`]) continue; // sub covered this slot — doesn't count as the player playing
    const tIdx = tid < opp ? 0 : 1;
    const types = (tIdx === 0 ? rec.t1types : rec.t2types) || [];
    if ((types[pi] || "normal") !== "normal") continue;
    if (getPlayerGross(rec, tIdx, pi) === 0) continue;
    played++;
  }

  const missed = weeksWithData - played; // available weeks they didn't play
  const canQualify = played + weeksLeft >= minEligible;

  let status;
  if (played >= minEligible)   status = "eligible";
  else if (!canQualify)         status = "ineligible";
  else if (missed === 0)        status = "onPace";
  else                          status = "atRisk";

  return { played, missed, weeksLeft, weeksWithData, minEligible, totalEligible: eligibleWeeks.length, status };
}

// Normalize scores whether stored as array-of-arrays or {p0,p1} object
function normScores(s) {
  if (!s) return [[], []];
  if (Array.isArray(s)) return s;
  return [s.p0 || [], s.p1 || []];
}

function getPlayerGross(rec, tIdx, pi) {
  const scores = normScores(tIdx === 0 ? rec.t1scores : rec.t2scores);
  let g = 0;
  for (let hi = 0; hi < 9; hi++) {
    const effHi = (rec.rainout && !(scores[pi]?.[hi]) && RAINOUT_SUB[hi] !== undefined)
      ? RAINOUT_SUB[hi] : hi;
    g += scores[pi]?.[effHi] || 0;
  }
  return g;
}

function getPlayerStab(rec, tIdx, pi, tid) {
  const types = (tIdx === 0 ? rec.t1types : rec.t2types) || [];
  const type = types[pi] || "normal";
  if (type === "sub") return 6;
  if (type === "phantom") return 2;
  const scores = normScores(tIdx === 0 ? rec.t1scores : rec.t2scores);
  const snap = rec.hcpSnapshot;
  const hcp = snap ? (snap[tid] || [0, 0])[pi] || 0 : 0;
  let total = 0;
  for (let hi = 0; hi < 9; hi++) {
    const effHi = (rec.rainout && !(scores[pi]?.[hi]) && RAINOUT_SUB[hi] !== undefined)
      ? RAINOUT_SUB[hi] : hi;
    const gross = scores[pi]?.[effHi] || 0;
    if (!gross) continue;
    total += stabPts(gross, PAR[hi], hcpStr(hcp, SI[hi])) || 0;
  }
  return total;
}

// Build full season stats for a player (incl. knockdown + playoff rounds)
function buildPlayerStats(tid, pi, league, schedule = SCHEDULE) {
  const rounds = [];

  for (const w of PROFILE_WEEKS) {
    const opp = getOpponent(tid, w, null, schedule);
    if (!opp) continue;
    const mk = matchKey(w, Math.min(tid, opp), Math.max(tid, opp));
    const rec = league.results[w]?.[mk];
    if (!rec) continue;
    if (rec.subs && rec.subs[`${tid}-${pi}`]) continue; // a sub played this slot — not this player's round
    const tIdx = tid < opp ? 0 : 1;
    const types = (tIdx === 0 ? rec.t1types : rec.t2types) || [];
    const type = types[pi] || "normal";
    const snap = rec.hcpSnapshot;
    const { loPi: tidLoPi } = getLoHiOrder(tid, w, league, snap);
    const isLo = pi === tidLoPi;
    const { loPi: oppLoPi } = getLoHiOrder(opp, w, league, snap);
    const rivalPi = isLo ? oppLoPi : (1 - oppLoPi);
    const oppTIdx = opp < tid ? 0 : 1;
    const rivalStab = getPlayerStab(rec, oppTIdx, rivalPi, opp);

    if (type === "sub" || type === "phantom") {
      const stab = type === "sub" ? 6 : 2;
      rounds.push({ week: w, gross: 0, stab, hcp: 0, opp, rivalPi, rivalStab, won: stab > rivalStab, lost: stab < rivalStab, tied: stab === rivalStab, type });
      continue;
    }
    if (type !== "normal") continue;
    const gross = getPlayerGross(rec, tIdx, pi);
    if (gross === 0) continue;
    const stab = getPlayerStab(rec, tIdx, pi, tid);
    const hcp = getEffectiveHcp(tid, pi, w, league.results, league.handicaps, league.hcpOverrides || {}, league.cancelledWeeks);

    rounds.push({ week: w, gross, stab, hcp, opp, rivalPi, rivalStab, won: stab > rivalStab, lost: stab < rivalStab, tied: stab === rivalStab, type: "normal" });
  }

  const normalRounds = rounds.filter(r => r.type === "normal");
  const played = normalRounds.length;
  const avgGross = played ? Math.round((normalRounds.reduce((s, r) => s + r.gross, 0) / played) * 10) / 10 : null;
  const bestGross = played ? Math.min(...normalRounds.map(r => r.gross)) : null;
  const totalStab = rounds.reduce((s, r) => s + r.stab, 0);
  const wins = rounds.filter(r => r.won).length;
  const losses = rounds.filter(r => r.lost).length;
  const ties = rounds.filter(r => r.tied).length;
  const currentHcp = played
    ? getEffectiveHcp(tid, pi, PROFILE_WEEKS[PROFILE_WEEKS.length - 1] + 1, league.results, league.handicaps, league.hcpOverrides || {}, league.cancelledWeeks)
    : (league.handicaps?.[tid]?.[pi] ?? 0);

  // HCP progression: starting HCP + HCP earned after each played round
  const startHcp = (league.handicaps?.[tid] || [0, 0])[pi];
  const hcpTrend = [{ week: 0, hcp: startHcp }];
  for (const r of normalRounds) {
    const earned = getEffectiveHcpRaw(tid, pi, r.week + 1, league.results, league.handicaps, league.hcpOverrides || {}, league.cancelledWeeks);
    hcpTrend.push({ week: r.week, hcp: earned });
  }

  // Head-to-head vs each opponent
  const h2h = {};
  for (const r of rounds) {
    if (!h2h[r.opp]) h2h[r.opp] = { w: 0, l: 0, t: 0, rivalPi: r.rivalPi };
    if (r.won) h2h[r.opp].w++;
    else if (r.lost) h2h[r.opp].l++;
    else h2h[r.opp].t++;
  }

  return { rounds, played, avgGross, bestGross, totalStab, wins, losses, ties, currentHcp, hcpTrend, h2h };
}

// Full SVG sparkline showing HCP progression: start + after each played round
// Y-axis inverted: lower HCP = higher on chart (improving = line goes up)
const VB_W = 300;
function HcpSparkline({ trend }) {
  if (trend.length < 2) return null;
  const vals = trend.map(t => t.hcp);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const H = 44;
  const pts = trend.map((t, i) => {
    const x = (i / (trend.length - 1)) * VB_W;
    const y = ((maxV - t.hcp) / range) * H;
    return { x, y, hcp: t.hcp, week: t.week };
  });
  const ptStr = pts.map(p => `${p.x},${p.y}`).join(" ");
  const first = trend[0], last = trend[trend.length - 1];
  const improving = last.hcp < first.hcp;
  const lineColor = improving ? G : last.hcp > first.hcp ? R : GOLD;

  return (
    <svg viewBox={`-6 -6 ${VB_W + 12} ${H + 28}`} style={{ width: "100%", display: "block" }}>
      <polyline points={ptStr} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill={lineColor} />
          <text x={p.x} y={p.y + 15} textAnchor="middle" fontSize="9.5" fill={i === 0 ? M : i === pts.length - 1 ? GOLD : CREAM} fontWeight={i === pts.length - 1 ? "700" : "400"}>
            {Math.round(p.hcp)}
          </text>
          <text x={p.x} y={p.y + 25} textAnchor="middle" fontSize="8" fill={M} opacity="0.6">
            {p.week === 0 ? "Start" : `W${p.week}`}
          </text>
        </g>
      ))}
    </svg>
  );
}

function formatPhone(val) {
  const d = (val || "").replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

// Player card for the roster grid
function PlayerCard({ tid, pi, league, onClick, schedule = SCHEDULE }) {
  const contacts = league.contacts || {};
  const team = TEAMS[tid];
  const name = pi === 0 ? team?.p1 : team?.p2;
  const hcp = getEffectiveHcp(tid, pi, PROFILE_WEEKS[PROFILE_WEEKS.length - 1] + 1, league.results, league.handicaps, league.hcpOverrides || {}, league.cancelledWeeks);
  let totalStab = 0;
  for (const w of PROFILE_WEEKS) {
    const o = getOpponent(tid, w, null, schedule);
    if (!o) continue;
    const mk = matchKey(w, Math.min(tid, o), Math.max(tid, o));
    const rec = league.results[w]?.[mk];
    if (!rec) continue;
    if (rec.subs && rec.subs[`${tid}-${pi}`]) continue; // sub played — not this player's round
    const tIdx = tid < o ? 0 : 1;
    const types = (tIdx === 0 ? rec.t1types : rec.t2types) || [];
    if ((types[pi] || "normal") !== "normal") continue;
    if (getPlayerGross(rec, tIdx, pi) === 0) continue;
    totalStab += getPlayerStab(rec, tIdx, pi, tid);
  }
  const { played, status, minEligible, totalEligible } = getEligibility(tid, pi, league, schedule);
  const eligColor = status === "eligible" ? G : status === "onPace" ? G : status === "atRisk" ? GO : R;
  const eligLabel = { eligible: "✓ Eligible", onPace: "On Pace", atRisk: "At Risk", ineligible: "✗ Ineligible" }[status];

  return (
    <div onClick={onClick}
      style={{
        background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px",
        padding: "14px 14px", cursor: "pointer", transition: "border-color 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = GOLD + "66"}
      onMouseLeave={e => e.currentTarget.style.borderColor = GOLD + "22"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <div style={{
          width: "34px", height: "34px", borderRadius: "50%",
          background: G + "22", border: `1px solid ${G}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "13px", fontWeight: 700, color: G, flexShrink: 0,
        }}>
          {name?.charAt(0)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
            <TrophyBadge count={winsFor(name)} />
          </div>
          <div style={{ fontSize: "11px", color: M, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {team?.name}
          </div>
        </div>
        <span style={{
          fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "5px",
          background: eligColor + "20", color: eligColor, border: `1px solid ${eligColor}44`,
          flexShrink: 0,
        }}>{eligLabel}</span>
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: "10px", color: M, letterSpacing: "0.06em", textTransform: "uppercase" }}>HCP</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: GOLD }}>{hcp}</div>
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: "10px", color: M, letterSpacing: "0.06em", textTransform: "uppercase" }}>Rounds</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: CREAM }}>{played}<span style={{ fontSize: "11px", color: M, fontWeight: 400 }}>/{totalEligible}</span></div>
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: "10px", color: G, letterSpacing: "0.06em", textTransform: "uppercase" }}>Stab</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: G }}>{totalStab || "—"}</div>
        </div>
      </div>
      {!(contacts[`${tid}-${pi}`]?.phone && contacts[`${tid}-${pi}`]?.email) && (
        <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: `1px solid ${GOLD}22`, fontSize: "11px", color: GO }}>
          ⚠ missing {!contacts[`${tid}-${pi}`]?.phone && !contacts[`${tid}-${pi}`]?.email ? "phone & email"
            : !contacts[`${tid}-${pi}`]?.phone ? "phone" : "email"}
        </div>
      )}
      {(contacts[`${tid}-${pi}`]?.phone || contacts[`${tid}-${pi}`]?.email) && (
        <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: `1px solid ${GOLD}22`, display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {contacts[`${tid}-${pi}`]?.phone && (<>
            <a href={`tel:${contacts[`${tid}-${pi}`].phone}`} onClick={e => e.stopPropagation()} style={{ fontSize: "11px", color: G, textDecoration: "none" }}>📞 Call</a>
            <a href={`sms:${contacts[`${tid}-${pi}`].phone}`} onClick={e => e.stopPropagation()} style={{ fontSize: "11px", color: GO, textDecoration: "none" }}>💬 Text</a>
          </>)}
          {contacts[`${tid}-${pi}`]?.email && (
            <span style={{ fontSize: "11px", color: M, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>✉ {contacts[`${tid}-${pi}`].email}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Full player profile
function PlayerProfile({ tid, pi, league, onBack, isAdmin, saveLeague, schedule = SCHEDULE }) {
  const team = TEAMS[tid];
  const name = pi === 0 ? team?.p1 : team?.p2;
  const stats = useMemo(() => buildPlayerStats(tid, pi, league, schedule), [tid, pi, league.results, schedule]);
  const contactKey = `${tid}-${pi}`;
  const savedContact = (league.contacts || {})[contactKey] || {};
  const [editingContact, setEditingContact] = useState(false);
  const [cPhone, setCPhone] = useState("");
  const [cEmail, setCEmail] = useState("");


  function startContactEdit() {
    setCPhone(savedContact.phone || "");
    setCEmail(savedContact.email || "");
    setEditingContact(true);
  }
  function saveContact() {
    const updatedBy = auth.currentUser?.email || auth.currentUser?.displayName || "unknown";
    const next = { ...(league.contacts || {}), [contactKey]: { phone: cPhone.trim(), email: cEmail.trim(), updatedAt: new Date().toISOString(), updatedBy } };
    saveLeague({ ...league, contacts: next });
    setEditingContact(false);
  }
  const recent = [...stats.rounds].reverse().slice(0, 5);

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto" }}>
      {/* Back */}
      <button onClick={onBack}
        style={{ background: "none", border: "none", color: M, fontFamily: FB, fontSize: "13px", cursor: "pointer", marginBottom: "16px", padding: "0", display: "flex", alignItems: "center", gap: "5px" }}>
        ← All Players
      </button>

      {/* Header */}
      <div style={{
        background: CARD, border: `1px solid ${GOLD}33`, borderRadius: "14px",
        padding: "20px", marginBottom: "14px",
        display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap"
      }}>
        <div style={{
          width: "56px", height: "56px", borderRadius: "50%",
          background: G + "22", border: `2px solid ${G}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "22px", fontWeight: 700, color: G, flexShrink: 0,
        }}>
          {name?.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FD, fontSize: "24px", fontWeight: 700, color: CREAM, display: "flex", alignItems: "center", gap: "8px" }}>
            {name}
            <TrophyBadge count={winsFor(name)} size={16} />
          </div>
          <div style={{ fontSize: "13px", color: M, marginBottom: "6px" }}>{team?.name} · {pi === 0 ? "Player 1" : "Player 2"}</div>
          {winsFor(name) > 0 && (
            <div style={{ fontSize: "11px", color: GOLD, fontWeight: 600, marginBottom: "6px" }}>
              PVGC Champion — {winYearsFor(name).join(", ")}
            </div>
          )}
          {editingContact ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <input type="tel" value={cPhone} onChange={e => setCPhone(formatPhone(e.target.value))} placeholder="Phone"
                style={{ padding: "6px 10px", borderRadius: "7px", border: `1px solid ${GOLD}55`, background: "rgba(255,255,255,0.8)", fontFamily: FB, fontSize: "13px", color: CREAM, outline: "none", width: "100%", boxSizing: "border-box" }} />
              <input type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="Email"
                style={{ padding: "6px 10px", borderRadius: "7px", border: `1px solid ${GOLD}55`, background: "rgba(255,255,255,0.8)", fontFamily: FB, fontSize: "13px", color: CREAM, outline: "none", width: "100%", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                <button onClick={saveContact} style={{ padding: "5px 14px", borderRadius: "7px", border: "none", background: G, color: "#fff", fontFamily: FB, fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Save</button>
                <button onClick={() => setEditingContact(false)} style={{ padding: "5px 12px", borderRadius: "7px", border: `1px solid #c0c8c0`, background: "transparent", color: M, fontFamily: FB, fontSize: "12px", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              {savedContact.phone ? (<>
                <a href={`tel:${savedContact.phone}`} style={{ fontSize: "13px", color: G, textDecoration: "none", fontWeight: 500 }}>📞 {formatPhone(savedContact.phone)}</a>
                <a href={`sms:${savedContact.phone}`} style={{ fontSize: "13px", color: GO, textDecoration: "none", fontWeight: 500 }}>💬 Text</a>
              </>) : <span style={{ fontSize: "12px", color: M, opacity: 0.5 }}>no phone</span>}
              {savedContact.email && <a href={`mailto:${savedContact.email}`} style={{ fontSize: "13px", color: GO, textDecoration: "none", fontWeight: 500 }}>✉ {savedContact.email}</a>}
              <button onClick={startContactEdit} style={{ padding: "3px 10px", borderRadius: "6px", border: `1px solid ${GOLD}55`, background: "transparent", color: M, fontFamily: FB, fontSize: "11px", cursor: "pointer" }}>Edit</button>
              {savedContact.updatedAt && (
                <span style={{ fontSize: "10px", color: M, opacity: 0.6 }}>
                  updated {new Date(savedContact.updatedAt).toLocaleDateString()} by {savedContact.updatedBy}
                </span>
              )}
            </div>
          )}

        </div>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {[
            { label: "HCP", val: stats.currentHcp, color: GOLD },
            { label: "Rounds", val: stats.played, color: CREAM },
            { label: "Avg Gross", val: stats.avgGross ?? "—", color: CREAM },
            { label: "Best", val: stats.bestGross ?? "—", color: G },
            { label: "Total Stab", val: stats.totalStab || "—", color: G },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>{label}</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Playoff eligibility */}
      {(() => {
        const { played, missed, weeksLeft, minEligible, totalEligible, status } = getEligibility(tid, pi, league, schedule);
        const needed = Math.max(0, minEligible - played);
        const eligColor = status === "eligible" ? G : status === "onPace" ? G : status === "atRisk" ? GO : R;
        const statusLabel = { eligible: "✓ Eligible", onPace: "On Pace", atRisk: "At Risk", ineligible: "✗ Ineligible" }[status];
        const statusNote = {
          eligible: "Playoff eligibility confirmed",
          onPace:   `Playing every week — need ${needed} more to lock in`,
          atRisk:   `${missed} missed · need ${needed} of ${weeksLeft} remaining`,
          ineligible: "Cannot reach the required rounds",
        }[status];
        const pct = Math.min(played / minEligible, 1);
        return (
          <div style={{ background: CARD2, border: `1px solid ${eligColor}33`, borderRadius: "12px", padding: "14px 16px", marginBottom: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
                Playoff Eligibility
              </div>
              <span style={{
                fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "5px",
                background: eligColor + "20", color: eligColor, border: `1px solid ${eligColor}44`,
              }}>{statusLabel}</span>
            </div>
            <div style={{ display: "flex", gap: "20px", marginBottom: "8px" }}>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: eligColor }}>
                  {played}<span style={{ fontSize: "13px", color: M, fontWeight: 400 }}> / {totalEligible}</span>
                </div>
                <div style={{ fontSize: "11px", color: M }}>rounds played</div>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: CREAM }}>{minEligible}</div>
                <div style={{ fontSize: "11px", color: M }}>required (66%)</div>
              </div>
              {status !== "eligible" && (
                <div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: eligColor }}>{needed}</div>
                  <div style={{ fontSize: "11px", color: M }}>still needed</div>
                </div>
              )}
            </div>
            <div style={{ fontSize: "11px", color: M, marginBottom: "8px" }}>{statusNote}</div>
            <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: "3px", background: eligColor, width: `${pct * 100}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        );
      })()}

      {/* W/L record + HCP sparkline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
        {/* Individual record */}
        <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "10px" }}>
            Individual Record
          </div>
          <div style={{ display: "flex", gap: "16px" }}>
            {[
              { label: "W", val: stats.wins, color: G },
              { label: "L", val: stats.losses, color: R },
              { label: "T", val: stats.ties, color: M },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: "11px", color: M }}>{label}</div>
              </div>
            ))}
          </div>
          {stats.played > 0 && (
            <div style={{ marginTop: "8px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: "2px", background: G,
                width: `${(stats.wins / stats.played) * 100}%`,
              }} />
            </div>
          )}
        </div>

        {/* HCP trend */}
        <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "6px" }}>
            Handicap Trend
          </div>
          {stats.hcpTrend.length >= 2 ? (
            <HcpSparkline trend={stats.hcpTrend} />
          ) : (
            <div style={{ fontSize: "12px", color: M }}>Not enough rounds</div>
          )}
        </div>
      </div>

      {/* Recent form */}
      {recent.length > 0 && (
        <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "14px 16px", marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "10px" }}>
            Recent Form — Last {recent.length} Rounds
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {recent.map(r => (
              <div key={r.week} style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "7px 10px", borderRadius: "8px",
                background: r.won ? G + "0d" : r.lost ? R + "08" : "rgba(26,61,36,0.04)",
                border: `1px solid ${r.won ? G + "22" : r.lost ? R + "18" : GOLD + "11"}`,
              }}>
                <span style={{ fontSize: "11px", color: M, width: "28px", flexShrink: 0 }}>W{r.week}</span>
                <span style={{ fontSize: "12px", color: M, flex: 1 }}>vs {r.rivalPi === 0 ? TEAMS[r.opp]?.p1 : TEAMS[r.opp]?.p2}</span>
                <span style={{ fontSize: "12px", color: M }}>
                  {r.type === "sub" ? "SUB" : r.type === "phantom" ? "PHT" : `Gross ${r.gross}`}
                </span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: G, minWidth: "32px", textAlign: "right" }}>
                  {r.stab} pts
                </span>
                <span style={{
                  fontSize: "11px", fontWeight: 700, minWidth: "20px", textAlign: "center",
                  color: r.won ? G : r.lost ? R : M,
                }}>
                  {r.won ? "W" : r.lost ? "L" : "T"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Head-to-head */}
      {Object.keys(stats.h2h).length > 0 && (
        <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "14px 16px", marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "10px" }}>
            Head-to-Head
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "6px" }}>
            {Object.entries(stats.h2h)
              .sort((a, b) => (b[1].w - b[1].l) - (a[1].w - a[1].l))
              .map(([oppId, rec]) => {
                const total = rec.w + rec.l + rec.t;
                const net = rec.w - rec.l;
                return (
                  <div key={oppId} style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "7px 10px", borderRadius: "8px",
                    background: net > 0 ? G + "0d" : net < 0 ? R + "08" : "rgba(26,61,36,0.03)",
                    border: `1px solid ${net > 0 ? G + "22" : net < 0 ? R + "18" : GOLD + "11"}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rec.rivalPi === 0 ? TEAMS[parseInt(oppId)]?.p1 : TEAMS[parseInt(oppId)]?.p2}
                      </div>
                      <div style={{ fontSize: "10px", color: M }}>{total} match{total !== 1 ? "es" : ""}</div>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: net > 0 ? G : net < 0 ? R : M, flexShrink: 0 }}>
                      {rec.w}–{rec.l}{rec.t > 0 ? `–${rec.t}` : ""}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* All rounds table */}
      {stats.rounds.length > 0 && (
        <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "10px" }}>
            All Rounds
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {stats.rounds.map(r => (
              <div key={r.week} style={{
                display: "grid", gridTemplateColumns: "30px 1fr 42px 42px 42px 28px",
                alignItems: "center", gap: "6px",
                padding: "5px 8px", borderRadius: "6px",
                background: r.won ? G + "08" : "transparent",
              }}>
                <span style={{ fontSize: "11px", color: M }}>W{r.week}</span>
                <span style={{ fontSize: "11px", color: M, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.rivalPi === 0 ? TEAMS[r.opp]?.p1 : TEAMS[r.opp]?.p2}
                </span>
                <span style={{ fontSize: "11px", color: M, textAlign: "center" }}>
                  {r.type === "normal" ? `HCP ${r.hcp}` : "—"}
                </span>
                <span style={{ fontSize: "12px", fontWeight: r.type !== "normal" ? 700 : 400, color: r.type === "sub" ? GO : r.type === "phantom" ? M : CREAM, textAlign: "center" }}>
                  {r.type === "sub" ? "SUB" : r.type === "phantom" ? "PHT" : r.gross}
                </span>
                <span style={{ fontSize: "12px", fontWeight: 600, color: G, textAlign: "center" }}>{r.stab}</span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: r.won ? G : r.lost ? R : M, textAlign: "center" }}>
                  {r.won ? "W" : r.lost ? "L" : "T"}
                </span>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 42px 42px 42px 28px", gap: "6px", padding: "6px 8px", borderTop: `1px solid ${GOLD}22`, marginTop: "4px" }}>
              <span />
              <span style={{ fontSize: "11px", color: M, fontWeight: 600 }}>Season totals</span>
              <span />
              <span style={{ fontSize: "12px", color: CREAM, textAlign: "center", fontWeight: 600 }}>
                {stats.avgGross ? `~${stats.avgGross}` : ""}
              </span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: G, textAlign: "center" }}>{stats.totalStab}</span>
              <span style={{ fontSize: "11px", color: M, textAlign: "center" }}>{stats.wins}W</span>
            </div>
          </div>
        </div>
      )}

      {stats.played === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", fontSize: "13px", color: M }}>
          No rounds played yet
        </div>
      )}
    </div>
  );
}

// Main screen
export default function PlayerScreen({ league, initialPlayer, isAdmin, saveLeague, schedule = SCHEDULE }) {
  const [selected, setSelected] = useState(initialPlayer || null);
  const [search, setSearch] = useState("");

  const [gapsOnly, setGapsOnly] = useState(false);
  const contacts = league.contacts || {};
  const isIncomplete = (p) => {
    const c = contacts[`${p.tid}-${p.pi}`];
    return !(c?.phone?.trim() && c?.email?.trim());
  };
  const gapCount = ALL_PLAYERS.filter(isIncomplete).length;

  const filtered = ALL_PLAYERS.filter(p => {
    const name = (p.pi === 0 ? TEAMS[p.tid]?.p1 : TEAMS[p.tid]?.p2) || "";
    const team = TEAMS[p.tid]?.name || "";
    const q = search.toLowerCase();
    if (gapsOnly && !isIncomplete(p)) return false;
    return !q || name.toLowerCase().includes(q) || team.toLowerCase().includes(q);
  });

  if (selected) {
    return (
      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "20px 14px" }}>
        <PlayerProfile tid={selected.tid} pi={selected.pi} league={league} onBack={() => setSelected(null)} isAdmin={isAdmin} saveLeague={saveLeague} schedule={schedule} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "20px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ fontFamily: FD, fontSize: "30px", fontWeight: 700, color: CREAM }}>Players</div>
        <div style={{ fontSize: "12px", color: M, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {ALL_PLAYERS.length} players · tap for profile
        </div>
        {gapCount > 0 && (
          <button onClick={() => setGapsOnly(v => !v)}
            title="Players missing a phone number or email"
            style={{
              marginLeft: "auto", padding: "5px 11px", borderRadius: "8px", cursor: "pointer",
              fontFamily: FB, fontSize: "12px", fontWeight: 600,
              border: `1px solid ${GO}66`,
              background: gapsOnly ? GO : GO + "18",
              color: gapsOnly ? "#fff" : GO,
            }}>
            ⚠ {gapCount} missing contact{gapCount === 1 ? "" : "s"}{gapsOnly ? " · showing" : ""}
          </button>
        )}
      </div>

      {/* Search */}
      <input
        type="text" placeholder="Search by name or team…"
        value={search} onChange={e => setSearch(e.target.value)}
        style={{
          width: "100%", padding: "10px 14px", borderRadius: "10px", marginBottom: "16px",
          border: `1px solid ${GOLD}33`, background: "rgba(255,255,255,0.07)",
          color: CREAM, fontFamily: FB, fontSize: "14px", outline: "none",
        }}
      />

      {/* Roster grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
        {filtered.map(p => (
          <PlayerCard
            key={`${p.tid}-${p.pi}`}
            tid={p.tid} pi={p.pi}
            league={league}
            schedule={schedule}
            onClick={() => setSelected({ tid: p.tid, pi: p.pi })}
          />
        ))}
      </div>
    </div>
  );
}
