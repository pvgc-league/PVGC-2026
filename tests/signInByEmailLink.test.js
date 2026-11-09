import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { signInByEmailLink, CONTINUE_URL } = require("../scripts/signInByEmailLink.cjs");

const LINK = "https://pvgc-league.firebaseapp.com/__/auth/action?mode=signIn&oobCode=abc";

function fakeAuth({ current = null } = {}) {
  const calls = [];
  return {
    calls,
    currentUser: current,
    async sendSignInLinkToEmail(email, settings) { calls.push(["send", email, settings]); },
    isSignInWithEmailLink(link) { return link === LINK; },
    async signInWithEmailLink(email, link) { calls.push(["signIn", email, link]); return { user: { email, isAnonymous: false } }; },
  };
}
const answers = (...xs) => async () => xs.shift();
const quiet = () => {};

describe("signInByEmailLink", () => {
  it("sends a link, takes the pasted link, and signs in", async () => {
    const auth = fakeAuth();
    const user = await signInByEmailLink(auth, { email: "karl@example.com", ask: answers(LINK), log: quiet });
    expect(user.email).toBe("karl@example.com");
    expect(auth.calls[0]).toEqual(["send", "karl@example.com", { url: CONTINUE_URL, handleCodeInApp: true }]);
    expect(auth.calls[1]).toEqual(["signIn", "karl@example.com", LINK]);
  });

  it("asks for the email when it isn't set", async () => {
    const auth = fakeAuth();
    await signInByEmailLink(auth, { email: undefined, ask: answers("karl@example.com", LINK), log: quiet });
    expect(auth.calls[0][1]).toBe("karl@example.com");
  });

  it("refuses something that isn't the emailed link", async () => {
    await expect(signInByEmailLink(fakeAuth(), { email: "karl@example.com", ask: answers("https://example.com"), log: quiet }))
      .rejects.toThrow("isn't the sign-in link");
  });

  it("doesn't sign in twice in one run", async () => {
    const auth = fakeAuth({ current: { email: "karl@example.com", isAnonymous: false } });
    await signInByEmailLink(auth, { ask: answers(), log: quiet });
    expect(auth.calls).toEqual([]);
  });

  it("doesn't count an anonymous session as signed in", async () => {
    const auth = fakeAuth({ current: { isAnonymous: true } });
    await signInByEmailLink(auth, { email: "karl@example.com", ask: answers(LINK), log: quiet });
    expect(auth.calls.map((c) => c[0])).toEqual(["send", "signIn"]);
  });

  it("sends the link back to the league app's own address, which Firebase already allows", () => {
    expect(CONTINUE_URL).toBe("https://pvgc-league.github.io/PVGC-2026/");
  });
});

describe("the scripts no longer sign in anonymously", () => {
  for (const f of ["carry-season.mjs", "archive-season.cjs"]) {
    it(f, () => {
      const src = fs.readFileSync(path.join(process.cwd(), "scripts", f), "utf8");
      expect(src).not.toMatch(/signInAnonymously/);
      expect(src).toMatch(/signInByEmailLink\(auth\)/);
    });
  }
});

describe("database rules", () => {
  const rules = fs.readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");
  const pvgc = rules.slice(rules.indexOf("match /pvgc/"), rules.indexOf("match /weekends/"));

  it("refuse anonymous sessions on league data", () => {
    expect(rules).toMatch(/sign_in_provider != 'anonymous'/);
    expect(pvgc).not.toMatch(/request\.auth != null/);
    expect(pvgc.match(/realUser\(\)/g).length).toBeGreaterThanOrEqual(4);
  });

  it("keep confirmed scores permanent", () => {
    expect(pvgc).toMatch(/allow update, delete: if false;/);
  });
});
