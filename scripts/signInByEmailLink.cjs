/**
 * Sign a script in as you, by emailed link — no password.
 *
 * The database only lets real, signed-in people read or write league data;
 * anonymous sign-in is refused (it's open to anyone holding the web API key,
 * which ships inside the app). So a script asks for a link, you copy it from
 * the email, paste it into the terminal, and the script carries on as you.
 *
 *   PVGC_EMAIL=you@example.com node scripts/carry-season.mjs 2026 2027
 *
 * Without PVGC_EMAIL it asks for the address.
 */
const readline = require("readline");

const CONTINUE_URL = "https://pvgc-league.github.io/PVGC-2026/";

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

/** `auth` is a compat auth instance: firebase.auth(). Resolves to the signed-in user. */
async function signInByEmailLink(auth, { email = process.env.PVGC_EMAIL, ask: prompt = ask, log = console.log } = {}) {
  if (auth.currentUser && !auth.currentUser.isAnonymous) return auth.currentUser;
  const address = email || (await prompt("Your email: "));
  if (!address) throw new Error("No email given — can't sign in.");
  await auth.sendSignInLinkToEmail(address, { url: CONTINUE_URL, handleCodeInApp: true });
  log(`\nA sign-in link is on its way to ${address}.`);
  log("Open the email, copy the link (don't tap it), and paste it here.\n");
  const link = await prompt("Link: ");
  if (!auth.isSignInWithEmailLink(link)) throw new Error("That isn't the sign-in link from the email.");
  const cred = await auth.signInWithEmailLink(address, link);
  log(`Signed in as ${cred.user.email}.\n`);
  return cred.user;
}

module.exports = { signInByEmailLink, CONTINUE_URL };
