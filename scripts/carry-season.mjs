/**
 * carry-season.mjs — Carry league configuration from one season to the next.
 *
 *   npm run carry-season -- 2026 2027            # dry run, shows what it would do
 *   npm run carry-season -- 2026 2027 --write    # actually write
 *
 * A new season's Firestore doc starts empty, and several defaults treat empty as
 * permissive — an empty allowedEmails lets ANYONE sign in, and a missing adminPin
 * lets anyone unlock admin. So the access config has to come across before a season
 * opens, along with the things that describe the club rather than the season.
 *
 * Carried:  adminEmails, adminPin, allowedEmails, contacts, subs, rules, budget
 * Reset:    results, handicaps, dues, cancelledWeeks, readOnlyWeeks, recaps,
 *           recapEnabled, hcpOverrides, loHiOverrides, seedOverrides, banner, locked
 *
 * Handicaps are deliberately NOT carried — they come from the new season's
 * constants file (see capture-handicaps.mjs).
 */
import fs from "fs";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import "firebase/compat/auth";

const [fromArg, toArg] = process.argv.slice(2);
const write = process.argv.includes("--write");
const from = parseInt(fromArg, 10), to = parseInt(toArg, 10);
if (!from || !to) {
  console.error("Usage: npm run carry-season -- <fromYear> <toYear> [--write]");
  process.exit(1);
}

// Roster for both seasons, so contacts follow the PERSON, not the slot.
async function teamsFor(year) {
  const mod = await import(`../src/constants/league_${year}.js`);
  return mod.TEAMS;
}

const CARRY = ["adminEmails", "adminPin", "allowedEmails", "rules", "budget"];
const RESET = ["results", "handicaps", "dues", "cancelledWeeks", "readOnlyWeeks", "recaps",
               "recapEnabled", "hcpOverrides", "loHiOverrides", "seedOverrides", "banner", "locked"];

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

(async () => {
  try {
    // Prefer the committed archive; fall back to reading the live doc.
    let src;
    const archive = `archives/league-${from}.json`;
    if (fs.existsSync(archive)) {
      src = JSON.parse(fs.readFileSync(archive, "utf8")).league;
      console.log(`Source: ${archive}`);
    } else {
      await auth.signInAnonymously();
      const snap = await db.collection("pvgc").doc(`league-${from}`).get();
      if (!snap.exists) throw new Error(`league-${from} not found`);
      src = snap.data();
      console.log(`Source: live pvgc/league-${from}`);
    }

    const payload = {};
    for (const k of CARRY) if (src[k] !== undefined) payload[k] = src[k];

    // Contacts are keyed by "tid-pi" — a SLOT, not a person. Remap by name so a
    // reshuffled roster doesn't hand someone else's phone number to a new pairing.
    const oldTeams = await teamsFor(from);
    const newTeams = await teamsFor(to);
    const nameToNewSlot = {};
    for (const [tid, t] of Object.entries(newTeams)) {
      if (t.p1) nameToNewSlot[t.p1.trim().toLowerCase()] = `${tid}-0`;
      if (t.p2) nameToNewSlot[t.p2.trim().toLowerCase()] = `${tid}-1`;
    }
    const contacts = {};
    const dropped = [];
    let moved = 0;
    for (const [slot, c] of Object.entries(src.contacts || {})) {
      const [tid, pi] = slot.split("-");
      const name = oldTeams[tid]?.[pi === "0" ? "p1" : "p2"];
      const dest = name ? nameToNewSlot[name.trim().toLowerCase()] : null;
      if (!dest) { dropped.push(name || slot); continue; }
      if (dest !== slot) moved++;
      contacts[dest] = c;
    }
    payload.contacts = contacts;

    // Subs carry their contact details but not last season's bookings.
    payload.subs = (src.subs || []).map(s => ({ ...s, bookings: {} }));

    console.log(`\nWould carry into league-${to}:`);
    for (const k of CARRY) {
      const v = payload[k];
      const n = Array.isArray(v) ? `${v.length} items` : (v && typeof v === "object") ? `${Object.keys(v).length} keys` : JSON.stringify(v);
      console.log(`  ${k.padEnd(15)} ${v === undefined ? "(absent)" : n}`);
    }
    console.log(`  ${"contacts".padEnd(15)} ${Object.keys(contacts).length} of ${Object.keys(src.contacts || {}).length}${moved ? ` (${moved} moved slot)` : ""}`);
    console.log(`  ${"subs".padEnd(15)} ${payload.subs.length} items (bookings cleared)`);
    if (dropped.length) console.log(`\n  Dropped — not on the ${to} roster: ${dropped.join(", ")}`);
    console.log(`\nDeliberately NOT carried (per-season): ${RESET.join(", ")}`);

    if (!write) {
      console.log(`\nDry run. Re-run with --write to apply.`);
      process.exit(0);
    }

    if (!auth.currentUser) await auth.signInAnonymously();
    await db.collection("pvgc").doc(`league-${to}`).set(payload, { merge: true });
    console.log(`\n✓ Written to pvgc/league-${to}`);
    process.exit(0);
  } catch (e) {
    console.error("ERROR:", e.code || "", e.message || e);
    process.exit(1);
  }
})();
