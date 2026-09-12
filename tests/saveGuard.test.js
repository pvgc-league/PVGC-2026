import { describe, it, expect } from "vitest";

// Mirrors the omission rule in App.saveLeague. saveLeague is a whole-object write,
// so an empty collection would overwrite whatever is stored. For fields that
// describe the club rather than the season, empty nearly always means "this client
// never loaded it" — writing it once flattened the carried 2027 config (contacts,
// subs, allowedEmails, adminEmails, budget all to zero, taking access control with
// them). These guard that rule so it can't quietly regress.
const PROTECTED = ["contacts", "subs", "allowedEmails", "adminEmails", "budget"];
const isEmpty = (v) => !v || (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);

function buildPayload(next) {
  const payload = {
    handicaps: next.handicaps,
    dues: next.dues || {},
    contacts: next.contacts || {},
    subs: next.subs || [],
    allowedEmails: next.allowedEmails || [],
    adminEmails: next.adminEmails || [],
    budget: next.budget || {},
    recapEnabled: !!next.recapEnabled,
  };
  for (const k of PROTECTED) if (isEmpty(payload[k])) delete payload[k];
  return payload;
}

describe("saveLeague never writes empty club config", () => {
  it("omits every protected field when the client has nothing loaded", () => {
    const p = buildPayload({ handicaps: { 1: [5, 4] } });
    for (const k of PROTECTED) expect(p, `${k} would wipe stored data`).not.toHaveProperty(k);
  });

  it("writes them when they actually hold data", () => {
    const p = buildPayload({
      handicaps: {},
      contacts: { "1-0": { phone: "215-555-0100" } },
      subs: [{ name: "Grant" }],
      allowedEmails: ["a@b.com"],
      adminEmails: ["admin@b.com"],
      budget: { duesPerPlayer: 60 },
    });
    for (const k of PROTECTED) expect(p).toHaveProperty(k);
    expect(p.allowedEmails).toEqual(["a@b.com"]);
  });

  it("still writes per-season fields even when empty — those legitimately reset", () => {
    const p = buildPayload({ handicaps: {}, dues: {} });
    expect(p).toHaveProperty("dues");
    expect(p).toHaveProperty("recapEnabled");
  });

  it("treats an access list of one as data, not emptiness", () => {
    const p = buildPayload({ handicaps: {}, allowedEmails: ["only@one.com"] });
    expect(p.allowedEmails).toHaveLength(1);
  });
});
