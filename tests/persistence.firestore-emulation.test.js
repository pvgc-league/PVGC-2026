import { describe, it, expect } from "vitest";
import { DEFAULT_HCP } from "../src/constants/league.js";
import { initLeague } from "../src/lib/leagueLogic.js";
import {
  encodeResults,
  decodeResults,
  applySnapshotToLeague,
} from "../src/lib/persistence.js";
import { loadArchiveFixture } from "./helpers/archiveFixture.js";

class InMemoryLeagueDoc {
  constructor() {
    this.payload = null;
    this.listeners = [];
  }

  async get() {
    return {
      exists: !!this.payload,
      data: () => this.payload,
    };
  }

  async set(next, opts = {}) {
    if (opts.merge && this.payload) {
      this.payload = {
        ...this.payload,
        ...next,
        results: {
          ...(this.payload.results || {}),
          ...(next.results || {}),
        },
      };
    } else {
      this.payload = next;
    }

    const snap = {
      exists: true,
      data: () => this.payload,
    };
    this.listeners.forEach((fn) => fn(snap));
  }

  onSnapshot(onNext) {
    this.listeners.push(onNext);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== onNext);
    };
  }
}

describe("Firestore persistence emulation", () => {
  it("encodes and decodes match results losslessly", () => {
    const { league } = loadArchiveFixture(2);
    const encoded = encodeResults(league.results);
    const decoded = decodeResults(encoded);

    expect(Object.keys(encoded[1]).length).toBeGreaterThan(0);
    expect(decoded).toEqual(league.results);
  });

  it("preserves prior weeks across merge saves and snapshot reloads", async () => {
    const { league } = loadArchiveFixture(2);
    const doc = new InMemoryLeagueDoc();

    const week1State = {
      handicaps: league.handicaps,
      results: { 1: league.results[1] },
      hcpOverrides: {},
    };

    await doc.set(
      {
        handicaps: week1State.handicaps,
        results: encodeResults(week1State.results),
        hcpOverrides: week1State.hcpOverrides,
      },
      { merge: true }
    );

    await doc.set(
      {
        handicaps: league.handicaps,
        results: encodeResults({ 2: league.results[2] }),
        hcpOverrides: {},
      },
      { merge: true }
    );

    const snap = await doc.get();
    const hydrated = applySnapshotToLeague(initLeague(), snap.data(), DEFAULT_HCP);

    expect(Object.keys(hydrated.results[1] || {}).length).toBeGreaterThan(0);
    expect(Object.keys(hydrated.results[2] || {}).length).toBeGreaterThan(0);
    expect(hydrated.results[1]).toEqual(league.results[1]);
    expect(hydrated.results[2]).toEqual(league.results[2]);
  });

  it("emits snapshot listeners with merged payload", async () => {
    const { league } = loadArchiveFixture(1);
    const doc = new InMemoryLeagueDoc();

    let observed = null;
    const unsubscribe = doc.onSnapshot((snap) => {
      observed = applySnapshotToLeague(initLeague(), snap.data(), DEFAULT_HCP);
    });

    await doc.set(
      {
        handicaps: league.handicaps,
        results: encodeResults({ 1: league.results[1] }),
        hcpOverrides: {},
      },
      { merge: true }
    );

    unsubscribe();

    expect(observed).toBeTruthy();
    expect(observed.handicaps[1]).toEqual(league.handicaps[1]);
    expect(observed.results[1]).toEqual(league.results[1]);
  });
});
