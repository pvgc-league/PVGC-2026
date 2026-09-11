# Season Rollover — Archive 2026, Set Up 2027

> **Status (2026-09-11):** Phase 0 complete. Phase 1 complete except §1.4
> (schedule), which is parked until March. Phase 2 not started.
> 2027 constants are scaffolded but deliberately NOT registered or active.

Handoff spec. Written after the 2026 season closed (Finals Sept 9, 2026).
Scope and policy decisions below are settled — don't re-litigate them, build to them.

---

## Settled decisions

| Question | Decision |
|---|---|
| How far to take it | **Phase 2 is the ceiling.** No season-config-in-Firestore refactor. |
| Which seasons browsable in-app | **2026 and every season after.** 2024/2025 stay as code + archive only, NOT selectable. |
| Next season's starting handicaps | **Captured from Week 18** (the Knockdown — last week all 18 teams play). |
| Roster churn for 2027 | **Minimal** — 1–2 new members. Carry the roster forward, don't rebuild it. |

### Why Phase 2 is the ceiling

Season config (`TEAMS`, `SCHEDULE`, `PAR`/`SI`, `ALL_PLAYERS`) is imported as
**module-level constants** across 25 files — 174 `TEAMS` references alone. Moving
them to Firestore makes them async state and forces a context refactor through
~450 reference sites. Not worth it. Structure stays in code; only loosely-coupled,
yearly-churn data moves to Firestore.

---

## Phase 0 — Archive 2026

### 0.1 Durable export — ✅ DONE (`archives/league-2026.json`, 155 matches)
`scripts/archive-season.cjs <year>` → writes `archives/league-<year>.json` containing
the league doc plus the `weekScores` and `confirmedScores` subcollections. Commit it.

> **Do not rely on the `snapshots` subcollection as the archive.** It auto-prunes —
> [`App.jsx:420`](../src/App.jsx#L420) deletes excess snapshots on a cap. It's an
> in-season undo buffer, not a durable record.

### 0.2 Season-level lock — ✅ DONE (7 write paths, `isLeagueWriteBlocked` + tests)
Add `league.locked` (bool). Enforce **centrally** in `saveLeague`
([`App.jsx:225`](../src/App.jsx#L225)) and `saveMatchDoc`
([`App.jsx:253`](../src/App.jsx#L253)) — reject writes when set.

Do NOT do this per-screen. The existing `readOnlyWeeks` is only honored in
[`EntryTab.jsx:20`](../src/components/EntryTab.jsx#L20), so it's a weak lock that
other write paths ignore. The season lock must not repeat that mistake.

Persist `locked` in all **three** spots (established pattern — see `recapEnabled`):
1. `saveLeague` write object ([`App.jsx:225`](../src/App.jsx#L225))
2. `LEAGUE_DOC.onSnapshot` handler ([`App.jsx:180`](../src/App.jsx#L180))
3. `applySnapshotToLeague` ([`src/lib/persistence.js`](../src/lib/persistence.js))

### 0.3 Make the season selector real — ⚠️ PARTIALLY DONE

Done: the `ACTIVE` ternary chain is replaced by a `SEASONS` registry, and 2024/2025
are removed entirely (their spreadsheets carried manual adjustments the app could
never reproduce).

**Changed from the original plan:** registering a season no longer activates it.
`CURRENT_SEASON` was briefly derived as the highest registered year, which meant
adding 2027 would have made it everyone's default *before it had a schedule* —
breaking the app for the whole league. It's now an explicit constant.

Remaining, once the 2027 schedule exists:
1. Add `2027: L2027` to `SEASONS`
2. Bump `CURRENT_SEASON` to 2027

### 0.4 Dead-code cleanup — ✅ DONE (−70 KB bundle)
Board (`masters`), Predict, and Pulse were pulled from the nav but their code and
render blocks still ship. The season is over — delete them: the components, the
imports, the `screen===` blocks ([`App.jsx:906`](../src/App.jsx#L906), 999, 1003),
and their `TAB_LABEL` entries. Also remove the admin Weekly Points table.

---

## Phase 1 — Season setup tooling

### 1.1 Handicap capture — ✅ DONE (`npm run capture-hcp -- 2026`)
`scripts/capture-handicaps.cjs <fromYear>` → emits a `DEFAULT_HCP` block for the
next season.

**Critical:** capture through **Week 18**, which means calling with `week = 19`:

```js
getEffectiveHcp(tid, pi, 19, league.results, league.handicaps,
                league.hcpOverrides, league.cancelledWeeks)
```

`buildGrossHistory` loops `for (w = 1; w < upToWeek; w++)`
([`leagueLogic.js:609`](../src/lib/leagueLogic.js#L609)), so `19` includes weeks 1–18
and excludes the playoffs.

**This is deliberate, not an off-by-one.** Playoff weeks 19–21 involve only 8 teams.
Capturing at week 22 would advance those 8 players' handicaps while leaving the other
28 stale — an unfair and silently-wrong starting field. Week 18 is the last week all
18 teams play. Put that reasoning in a code comment; it will look like a bug otherwise.

Output shape must match `DEFAULT_HCP`: `{ [tid]: [p1hcp, p2hcp] }`.

### 1.2 Single source of truth for starting handicaps — ✅ DONE
[`scripts/push2026.cjs`](../scripts/push2026.cjs#L28) and
[`league_2026.js`](../src/constants/league_2026.js) each hold a hand-maintained
`DEFAULT_HCP`, and **8 players across 6 teams disagree**.

**Verdict (already investigated — don't redo this):**
`league_2026.js` is correct. Live Firestore matches it on all 8 disputed players and
never matches the push script. Git history explains it — `push2026.cjs` has a single
commit (2026-03-27) and was never updated, while `league_2026.js` was corrected twice
afterward on 2026-04-13 ("Update starting handicaps from official sheet" and "Fix
Chris Nelson handicap to 3").

| T | Player | league_2026.js / live | push2026.cjs (stale) |
|---|---|---|---|
| 1 | Brian Charles | 5 | 6 |
| 1 | Karl Dagg | 4 | 6 |
| 5 | Tracy Schantz | 8 | 6 |
| 6 | Scott Glascott | 13 | 3 |
| 9 | Barry Wzorek | 11 | 0 |
| 10 | Tom Mulvey | 5 | 7 |
| 10 | Chris Nelson | 3 | 4 |
| 15 | JC Olivos | 10 | 8 |

> Separately, Mark Adler (T6 p2) is `0` in both files but `8` live. That is **correct,
> not drift** — he's the `NEW_MEMBERS: {"6-1": true}` entry, unassessed at season start.

**Why this matters beyond tidiness:** the push script does
`DOC.set({handicaps: DEFAULT_HCP}, {merge:true})`, and Firestore values override the
code defaults (`{...DEFAULT_HCP, ...p.handicaps}`). Re-running it today would clobber
8 players' starting handicaps with March values and they'd win. Starting handicap
feeds the `startHcp + HCP_CAP` ceiling, so a bad seed silently distorts a player's cap
for the whole season.

**Fix:** the push script must **import** `DEFAULT_HCP` from the constants file, never
redeclare it. Delete the stale literal as part of this.

### 1.3 Scaffold the new season — ✅ DONE (`npm run new-season -- 2027`)
`scripts/new-season.cjs 2027`:
- Copy `TEAMS` forward from 2026 (churn is minimal — carry, then hand-edit 1–2 slots)
- Insert captured `DEFAULT_HCP` from 1.1
- Carry `PAR`/`SI`/`RAINOUT_SUB` and the handicap constants
- Leave `SCHEDULE_RAW` and `NEW_MEMBERS` as marked TODO stubs
- Seed the `pvgc/league-2027` Firestore doc with the starting handicaps

Follows the existing `import20XX.py` / `push20XX.cjs` precedent.

### 1.4 Schedule — PARKED until March

**Timing, from the 2026 season's own history:** `SCHEDULE_RAW` first landed
**Mar 18**, was refined through **Apr 10**, and opening day was **Apr 15**. Starting
handicaps followed the same curve — drafted Mar 27, corrected from the official
sheet Apr 13. So roughly four weeks of lead time, finalised about a week out.

Order matters: **roster → handicaps → schedule.** You can't pair teams that don't
exist yet, and re-pairing teams invalidates a captured handicap set.

#### The tee-time accommodation is being silently dropped

A few teams need **later start times for work schedules**. The commissioner already
handles this in the spreadsheet by ordering each week's matchups so those teams fall
late — but **only the pairings are copied into `SCHEDULE_RAW`, not the ordering**, so
the accommodation never reaches the app.

This is load-bearing because tee times are assigned **by position**:
`getTeeTimes(week)[i]` maps to `pairs[i]`. The order of the 9 pairs in a week *is*
the tee sheet.

Measured across 2026's 17 regular-season weeks (slot 0 = 4:10 PM, 8 = 5:30 PM):

| Team | avg slot | weeks at 5:10+ |
|---|---|---|
| Charles - Dagg | 5.29 | 9/17 |
| Jurden - Olivos | 5.06 | 9/17 |
| *(middle 14)* | ~3.5–4.6 | 4–7/17 |
| Pineno - MacKenzie | 3.41 | 4/17 |
| Posey - Minasian | 3.41 | 4/17 |

A flat 3.41–5.29 spread — close to random, no team consistently late.
`TEE_TIME_OVERRIDES` was also empty for 2026 apart from the Week 19 quarterfinals.
So the app has never reflected the accommodation.

**In March:** get the *ordered* weeks out of the spreadsheet, not just the pairings.
Deliberately not tooled ahead of time — decide then whether that means a generator
that takes late-start preferences as input, or just carefully preserving the
spreadsheet's ordering on the way in.

## Phase 2 — Admin screens

**Put these in a new `SeasonAdminScreen`, not in `AdminScreen.jsx`.** That file is
already 1,577 lines with ~15 accordion sections and is past comfortable.

### 2.1 Champions editor
Move the list out of [`src/constants/champions.js`](../src/constants/champions.js)
so recording a winner doesn't need a deploy.

> **Storage gotcha:** champions data is **cross-season**. It must NOT go in the
> per-season `league-<year>` doc or it vanishes when you switch seasons. Put it in a
> season-independent doc — `pvgc/meta` — and read it regardless of `SEASON_YEAR`.

Seed from the existing constant. Keep `winsFor` / `winYearsFor` surname-matching
semantics intact — [`PlayerScreen.jsx`](../src/components/PlayerScreen.jsx) depends
on them for the 🏆 badges.

### 2.2 Tee-time editor
Replaces hand-editing `TEE_TIME_OVERRIDES` (done 3× in two weeks — clear signal).

Store as `league.teeTimes[week]`. Pattern: `league.teeTimes?.[week] ?? getTeeTimes(week)`,
so code stays the fallback and nothing breaks if Firestore is empty.

**Cost to know up front:** 6 component call sites are easy, but
[`leagueLogic.js:801`](../src/lib/leagueLogic.js#L801) and
[`:975`](../src/lib/leagueLogic.js#L975) call `getTeeTimes` inside pure functions
(`buildWeekRecap` and the next-week preview) that have no `league` access. Those need
an optional override parameter threaded in. Contained, but not free.

### 2.3 Season lifecycle panel
- Lock / unlock the current season (0.2)
- Show archive status
- "Capture Week 18 handicaps" → renders the `DEFAULT_HCP` block to copy into the new
  constants file (roster stays in code, so this is copy-out, not direct write)

---

## Explicitly out of scope

- Roster/schedule editing from Firestore (the Phase 3 context refactor)
- Making 2024/2025 browsable in-app. They keep their constants files and get JSON
  archives, but stay out of `AVAILABLE_SEASONS`. This deliberately avoids auditing
  the legacy quirks — e.g. the `SEASON_YEAR === 2024` special case in
  [`HandicapScreen.jsx:241`](../src/components/HandicapScreen.jsx#L241) and 2024's
  different team numbering.

---

## Verify before declaring done

1. **Confirm the 2026 champion.** `champions.js` currently has 2026 =
   Carickhoff/Schantz, entered from the commissioner's word before the Finals were
   played. Check it against the actual Week 21 result and correct if needed.
2. `npx vite build` clean.
3. Archive round-trip: export `league-2026`, confirm the JSON has all 21 weeks of
   scores and the final standings.
4. Lock test: set `locked`, then attempt a score save from Scoring **and** Entry —
   both must be rejected (this is what catches a repeat of the `readOnlyWeeks`
   per-screen mistake).
5. Handicap capture: spot-check 3 players against their Week 18 effective handicap in
   the HCP tab — the numbers must match exactly.
6. Season switch: toggle 2026 ↔ 2027 and confirm the Champions page still renders
   (proves 2.1's cross-season storage is right).
