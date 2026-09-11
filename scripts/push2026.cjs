/**
 * push2026.cjs — Push 2026 starting handicaps into Firebase.
 *
 * Usage:
 *   node scripts/push2026.cjs          # push DEFAULT_HCP to league-2026
 *
 * Run from the project root.
 */

const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

const firebaseConfig = {
  apiKey:            "AIzaSyA0ubEbHoYbfCSjfNxHUkt_fr_6WMb3t5Y",
  authDomain:        "pvgc-league.firebaseapp.com",
  projectId:         "pvgc-league",
  storageBucket:     "pvgc-league.firebasestorage.app",
  messagingSenderId: "731595471102",
  appId:             "1:731595471102:web:d4ad8bf15746bab7874daf",
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db  = firebase.firestore();
const DOC = db.collection("pvgc").doc("league-2026");

// Starting handicaps come from the constants file — the single source of truth.
// This script previously carried its own copy, which drifted out of sync with
// league_2026.js by 8 players and would have clobbered them on a re-run.
const { loadDefaultHcp } = require("./_season-hcp.cjs");
const DEFAULT_HCP = loadDefaultHcp(2026);

(async () => {
  try {
    console.log("Pushing 2026 starting handicaps to Firebase …");
    // merge: true so existing results/hcpOverrides are preserved
    await DOC.set({ handicaps: DEFAULT_HCP }, { merge: true });
    console.log("✓ Done — league-2026 handicaps updated");
    console.log("");
    console.log("Teams updated:");
    for (const [tid, hcps] of Object.entries(DEFAULT_HCP)) {
      console.log(`  T${tid}: [${hcps}]`);
    }
    process.exit(0);
  } catch (e) {
    console.error("Error:", e.message || e);
    process.exit(1);
  }
})();
