import React, { useState, useEffect, useRef, useMemo } from "react";
import { LEAGUE_DOC, LEAGUE_DOC_ID, WEEK_SCORES_COL, db, auth } from "./firebase/client";
import {
  DEFAULT_HCP,
  AVAILABLE_SEASONS,
  SEASON_YEAR,
  PLAYOFF_START_WEEK,
  SCHEDULE,
  setSeasonYear,
} from "./constants/league";

function Banner({ banner }) {
  const [dismissed, setDismissed] = useState(false);

  if (!banner?.message || dismissed) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (banner.expiresAt && banner.expiresAt < today) return null;

  return (
    <div style={{position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center",
      background:"rgba(0,0,0,0.55)", padding:"20px"}}>
      <div style={{background:"#fffbe6", border:"2px solid #e6a800", borderRadius:"16px",
        padding:"28px 24px", maxWidth:"420px", width:"100%", boxShadow:"0 8px 32px rgba(0,0,0,0.25)",
        display:"flex", flexDirection:"column", alignItems:"center", gap:"16px", textAlign:"center"}}>
        <span style={{fontSize:"36px"}}>📢</span>
        <div style={{fontSize:"17px", fontWeight:700, color:"#5a3e00", lineHeight:1.4}}>
          {banner.message}
        </div>
        <button onClick={() => setDismissed(true)}
          style={{marginTop:"4px", padding:"10px 32px", borderRadius:"10px", border:"none",
            background:"#e6a800", color:"#fff", fontSize:"15px", fontWeight:700, cursor:"pointer"}}>
          Got it
        </button>
      </div>
    </div>
  );
}

function calcCurrentWeek() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let w = 1; w <= 21; w++) { // include the Knockdown (18) + playoffs (19-21)
    const d = SCHEDULE[w]?.date;
    if (!d) continue;
    const matchDate = new Date(d + "T12:00:00");
    if (today <= matchDate) return w;
  }
  return 21;
}
import { G, R, M, BG, CREAM, GOLD, FD, FB } from "./constants/theme";
import { NavBtn } from "./components/ui";
import EntryTab from "./components/EntryTab";
import ScheduleScreen from "./components/ScheduleScreen";
import ScoringScreen from "./components/ScoringScreen";
import StandingsScreen from "./components/StandingsScreen";
import WeeklyScreen from "./components/WeeklyScreen";
import PotyScreen from "./components/PotyScreen";
import HandicapScreen from "./components/HandicapScreen";
import RulesScreen from "./components/RulesScreen";
import AdminScreen from "./components/AdminScreen";
import PlayoffScreen from "./components/PlayoffScreen";
import LiveScreen from "./components/LiveScreen";
import RecapScreen from "./components/RecapScreen";
import MastersBoard from "./components/MastersBoard";
import PlayerScreen from "./components/PlayerScreen";
import StatsScreen from "./components/StatsScreen";
import PredictScreen from "./components/PredictScreen";
import PulseScreen from "./components/PulseScreen";
import ContactsScreen from "./components/ContactsScreen";
import ChampionsScreen from "./components/ChampionsScreen";
import ConfirmedScoresScreen from "./components/ConfirmedScoresScreen";
import AuthGate from "./components/AuthGate";
import {
  getPlayoffSeeds,
  getQFSeeds,
  getKnockdownPairs,
  getQFPairs,
  getSFPairs,
  getFinalPairs,
  getOpponent,
  matchKey,
  calcWeekBonus,
  calcLeagueStats,
  calcWeeklyTeamPts,
  initLeague,
  initMatch,
  getEffectiveHcp,
  isMatchComplete,
  rankStandings,
} from "./lib/leagueLogic";
import { applySnapshotToLeague, applyWeekScoreDoc, removeWeekScoreDoc, normalizeMatch, toSet, isLeagueWriteBlocked } from "./lib/persistence";

// True if saving `next` would erase real scores a player had in `existing`
// (a scored player turned into a sub/phantom, or their holes cleared).
function editLosesScores(existing, next) {
  if (!existing || !next) return false;
  const flat = (s) => Array.isArray(s) ? s : (s ? [s.p0 || [], s.p1 || []] : [[], []]);
  const scored = (rec, tIdx, pi) => {
    const type = (tIdx === 0 ? rec.t1types : rec.t2types)?.[pi] || "normal";
    if (type === "sub" || type === "phantom") return false;
    return (flat(tIdx === 0 ? rec.t1scores : rec.t2scores)[pi] || []).some(v => (v || 0) > 0);
  };
  for (let t = 0; t < 2; t++)
    for (let pi = 0; pi < 2; pi++)
      if (scored(existing, t, pi) && !scored(next, t, pi)) return true;
  return false;
}

function App() {
  const [screen,  setScreen]  = useState("schedule");
  const prevScreenRef = React.useRef("schedule"); // last non-live screen, for the Live "Menu" exit
  React.useEffect(() => { if (screen !== "live") prevScreenRef.current = screen; }, [screen]);
  const [selPlayer, setSelPlayer] = useState(null); // {tid, pi} — set when navigating from POTY
  const [league,  setLeague]  = useState(initLeague);
  const [selWeek, setWeek]    = useState(calcCurrentWeek);
  const [selTeam, setTeam]    = useState(1);
  const [match,   setMatch]   = useState(initMatch());
  const matchDirty = useRef(false);
  const [hole,    setHole]    = useState(0);
  const [potyTab, setPotyTab] = useState("season");
  const playoffSeeds = React.useMemo(()=>getPlayoffSeeds(league.results,league.handicaps,league.cancelledWeeks,league.loHiOverrides,league.seedOverrides),[league]);
  const qfSeeds = React.useMemo(()=>getQFSeeds(league.results,league.handicaps,league.cancelledWeeks,league.loHiOverrides,league.seedOverrides),[league]);
  const knockdownPairs = React.useMemo(()=>getKnockdownPairs(league.results,league.handicaps,league.cancelledWeeks,league.loHiOverrides,league.seedOverrides),[league]);
  const qfPairs = React.useMemo(()=>getQFPairs(qfSeeds),[qfSeeds]);
  const sfPairs = React.useMemo(()=>getSFPairs(qfSeeds,league.results,league.handicaps),[qfSeeds,league.results,league.handicaps]);
  const finalPairs = React.useMemo(()=>getFinalPairs(qfSeeds,league.results,league.handicaps),[qfSeeds,league.results,league.handicaps]);
  const [entryTeam, setEntryTeam] = useState(1);
  const [entryScores, setEntryScores] = useState({});
  const [entrySaved, setEntrySaved] = useState(false);
const [seasonYear] = useState(SEASON_YEAR);
  const [rules, setRules] = useState([]);
  const [scanMsg, setScanMsg] = useState("");
  const [userName] = useState(() => localStorage.getItem("pvgc_user") || "");
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem("pvgc_admin") === "1");
  const [adminPin, setAdminPin] = useState(""); // loaded from Firebase
  const [moreOpen, setMoreOpen] = useState(false);

  function changeSeason(year) {
    if (!setSeasonYear(year)) return;
    window.location.reload();
  }

  // ── Firebase sync ────────────────────────────────────────────
  const lastSaveTime = useRef(0);
  const lastMatchSaveTime = useRef(0);
  const [fbStatus, setFbStatus] = useState("connecting");

  // Initial load: main doc (legacy results) + subcollection (current results)
  const loadFromFirebase = async () => {
    setFbStatus("connecting");
    try {
      const [snap, scoresSnap] = await Promise.all([
        LEAGUE_DOC.get({ source: "server" }),
        WEEK_SCORES_COL.get({ source: "server" }),
      ]);
      setLeague(prev => {
        if (!snap.exists) return prev;
        const p = snap.data();
        // Start with legacy results from main doc
        let next = applySnapshotToLeague(prev, p, DEFAULT_HCP);
        // Apply subcollection docs on top (they override legacy)
        scoresSnap.docs.forEach(d => {
          next = applyWeekScoreDoc(next, d.data(), d.id);
        });
        return next;
      });
      if (snap.exists && snap.data().rules) setRules(snap.data().rules);
      if (snap.exists && snap.data().adminPin) setAdminPin(snap.data().adminPin);
      setFbStatus("loaded");
    } catch(err) {
      console.warn("Firebase load error:", err);
      setFbStatus("error:"+(err.code||err.message||String(err)));
    }
  };

  useEffect(() => { window.scrollTo(0, 0); }, [screen]);

  useEffect(()=>{
    loadFromFirebase();
    // Main doc listener — only updates non-results fields
    const unsub = LEAGUE_DOC.onSnapshot((snap)=>{
      const msSinceSave = Date.now() - lastSaveTime.current;
      if(msSinceSave < 8000) return;
      if(!snap.exists){ setFbStatus("loaded"); return; }
      const p = snap.data();
      setLeague(prev => ({
        ...prev,
        handicaps: { ...(DEFAULT_HCP || {}), ...(p.handicaps || {}) },
        hcpOverrides: p.hcpOverrides || {},
        loHiOverrides: p.loHiOverrides || {},
        seedOverrides: p.seedOverrides || [],
        budget: p.budget || {},
        dues: p.dues || {},
        cancelledWeeks: toSet(p.cancelledWeeks),
        readOnlyWeeks: p.readOnlyWeeks || [],
        banner: p.banner !== undefined ? p.banner : prev.banner,
        adminEmails: p.adminEmails || prev.adminEmails || [],
        recaps: p.recaps || prev.recaps || {},
        recapEnabled: p.recapEnabled !== undefined ? !!p.recapEnabled : prev.recapEnabled,
        locked: p.locked !== undefined ? !!p.locked : prev.locked,
      }));
      if (p.rules) setRules(p.rules);
      if (p.adminPin) setAdminPin(p.adminPin);
      setFbStatus("loaded");
    }, (err)=>console.warn("Snapshot error:", err));
    return ()=>unsub();
  },[]);

  // Subcollection listener — receives live per-match updates from other users
  useEffect(()=>{
    const unsub = WEEK_SCORES_COL.onSnapshot(snap => {
      const msSinceSave = Date.now() - lastMatchSaveTime.current;
      if(msSinceSave < 8000) return;
      snap.docChanges().forEach(change => {
        if(change.type === "removed"){
          const [weekStr, ...rest] = change.doc.id.split("_");
          const mk = rest.join("_");
          setLeague(prev => removeWeekScoreDoc(prev, parseInt(weekStr), mk));
        } else {
          setLeague(prev => applyWeekScoreDoc(prev, change.doc.data(), change.doc.id));
        }
      });
    }, err => console.warn("WeekScores snapshot error:", err));
    return ()=>unsub();
  },[]);

  // ── Season lock ──────────────────────────────────────────────
  // An archived season is read-only. Every score-mutating path goes through this
  // one guard rather than being checked per-screen: the older readOnlyWeeks flag
  // is only honored in EntryTab, so other write paths silently ignore it.
  function assertWritable(action = "edit") {
    if (!league.locked) return true;
    setFbStatus(`save-error:locked:Season ${seasonYear} is archived — cannot ${action}`);
    console.warn(`[season locked] blocked: ${action}`);
    return false;
  }

  async function saveLeague(next){
    // The lock toggle itself must always get through, or the season could never be
    // unlocked. See isLeagueWriteBlocked for the exact rule (and its tests).
    if (isLeagueWriteBlocked(league, next)) {
      setFbStatus(`save-error:locked:Season ${seasonYear} is archived — cannot edit`);
      console.warn("[season locked] blocked: saveLeague");
      return;
    }
    setLeague(next);
    lastSaveTime.current = Date.now();
    try{
      await LEAGUE_DOC.set({
        handicaps: next.handicaps,
        hcpOverrides: next.hcpOverrides||{},
        loHiOverrides: next.loHiOverrides||{},
        seedOverrides: next.seedOverrides||[],
        budget: next.budget||{},
        dues: next.dues||{},
        cancelledWeeks: [...(next.cancelledWeeks || [])],
        readOnlyWeeks: next.readOnlyWeeks || [],
        contacts: next.contacts || {},
        subs: next.subs || [],
        allowedEmails: next.allowedEmails || [],
        adminEmails: next.adminEmails || [],
        banner: next.banner || {},
        recaps: next.recaps || {},
        recapEnabled: !!next.recapEnabled,
        locked: !!next.locked,
      }, {merge:true});
      setFbStatus("loaded");
    }catch(e){
      console.warn("Save error:",e);
      setFbStatus("save-error:"+e.code+":"+e.message);
    }
  }

  async function saveMatchDoc(toSave, week, tlow, thigh){
    if (!assertWritable("save scores")) return;
    const key = matchKey(week, tlow, thigh);
    const docId = `${week}_${key}`;
    // Safety net: back up before an edit that would erase a player's scores
    // (e.g. accidentally subbing a player who already has scores entered).
    if (editLosesScores(league.results[week]?.[key], toSave)) {
      await createSnapshot(`Auto-backup — before edit, Week ${week}`, true);
    }
    lastMatchSaveTime.current = Date.now();
    // Firestore doesn't support nested arrays — flatten [[p0],[p1]] → {p0:[],p1:[]}
    const flatScores = (arr) => Array.isArray(arr) ? { p0: arr[0]||[], p1: arr[1]||[] } : arr;
    try{
      await WEEK_SCORES_COL.doc(docId).set({
        ...toSave,
        t1scores: flatScores(toSave.t1scores),
        t2scores: flatScores(toSave.t2scores),
        week,
        matchKey: key,
        updatedAt: new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}),
        ...(userName ? {updatedBy: userName} : {}),
      }, {merge:true});
      setLeague(prev => ({
        ...prev,
        results: {
          ...prev.results,
          [week]: { ...(prev.results[week]||{}), [key]: normalizeMatch(toSave) },
        },
      }));
    }catch(e){
      console.warn("saveMatchDoc error:",e);
      setFbStatus("save-error:"+e.code+":"+e.message);
    }
  }

  async function saveAdminPin(pin) {
    setAdminPin(pin);
    try {
      await LEAGUE_DOC.set({ adminPin: pin }, { merge: true });
    } catch(e) {
      console.warn("saveAdminPin error:", e);
    }
  }

  function adminUnlock(pin) {
    // If no PIN set yet, any non-empty entry unlocks so you can set one
    if (!adminPin || pin === adminPin) {
      localStorage.setItem("pvgc_admin", "1");
      setIsAdmin(true);
      return true;
    }
    return false;
  }

  function adminLock() {
    localStorage.removeItem("pvgc_admin");
    setIsAdmin(false);
  }

  // Auto-revoke admin if signed-in email is not in the admin list
  useEffect(() => {
    const adminEmails = (league.adminEmails || []).map(e => e.toLowerCase());
    if (!isAdmin || adminEmails.length === 0) return;
    const email = auth.currentUser?.email?.toLowerCase() || "";
    if (email && !adminEmails.includes(email)) {
      localStorage.removeItem("pvgc_admin");
      setIsAdmin(false);
    }
  }, [league.adminEmails, isAdmin]);

  async function saveRules(next) {
    setRules(next);
    try {
      await LEAGUE_DOC.set({ rules: next }, { merge: true });
    } catch(e) {
      console.warn("Rules save error:", e);
    }
  }

  async function clearMatch(week, mk){
    if (!assertWritable("clear a match")) return;
    const docId = `${week}_${mk}`;
    if (league.results[week]?.[mk]) {
      await createSnapshot(`Auto-backup — before clearing match, Week ${week}`, true);
    }
    try {
      // Delete from subcollection
      await WEEK_SCORES_COL.doc(docId).delete();
      // Also remove from main doc legacy results
      const snap = await LEAGUE_DOC.get();
      if (snap.exists) {
        const legacyResults = snap.data().results || {};
        const weekResults = { ...(legacyResults[week] || {}) };
        delete weekResults[mk];
        await LEAGUE_DOC.set({ results: { ...legacyResults, [week]: weekResults } }, { merge: true });
      }
      setLeague(prev => {
        const weekResults = { ...(prev.results[week] || {}) };
        delete weekResults[mk];
        return { ...prev, results: { ...prev.results, [week]: weekResults } };
      });
    } catch(e) {
      console.warn("clearMatch error:", e);
    }
  }

  async function clearSeason(){
    await createSnapshot("Auto-backup — before Clear Season", true);
    const fresh = { ...initLeague(), handicaps: league.handicaps };
    setMatch(initMatch());
    try {
      // Delete all subcollection docs
      const scoresSnap = await WEEK_SCORES_COL.get();
      if(scoresSnap.docs.length > 0){
        const batch = db.batch();
        scoresSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      // Also wipe results from main doc
      await LEAGUE_DOC.set({ results: {} }, { merge: true });
    } catch(e) {
      console.warn("clearSeason error:", e);
    }
    await saveLeague(fresh);
  }

  // ── Snapshots ────────────────────────────────────────────────
  const SNAPSHOTS_COL = LEAGUE_DOC.collection("snapshots");
  // Permanent, immutable record written when each team confirms their match.
  const CONFIRMED_COL = LEAGUE_DOC.collection("confirmedScores");

  async function createSnapshot(label, auto = false) {
    const id = new Date().toISOString().replace(/[:.]/g, "-") + (auto ? "-" + Math.random().toString(36).slice(2, 6) : "");
    const weeksCovered = Object.keys(league.results || {}).filter(w => Object.keys(league.results[w] || {}).length > 0).length;
    // Convert Set → Array so JSON.stringify preserves it
    const serializable = { ...league, cancelledWeeks: [...(league.cancelledWeeks || [])] };
    const data = JSON.stringify(serializable);
    const createdAt = new Date().toLocaleString("en-US");
    // Firestore hard-caps documents at 1 MiB; warn well before we'd hit it.
    if (data.length > 900000) {
      console.warn(`Snapshot is ${(data.length / 1048576).toFixed(2)} MiB — approaching Firestore's 1 MiB per-document limit; snapshots may soon fail to save.`);
    }
    try {
      await SNAPSHOTS_COL.doc(id).set({
        createdAt, label: label || "", weeksCovered, data,
        ...(auto ? { auto: true } : {}),
      });
      // Lightweight index (id → metadata only) so list/prune never download blobs.
      await SNAPSHOTS_COL.doc("_index").set(
        { [id]: { auto: !!auto, createdAt, label: label || "", weeksCovered } },
        { merge: true }
      );
      if (auto) pruneAutoSnapshots();
      return true;
    } catch(e) {
      console.warn("snapshot error:", e);
      return false;
    }
  }

  // Keep only the most recent N auto-backups. Reads the small index doc
  // (one lightweight read) instead of downloading every snapshot blob.
  async function pruneAutoSnapshots(keep = 30) {
    try {
      const idxRef = SNAPSHOTS_COL.doc("_index");
      const idxSnap = await idxRef.get();
      const idx = idxSnap.exists ? (idxSnap.data() || {}) : {};
      const autoIds = Object.keys(idx).filter(id => idx[id]?.auto).sort((a, b) => b.localeCompare(a));
      const excess = autoIds.slice(keep);
      if (!excess.length) return;
      const batch = db.batch();
      excess.forEach(id => batch.delete(SNAPSHOTS_COL.doc(id)));
      const nextIdx = { ...idx };
      excess.forEach(id => { delete nextIdx[id]; });
      batch.set(idxRef, nextIdx); // rewrite trimmed index (tiny doc)
      await batch.commit();
    } catch(e) { console.warn("pruneAutoSnapshots error:", e); }
  }

  async function listSnapshots() {
    try {
      const snap = await SNAPSHOTS_COL.limit(20).get();
      return snap.docs
        .filter(d => d.id !== "_index")
        .map(d => ({ id: d.id, ...d.data(), data: undefined }))
        .sort((a, b) => b.id.localeCompare(a.id))
        .slice(0, 10);
    } catch(e) {
      console.warn("listSnapshots error:", e);
      return [];
    }
  }

  async function restoreSnapshot(id) {
    if (!assertWritable("restore a snapshot")) return;
    try {
      const doc = await SNAPSHOTS_COL.doc(id).get();
      if (!doc.exists) return false;
      const restored = JSON.parse(doc.data().data);

      // Suppress both live listeners for 30s so deletes/writes don't corrupt state
      const suppressUntil = Date.now() + 30000;
      lastSaveTime.current = suppressUntil;
      lastMatchSaveTime.current = suppressUntil;

      const { results, ...mainFields } = restored;
      const flatScores = (arr) => Array.isArray(arr) ? { p0: arr[0]||[], p1: arr[1]||[] } : arr;

      // Delete existing weekScores
      const existing = await WEEK_SCORES_COL.get();
      if (existing.docs.length > 0) {
        const batch = db.batch();
        existing.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // Write snapshot weekScores back
      for (const [week, matches] of Object.entries(results || {})) {
        for (const [mk, rec] of Object.entries(matches || {})) {
          if (!rec) continue;
          await WEEK_SCORES_COL.doc(`${week}_${mk}`).set({
            ...rec,
            t1scores: flatScores(rec.t1scores),
            t2scores: flatScores(rec.t2scores),
            week: parseInt(week),
            matchKey: mk,
          });
        }
      }

      // Write main doc — convert cancelledWeeks to array safely (JSON.stringify turns Sets to {})
      await LEAGUE_DOC.set({
        ...mainFields,
        cancelledWeeks: [...toSet(mainFields.cancelledWeeks)],
        results: {},
      }, { merge: false });

      // All writes done — reload the page for a clean state
      window.location.reload();
      return true;
    } catch(e) {
      console.warn("restoreSnapshot error:", e);
      lastSaveTime.current = 0;
      lastMatchSaveTime.current = 0;
      return false;
    }
  }

  // Live subscription — reads once, then pushes only incremental changes as new
  // confirmed records arrive. Keeps the Verify tab current without re-reading the
  // whole (season-long, growing) collection each time.
  function subscribeConfirmedScores(cb) {
    return CONFIRMED_COL.onSnapshot(
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.warn("confirmedScores subscribe error:", err); cb([]); }
    );
  }

  // Restore a match's live scores from an immutable confirmed record.
  async function restoreConfirmedRecord(rec) {
    if (!assertWritable("restore a score")) return;
    if (!rec) return false;
    const unflat = (s) => Array.isArray(s) ? s : (s ? [s.p0 || [], s.p1 || []] : [[], []]);
    const toSave = {
      t1scores: unflat(rec.t1scores),
      t2scores: unflat(rec.t2scores),
      t1types: rec.t1types || ["normal", "normal"],
      t2types: rec.t2types || ["normal", "normal"],
      ...(rec.hcpSnapshot ? { hcpSnapshot: rec.hcpSnapshot } : {}),
    };
    await saveMatchDoc(toSave, rec.week, rec.tlow, rec.thigh);
    return true;
  }

  async function confirmMatch(week, mk, tid){
    if (!assertWritable("confirm a match")) return;
    const existing = league.results[week]?.[mk] || {};
    const confirmations = {
      ...(existing.confirmations || {}),
      [tid]: {
        confirmedBy: userName || `T${tid}`,
        confirmedAt: new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}),
      },
    };
    const parts = mk.split("-");
    const tlow = parseInt(parts[1]), thigh = parseInt(parts[2]);
    const bothConfirmed = !!(confirmations[tlow] && confirmations[thigh]);
    const docId = `${week}_${mk}`;
    lastMatchSaveTime.current = Date.now();
    const flatScores = (arr) => Array.isArray(arr) ? { p0: arr[0]||[], p1: arr[1]||[] } : arr;
    try {
      await WEEK_SCORES_COL.doc(docId).set(
        { ...existing, t1scores: flatScores(existing.t1scores), t2scores: flatScores(existing.t2scores), week, matchKey: mk, confirmations, locked: bothConfirmed },
        { merge: false }
      );
      // Failsafe: permanent immutable copy of the scores as this team confirmed
      // them. Isolated so a failure here can never block the confirmation itself.
      try {
        const recId = `${week}_${mk}_${tid}_${Date.now().toString(36)}`;
        await CONFIRMED_COL.doc(recId).set({
          week, matchKey: mk, tid, tlow, thigh,
          confirmedBy: userName || `T${tid}`,
          confirmedAt: new Date().toISOString(),
          t1scores: flatScores(existing.t1scores),
          t2scores: flatScores(existing.t2scores),
          t1types: existing.t1types || null,
          t2types: existing.t2types || null,
          hcpSnapshot: existing.hcpSnapshot || null,
        });
      } catch(e) { console.warn("confirmedScores write error:", e); }
      setLeague(prev => ({
        ...prev,
        results: {
          ...prev.results,
          [week]: {
            ...(prev.results[week]||{}),
            [mk]: normalizeMatch({ ...existing, confirmations, locked: bothConfirmed }),
          },
        },
      }));
    } catch(e) {
      console.warn("confirmMatch error:", e);
    }
  }

  async function unlockMatch(week, mk){
    if (!assertWritable("unlock a match")) return;
    const docId = `${week}_${mk}`;
    lastMatchSaveTime.current = Date.now();
    try {
      await WEEK_SCORES_COL.doc(docId).set({ locked: false, confirmations: {} }, { merge: true });
      const existing = league.results[week]?.[mk] || {};
      setLeague(prev => ({
        ...prev,
        results: {
          ...prev.results,
          [week]: {
            ...(prev.results[week]||{}),
            [mk]: normalizeMatch({ ...existing, locked: false, confirmations: {} }),
          },
        },
      }));
    } catch(e) {
      console.warn("unlockMatch error:", e);
    }
  }

  // Reload match when week/team/league changes
  const prevWeekTeam = useRef({week:null,team:null});
  useEffect(()=>{
    const selDynPairs = selWeek===PLAYOFF_START_WEEK ? knockdownPairs
                    : selWeek===PLAYOFF_START_WEEK+1 ? qfPairs
                    : selWeek===PLAYOFF_START_WEEK+2 ? (sfPairs||null)
                    : selWeek===PLAYOFF_START_WEEK+3 ? (finalPairs?[finalPairs.championship,finalPairs.thirdPlace]:null)
                    : null;
    const opp=getOpponent(selTeam,selWeek,selDynPairs);
    if(!opp){setMatch(initMatch());return;}
    const [tlow,thigh]=selTeam<opp?[selTeam,opp]:[opp,selTeam];
    const saved=league.results[selWeek]?.[matchKey(selWeek,tlow,thigh)];
    if(!saved){setMatch(initMatch());return;}
    const display = selTeam===tlow ? {...initMatch(),...saved} : {
      ...initMatch(),...saved,
      t1scores: saved.t2scores || initMatch().t1scores,
      t1types:  saved.t2types  || ["normal","normal"],
      t2scores: saved.t1scores || initMatch().t2scores,
      t2types:  saved.t1types  || ["normal","normal"],
    };
    setMatch(display);
    matchDirty.current = false;
    const prev = prevWeekTeam.current;
    if(prev.week !== selWeek || prev.team !== selTeam){
      setHole(0);
      prevWeekTeam.current = {week:selWeek, team:selTeam};
    }
  },[selWeek,selTeam,league.results]);

  const selDynPairs = selWeek===PLAYOFF_START_WEEK ? knockdownPairs
                    : selWeek===PLAYOFF_START_WEEK+1 ? qfPairs
                    : selWeek===PLAYOFF_START_WEEK+2 ? (sfPairs||null)
                    : selWeek===PLAYOFF_START_WEEK+3 ? (finalPairs?[finalPairs.championship,finalPairs.thirdPlace]:null)
                    : null;
  const opp=getOpponent(selTeam,selWeek,selDynPairs);
  const t1id=selTeam, t2id=opp||0;


  async function saveMatch(matchToSave){
    if(!t1id||!t2id) return;
    const m = matchToSave || match;
    const[tlow,thigh]=t1id<t2id?[t1id,t2id]:[t2id,t1id];
    const hcpSnapshot = {
      [tlow]: [0,1].map(pi => getEffectiveHcp(tlow, pi, selWeek, league.results, league.handicaps, league.hcpOverrides||{}, league.cancelledWeeks)),
      [thigh]: [0,1].map(pi => getEffectiveHcp(thigh, pi, selWeek, league.results, league.handicaps, league.hcpOverrides||{}, league.cancelledWeeks)),
    };
    const toSave = selTeam===tlow
      ? {...m, hcpSnapshot}
      : {...m, hcpSnapshot, t1scores:m.t2scores, t1types:m.t2types, t2scores:m.t1scores, t2types:m.t1types};
    await saveMatchDoc(toSave, selWeek, tlow, thigh);
    setScanMsg("✓ Saved");
    setTimeout(()=>setScanMsg(""),2000);
  }

  const autoSaveTimer = useRef(null);
  const matchHasScores = (m) => m && (
    (m.t1scores||[]).some(arr=>(arr||[]).some(v=>v>0)) ||
    (m.t2scores||[]).some(arr=>(arr||[]).some(v=>v>0))
  );
  useEffect(()=>{
    if(!t1id||!t2id) return;
    if(!matchHasScores(match)) return;
    if(!matchDirty.current) return;
    if(autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(()=>saveMatch(match), 5000);
    return ()=>clearTimeout(autoSaveTimer.current);
  },[match]);

  // Week 18 (Knockdown) has no static pairs in SCHEDULE — they're computed
  // dynamically from seeds. Splice them in so the stats engine (which reads
  // schedule[w].pairs) treats W18 as a normal scored week: standings, POY, POW,
  // and the weekly breakdown all count through the knockdown.
  const scheduleWithKnockdown = React.useMemo(() => ({
    ...SCHEDULE,
    [PLAYOFF_START_WEEK]: { ...SCHEDULE[PLAYOFF_START_WEEK], pairs: knockdownPairs },
  }), [knockdownPairs]);
  // Full schedule incl. the dynamic playoff pairings — used by the Handicap screen
  // so the QF/SF/Final rounds resolve opponents and show each round's handicap.
  const handicapSchedule = React.useMemo(() => ({
    ...scheduleWithKnockdown,
    19: { ...(SCHEDULE[19] || {}), pairs: qfPairs || [] },
    20: { ...(SCHEDULE[20] || {}), pairs: sfPairs || [] },
    21: { ...(SCHEDULE[21] || {}), pairs: finalPairs ? [finalPairs.championship, finalPairs.thirdPlace] : [] },
  }), [scheduleWithKnockdown, qfPairs, sfPairs, finalPairs]);
  const {teamStats,potyList,weeklyPoty,cancelledWeeks}=calcLeagueStats(league.results,league.handicaps,league.cancelledWeeks,PLAYOFF_START_WEEK,scheduleWithKnockdown,undefined,undefined,league.loHiOverrides);
  const teamStandings=rankStandings(teamStats,{results:league.results,handicaps:league.handicaps,seedOverrides:league.seedOverrides});
  const weeklyTeamPts=calcWeeklyTeamPts(league.results,league.handicaps,league.cancelledWeeks,PLAYOFF_START_WEEK,scheduleWithKnockdown,league.loHiOverrides);

  // Standings movement (settled): places gained/lost between the two most
  // recent fully-scored regular-season weeks. + = up, - = down, 0 = no change.
  const standingsMovement = useMemo(() => {
    const rankAt = (maxW) => {
      const { teamStats } = calcLeagueStats(league.results, league.handicaps, league.cancelledWeeks, maxW, scheduleWithKnockdown, undefined, undefined, league.loHiOverrides);
      const rank = {};
      rankStandings(teamStats, { results: league.results, handicaps: league.handicaps, seedOverrides: league.seedOverrides })
        .forEach((s, i) => { rank[s.id] = i + 1; });
      return rank;
    };
    const completed = [];
    for (let w = 1; w <= PLAYOFF_START_WEEK; w++) {
      const pairs = scheduleWithKnockdown[w]?.pairs || [];
      if (pairs.length === 0 || league.cancelledWeeks?.has(w)) continue;
      const allDone = pairs.every(([a, b]) => isMatchComplete(league.results[w]?.[matchKey(w, Math.min(a, b), Math.max(a, b))]));
      if (allDone) completed.push(w);
    }
    if (completed.length < 2) return { movement: {}, throughWeek: null };
    const cur = rankAt(completed[completed.length - 1]);
    const prev = rankAt(completed[completed.length - 2]);
    const movement = {};
    for (const id of Object.keys(cur)) movement[id] = prev[id] - cur[id];
    return { movement, throughWeek: completed[completed.length - 1] };
  }, [league.results, league.handicaps, league.cancelledWeeks, league.loHiOverrides, league.seedOverrides, scheduleWithKnockdown]);

  const weekBonus=calcWeekBonus(selWeek,league.results,league.handicaps);

  // Determine which team the signed-in user belongs to via their contact email
  const currentUserEmail = auth.currentUser?.email?.toLowerCase() || "";
  const currentUserTid = useMemo(() => {
    if (!currentUserEmail) return null;
    for (const [key, c] of Object.entries(league.contacts || {})) {
      if (c?.email?.toLowerCase() === currentUserEmail) return parseInt(key.split("-")[0]);
    }
    return null;
  }, [currentUserEmail, league.contacts]);

  // Default the Scoring/Entry team to the signed-in member once known.
  // Email match is authoritative and locks the default; the Schedule's saved
  // team is a non-locking fallback for members whose email isn't set. Runs
  // once — after that the user can switch teams freely with no interference.
  const didDefaultTeam = useRef(false);
  useEffect(() => {
    if (didDefaultTeam.current) return;
    if (currentUserTid) {
      didDefaultTeam.current = true;
      setTeam(currentUserTid);
      setEntryTeam(currentUserTid);
    } else {
      const saved = parseInt(localStorage.getItem("pvgc_my_team") || "", 10);
      if (saved >= 1 && saved <= 18) { setTeam(saved); setEntryTeam(saved); }
    }
  }, [currentUserTid]);

  const canEditCurrentMatch = isAdmin || (currentUserTid != null && (currentUserTid === t1id || currentUserTid === t2id));
  const setMatchUser = (fn) => {
    if (!canEditCurrentMatch) return;
    matchDirty.current = true;
    setMatch(fn);
  };

  // Board(masters)/Predict/Pulse hidden for 2026 (unused) — code kept; delete at season-end cleanup.
  const TABS=["schedule","live","scoring","entry","standings","weekly","poty","hcp","playoffs","players","rules","admin"];
  const PRIMARY_TABS=["schedule","live","scoring","standings","players","poty","hcp","rules","contacts","weekly"].concat(league.recapEnabled?["recap"]:[]);
  const MORE_TABS=["entry","playoffs","champions","stats","admin","verify","howto"].filter(t => t !== "verify" || isAdmin);
  const TAB_LABEL={schedule:"Schedule",live:"Live",scoring:"Scoring",entry:"Entry",standings:"Standings",masters:"Board",weekly:"Weekly",poty:"POTY",hcp:"HCP",playoffs:"Playoffs",players:"Players",contacts:"Subs",stats:"Stats",rules:"Rules",admin:"Admin",verify:"Verify",predict:"Predict",pulse:"Pulse",howto:"How To",recap:"Recap",champions:"Champions"};
  const inMore = MORE_TABS.includes(screen);

  // Current match doc (for confirm/lock)
  const [cTlow,cThigh] = t1id && t2id ? (t1id<t2id?[t1id,t2id]:[t2id,t1id]) : [0,0];
  const currentMk = cTlow && cThigh ? matchKey(selWeek,cTlow,cThigh) : null;

  return(
    <div style={{minHeight:"100vh",background:BG,fontFamily:FB,color:CREAM,paddingBottom:"60px",
      backgroundImage:"radial-gradient(ellipse at 30% 0%,#dfe8d4 0%,transparent 50%),radial-gradient(ellipse at 70% 100%,#e8e0cc 0%,transparent 50%)"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;}
        input[type=number]{-moz-appearance:textfield;}
        select{-webkit-appearance:none;-moz-appearance:none;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:#2a3a1a;border-radius:2px;}
        button:hover{opacity:0.85;}
      `}</style>

      {fbStatus==="connecting"&&(
        <div style={{background:"#fffbe6",borderBottom:"2px solid #f0c040",padding:"10px 18px",
          fontSize:"13px",color:"#7a5a00",display:"flex",alignItems:"center",gap:"8px"}}>
          <span>⏳</span> Connecting to database…
        </div>
      )}
      {(fbStatus.startsWith("error")||fbStatus.startsWith("save-error"))&&(
        <div style={{background:"#fff0f0",borderBottom:"2px solid #e04040",padding:"10px 18px",
          fontSize:"13px",color:"#900",display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
          <span>⚠️</span>
          <span><strong>Database error:</strong></span>
          <span style={{fontSize:"11px"}}>{fbStatus}</span>
        </div>
      )}
      <Banner banner={league?.banner} />

      {screen!=="live" && (
      <div style={{padding:"12px 18px 0 18px",
        display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"8px",
        background:"#ffffff",position:"sticky",top:0,zIndex:20,
        borderBottom:`3px solid ${G}`,
        boxShadow:"0 3px 10px rgba(26,61,36,0.12)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"13px",paddingBottom:"12px"}}>
          <div>
            <div style={{fontFamily:FD,fontSize:"20px",color:"#0f2a14",letterSpacing:"0.02em",fontWeight:700}}>PVGC {seasonYear} League</div>
            <div style={{fontSize:"11px",color:"#3a5a3a",marginTop:"1px",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:500}}>
              Pickering Valley · 18 Teams · Stableford · <span style={{color:GOLD}}>v4.0</span> · <span style={{color:"#2f5a3a"}}>{LEAGUE_DOC_ID}</span>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
            <span style={{fontSize:"11px",color:"#3a5a3a",letterSpacing:"0.08em",textTransform:"uppercase"}}>Season</span>
            <select
              value={seasonYear}
              onChange={(e)=>changeSeason(parseInt(e.target.value, 10))}
              style={{
                background:"rgba(255,255,255,0.95)", border:`1px solid ${GOLD}44`,
                borderRadius:"7px", color:"#0f2a14", fontFamily:FB, fontSize:"13px",
                padding:"4px 8px", cursor:"pointer", outline:"none"
              }}>
              {AVAILABLE_SEASONS.map((y)=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div style={{display:"flex",gap:"0px",flexWrap:"wrap"}}>
          {PRIMARY_TABS.map(t=>(
            <NavBtn key={t} active={screen===t} onClick={()=>{setScreen(t);setMoreOpen(false);}}>
              {TAB_LABEL[t]}
            </NavBtn>
          ))}
          <NavBtn active={inMore||moreOpen} onClick={()=>setMoreOpen(o=>!o)}>
            {inMore ? TAB_LABEL[screen] : "More"} {moreOpen?"▴":"▾"}
          </NavBtn>
        </div>
        {moreOpen&&(
          <div style={{
            width:"100%", borderTop:`1px solid ${G}22`,
            display:"flex", flexWrap:"wrap", gap:"0px",
            background:"#f8f5ee", paddingBottom:"6px"
          }}>
            {MORE_TABS.map(t=>(
              <NavBtn key={t} active={screen===t} onClick={()=>{if(t==="players") setSelPlayer(null); setScreen(t);setMoreOpen(false);}}>
                {TAB_LABEL[t]}
              </NavBtn>
            ))}
          </div>
        )}
      </div>
      )}

      {screen==="schedule"&&(
        <ScheduleScreen
          league={league}
          selWeek={selWeek}
          setWeek={setWeek}
          setTeam={setTeam}
          setScreen={setScreen}
          knockdownPairs={knockdownPairs}
          qfPairs={qfPairs}
          sfPairs={sfPairs}
          finalPairs={finalPairs}
          cancelledWeeks={cancelledWeeks}
          currentUserTid={currentUserTid}
          ready={fbStatus === "loaded"}
          onPlayerClick={(tid, pi) => { setSelPlayer({ tid, pi }); setScreen("players"); setMoreOpen(false); }}
          toggleCancelWeek={(w) => {
            const next = { ...league, cancelledWeeks: toSet(league.cancelledWeeks) };
            if (next.cancelledWeeks.has(w)) {
              next.cancelledWeeks.delete(w);
            } else {
              next.cancelledWeeks.add(w);
            }
            saveLeague(next);
          }}
        />
      )}

      {screen==="scoring"&&(()=>{
        return <>
          <ScoringScreen
            selWeek={selWeek}
            setWeek={setWeek}
            selTeam={selTeam}
            setTeam={setTeam}
            opp={opp}
            match={match}
            setMatch={setMatchUser}
            hole={hole}
            setHole={setHole}
            t1id={t1id}
            t2id={t2id}
            league={league}
            saveLeague={saveLeague}
            weekBonus={weekBonus}
            cancelledWeeks={cancelledWeeks}
            toggleCancelWeek={(w) => {
              const next = { ...league, cancelledWeeks: toSet(league.cancelledWeeks) };
              if (next.cancelledWeeks.has(w)) next.cancelledWeeks.delete(w);
              else next.cancelledWeeks.add(w);
              saveLeague(next);
            }}
            currentUserTid={currentUserTid}
            isAdmin={isAdmin}
            confirmMatch={confirmMatch}
            unlockMatch={unlockMatch}
          />
        </>;
      })()}

      {screen==="standings"&&(
        <StandingsScreen
          teamStandings={teamStandings}
          weeklyTeamPts={weeklyTeamPts}
          movement={standingsMovement.movement}
          movementThroughWeek={standingsMovement.throughWeek}
        />
      )}

      {screen==="masters"&&(
        <MastersBoard league={league} />
      )}

      {screen==="weekly"&&(
        <WeeklyScreen weeklyTeamPts={weeklyTeamPts} results={league.results} cancelledWeeks={cancelledWeeks} schedule={scheduleWithKnockdown} />
      )}

      {screen==="recap"&&league.recapEnabled&&(
        <RecapScreen league={league} saveLeague={saveLeague} isAdmin={isAdmin} schedule={handicapSchedule} weeklyPoty={weeklyPoty} />
      )}

      {screen==="poty"&&(
        <PotyScreen
          potyTab={potyTab}
          setPotyTab={setPotyTab}
          potyList={potyList}
          weeklyPoty={weeklyPoty}
          cancelledWeeks={cancelledWeeks}
          onPlayerClick={(tid, pi) => { setSelPlayer({ tid, pi }); setScreen("players"); setMoreOpen(false); }}
        />
      )}

      {screen==="entry"&&(
        <EntryTab
          league={league} saveLeague={saveLeague} saveMatchDoc={saveMatchDoc}
          entryWeek={selWeek} setEntryWeek={setWeek}
          entryTeam={entryTeam} setEntryTeam={setEntryTeam}
          entryScores={entryScores} setEntryScores={setEntryScores}
          entrySaved={entrySaved} setEntrySaved={setEntrySaved}
          knockdownPairs={knockdownPairs} qfPairs={qfPairs}
          sfPairs={sfPairs} finalPairs={finalPairs}
          cancelledWeeks={cancelledWeeks}
          toggleCancelWeek={(w) => {
            const next = { ...league, cancelledWeeks: toSet(league.cancelledWeeks) };
            if (next.cancelledWeeks.has(w)) {
              next.cancelledWeeks.delete(w);
            } else {
              next.cancelledWeeks.add(w);
            }
            saveLeague(next);
          }}
        />
      )}

      {screen==="hcp"&&(
        <HandicapScreen
          league={league}
          saveLeague={saveLeague}
          isAdmin={isAdmin}
          schedule={handicapSchedule}
        />
      )}

      {screen==="live"&&(
        <LiveScreen
          league={league}
          schedule={handicapSchedule}
          qfSeeds={qfSeeds}
          playoffSeeds={playoffSeeds}
          onExit={()=>setScreen(prevScreenRef.current||"schedule")}
        />
      )}

      {screen==="playoffs"&&(
        <PlayoffScreen
          league={league}
          playoffSeeds={playoffSeeds}
          qfSeeds={qfSeeds}
          knockdownPairs={knockdownPairs}
          qfPairs={qfPairs}
          sfPairs={sfPairs}
          finalPairs={finalPairs}
          teamStandings={teamStandings}
        />
      )}

      {screen==="players"&&(
        <PlayerScreen league={league} initialPlayer={selPlayer} isAdmin={isAdmin} saveLeague={saveLeague} schedule={handicapSchedule} />
      )}

      {screen==="contacts"&&(
        <ContactsScreen league={league} saveLeague={saveLeague} isAdmin={isAdmin} />
      )}

      {screen==="champions"&&(
        <ChampionsScreen />
      )}

      {screen==="stats"&&(
        <StatsScreen league={league} />
      )}

      {screen==="predict"&&(
        <PredictScreen league={league} />
      )}

      {screen==="pulse"&&(
        <PulseScreen league={league} />
      )}

      {screen==="rules"&&(
        <RulesScreen rules={rules} saveRules={saveRules} />
      )}

      {screen==="howto"&&(
        <iframe
          src="how-to.html"
          style={{ width:"100%", height:"calc(100vh - 48px)", border:"none" }}
          title="How To"
        />
      )}

      {screen==="verify"&&isAdmin&&(
        <ConfirmedScoresScreen
          league={league}
          subscribeConfirmedScores={subscribeConfirmedScores}
          restoreConfirmedRecord={restoreConfirmedRecord}
        />
      )}

      {screen==="admin"&&(
        <AdminScreen
          league={league}
          knockdownPairs={knockdownPairs}
          qfPairs={qfPairs}
          sfPairs={sfPairs}
          finalPairs={finalPairs}
          saveLeague={saveLeague}
          unlockMatch={unlockMatch}
          clearMatch={clearMatch}
          clearSeason={clearSeason}
          isAdmin={isAdmin}
          adminPin={adminPin}
          adminUnlock={adminUnlock}
          adminLock={adminLock}
          saveAdminPin={saveAdminPin}
          teamStandings={teamStandings}
          potyList={potyList}
          weeklyTeamPts={weeklyTeamPts}
          createSnapshot={createSnapshot}
          listSnapshots={listSnapshots}
          restoreSnapshot={restoreSnapshot}
          match={match}
          setMatch={setMatchUser}
          activeWeek={selWeek}
          activeTeam={selTeam}
          cancelledWeeks={cancelledWeeks}
          toggleCancelWeek={(w) => {
            const next = { ...league, cancelledWeeks: toSet(league.cancelledWeeks) };
            if (next.cancelledWeeks.has(w)) {
              next.cancelledWeeks.delete(w);
            } else {
              next.cancelledWeeks.add(w);
            }
            saveLeague(next);
          }}
        />
      )}
    </div>
  );
}


function AppWithAuth() {
  return <AuthGate><App /></AuthGate>;
}

export default AppWithAuth;
