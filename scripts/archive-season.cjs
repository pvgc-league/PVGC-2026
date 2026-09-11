/**
 * archive-season.cjs — READ ONLY. Exports a full season to archives/league-<year>.json.
 *
 * Usage:
 *   node scripts/archive-season.cjs 2026
 *
 * Captures the league doc plus the weekScores and confirmedScores subcollections,
 * exactly as stored (no normalizing) so the archive is a faithful record.
 *
 * NOTE: the `snapshots` subcollection is deliberately NOT the archive — it
 * auto-prunes on a cap (see createSnapshot in App.jsx). This file is the durable
 * record; commit it.
 *
 * PREREQUISITE: Firebase console → Authentication → Sign-in method → Anonymous → Enable.
 * Turn it back off when you're done.
 */
const fs = require("fs");
const path = require("path");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
require("firebase/compat/auth");

const year = parseInt(process.argv[2], 10);
if (!year) {
  console.error("Usage: node scripts/archive-season.cjs <year>");
  process.exit(1);
}

if (!firebase.apps.length) firebase.initializeApp({
  apiKey: "AIzaSyA0ubEbHoYbfCSjfNxHUkt_fr_6WMb3t5Y",
  authDomain: "pvgc-league.firebaseapp.com",
  projectId: "pvgc-league",
  storageBucket: "pvgc-league.firebasestorage.app",
  messagingSenderId: "731595471102",
  appId: "1:731595471102:web:d4ad8bf15746bab7874daf",
});
const db = firebase.firestore();
const auth = firebase.auth();
const DOC = db.collection("pvgc").doc(`league-${year}`);

async function dumpCollection(name) {
  const out = {};
  const snap = await DOC.collection(name).get();
  snap.forEach(d => { out[d.id] = d.data(); });
  return out;
}

(async () => {
  try {
    await auth.signInAnonymously();
    console.log(`Reading league-${year} …`);

    const docSnap = await DOC.get();
    if (!docSnap.exists) {
      console.error(`✗ league-${year} does not exist.`);
      process.exit(1);
    }
    const league = docSnap.data();
    const weekScores = await dumpCollection("weekScores");
    const confirmedScores = await dumpCollection("confirmedScores");

    const archive = {
      season: year,
      exportedAt: new Date().toISOString(),
      league,
      weekScores,
      confirmedScores,
    };

    const dir = path.join(__dirname, "..", "archives");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `league-${year}.json`);
    fs.writeFileSync(file, JSON.stringify(archive, null, 2));

    // Summary — weeks covered, so you can eyeball completeness
    const weeks = {};
    for (const id of Object.keys(weekScores)) {
      const w = parseInt(id.split("_")[0], 10);
      if (w) weeks[w] = (weeks[w] || 0) + 1;
    }
    const weekList = Object.keys(weeks).map(Number).sort((a, b) => a - b);

    console.log(`✓ Wrote archives/league-${year}.json (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
    console.log(`  league doc keys : ${Object.keys(league).length}`);
    console.log(`  weekScores docs : ${Object.keys(weekScores).length}`);
    console.log(`  confirmedScores : ${Object.keys(confirmedScores).length}`);
    console.log(`  weeks present   : ${weekList.join(", ")}`);
    console.log(`  matches per week: ${weekList.map(w => `W${w}:${weeks[w]}`).join("  ")}`);
    process.exit(0);
  } catch (e) {
    console.error("ERROR:", e.code || "", e.message || e);
    if (String(e.code).includes("admin-restricted")) {
      console.error("→ Enable Anonymous sign-in in the Firebase console, then re-run.");
    }
    process.exit(1);
  }
})();
