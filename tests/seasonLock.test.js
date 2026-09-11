import { describe, it, expect } from "vitest";
import { isLeagueWriteBlocked, applySnapshotToLeague } from "../src/lib/persistence.js";

describe("season lock — write policy", () => {
  const open = { locked: false };
  const archived = { locked: true };

  it("allows every write on an open season", () => {
    expect(isLeagueWriteBlocked(open, { ...open, dues: { "1-0": true } })).toBe(false);
    expect(isLeagueWriteBlocked({}, { handicaps: {} })).toBe(false);
    expect(isLeagueWriteBlocked(undefined, {})).toBe(false);
  });

  it("blocks ordinary edits on an archived season", () => {
    expect(isLeagueWriteBlocked(archived, { ...archived, dues: { "1-0": true } })).toBe(true);
    expect(isLeagueWriteBlocked(archived, { ...archived, handicaps: { 1: [5, 4] } })).toBe(true);
  });

  it("lets the unlock through, so a season is never permanently stuck", () => {
    expect(isLeagueWriteBlocked(archived, { ...archived, locked: false })).toBe(false);
  });

  it("fails closed when the flag is dropped instead of explicitly cleared", () => {
    // A caller that rebuilt `next` without spreading the league would otherwise
    // look like an unlock and silently bypass the archive.
    expect(isLeagueWriteBlocked(archived, { handicaps: {} })).toBe(true);
    expect(isLeagueWriteBlocked(archived, { locked: undefined })).toBe(true);
    expect(isLeagueWriteBlocked(archived, {})).toBe(true);
    expect(isLeagueWriteBlocked(archived, null)).toBe(true);
  });

  it("does not treat a truthy non-false value as an unlock", () => {
    expect(isLeagueWriteBlocked(archived, { locked: 0 })).toBe(true);
    expect(isLeagueWriteBlocked(archived, { locked: "" })).toBe(true);
  });
});

describe("season lock — persistence round-trip", () => {
  it("reads locked back off a snapshot", () => {
    expect(applySnapshotToLeague({}, { locked: true }, {}).locked).toBe(true);
    expect(applySnapshotToLeague({}, { locked: false }, {}).locked).toBe(false);
  });

  it("defaults to unlocked when the field is absent (pre-existing seasons)", () => {
    expect(applySnapshotToLeague({}, {}, {}).locked).toBe(false);
  });
});
