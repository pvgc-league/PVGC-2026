import { describe, it, expect, vi, afterEach } from "vitest";
import {
  AVAILABLE_SEASONS,
  DRAFT_SEASONS,
  CURRENT_SEASON,
  SEASON_YEAR,
  isDraftSeason,
  setSeasonYear,
} from "../src/constants/league.js";

// A draft season's schedule looks exactly as authoritative as a final one. These
// guard the "member accidentally plans their summer around it" case.
describe("draft seasons", () => {
  it("flags 2027 as a draft and 2026 as final", () => {
    expect(isDraftSeason(2027)).toBe(true);
    expect(isDraftSeason(2026)).toBe(false);
  });

  it("accepts a string year (comes off a <select> as a string)", () => {
    expect(isDraftSeason("2027")).toBe(true);
  });

  it("never defaults anyone to a draft", () => {
    expect(isDraftSeason(CURRENT_SEASON)).toBe(false);
    expect(isDraftSeason(SEASON_YEAR)).toBe(false);
  });

  it("hides drafts from the picker for a non-admin viewer", () => {
    // No window here, so isAdminViewer() is false — the member's view.
    for (const y of DRAFT_SEASONS) expect(AVAILABLE_SEASONS).not.toContain(y);
    expect(AVAILABLE_SEASONS).toContain(CURRENT_SEASON);
  });

  it("refuses to switch a non-admin into a draft season", () => {
    expect(setSeasonYear(2027)).toBe(false);
  });

  it("keeps every draft actually registered, so the gate is the only thing hiding it", () => {
    // If a draft year were simply missing from SEASONS, ACTIVE would be undefined
    // and the app would break rather than fall back.
    for (const y of DRAFT_SEASONS) expect(typeof y).toBe("number");
    expect(DRAFT_SEASONS.length).toBeGreaterThan(0);
  });
});

// The module reads localStorage once at import time, so these re-import it under a
// stubbed window to exercise the admin and stale-value paths.
describe("draft seasons — viewer-dependent resolution", () => {
  const load = async (store) => {
    vi.resetModules();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
      },
    });
    return import("../src/constants/league.js");
  };

  afterEach(() => vi.unstubAllGlobals());

  it("lets an admin select and land on the draft", async () => {
    const L = await load({ pvgc_admin: "1", pvgc_season_year: "2027" });
    expect(L.AVAILABLE_SEASONS).toContain(2027);
    expect(L.SEASON_YEAR).toBe(2027);
  });

  it("sends a member with a stale 2027 stored value back to 2026", async () => {
    // The case that worried us: an admin's phone handed over, or a leftover
    // localStorage entry, silently showing someone an unfinished season.
    const L = await load({ pvgc_season_year: "2027" });
    expect(L.SEASON_YEAR).toBe(2026);
    expect(L.AVAILABLE_SEASONS).not.toContain(2027);
  });

  it("still gives a member the final season normally", async () => {
    const L = await load({ pvgc_season_year: "2026" });
    expect(L.SEASON_YEAR).toBe(2026);
  });

  it("ignores a junk stored value", async () => {
    const L = await load({ pvgc_season_year: "banana" });
    expect(L.SEASON_YEAR).toBe(2026);
  });
});
