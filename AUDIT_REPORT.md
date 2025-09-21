# MatchM8 Live Audit — Fixes Applied

## What I changed

1) **Finals auto-routing (server)**
   - `Soccer/index.js`: now supports *both* finals config shapes:
     - New: `{ finals: { autoRoute, regularCompetition, targetCompetition, startWeek } }`
     - Legacy: `{ finals: { enabled, from, to, trigger } }`
   - If `startWeek` is missing, it auto-detects from regular comp:
     - Uses `competitions/<REGULAR>/config.json: total_weeks + 1`, or
     - Scans `fixtures/season-<YEAR>/week-*.json` and uses `maxWeek + 1`.
   - When you call any endpoint with `?week=N`, the server routes to:
     - **Regular** if `N < startWeek`
     - **Finals** if `N >= startWeek`
   - This removes the need to manually add `&c=` in URLs.

2) **Finals auto-flip of defaultCompetition (optional)**
   - Added a `postSeason` block to **Regular** rules at:
     `data/tenants/Basketball/competitions/NBL-2025/scores/rules.json`
   - After you run `/api/scores/compute?week=<LAST_REGULAR_WEEK>`, it will:
     - Save `scores/champion.json` for the regular season, and
     - Flip tenant `defaultCompetition` to `"NBL-2025-Finals"` *once*.
   - This uses existing logic in `routes/scores.js` (`maybeHandlePostSeason`).

3) **Scoring sanity (basketball_close)**
   - Verified `routes/scores.js` includes `basketball_close`:
     - Per-team points: exact / within5 / within10.
     - Optional winner bonus (your rules set `winnerPoints: 0`).
   - Sample Week 1 (from your data) gives:
     - `alice: 20`, `charlie: 25`, `bob: 20`, `evan: 25`, `dana: 10`

## Why results “disappeared” before

- Requests without `&c=` were landing in the *wrong competition* (Finals) because the server didn’t know when to route Regular vs Finals.
- With the new `index.js`, the server chooses the competition by week consistently.

## How to verify live (copy/paste these URLs)

- Week 1 should be **Regular**:
  - `/api/__meta?t=Basketball&week=1` → `"competition":"NBL-2025"`
- Week 11 should be **Finals** (since regular has 10 weeks):
  - `/api/__meta?t=Basketball&week=11` → `"competition":"NBL-2025-Finals"`

**Admin / UI (no &c needed now):**
- Admin Week 1: `/ui/admin.html?t=Basketball&week=1`
- Predictions Week 1: `/Part_B_Predictions.html?t=Basketball&week=1`
- Compute Week 1: `/api/scores/compute?t=Basketball&week=1`

You can still force a comp with `&c=...` if you want, but you shouldn’t need to.

## One-time gotcha
If your browser previously stored a `c` (competition) in `localStorage`, `public/js/tenant.js` will auto-append it and “stick” you on the wrong comp. If the UI still looks odd, clear `localStorage` for your site or click a link without `c=` (the server now echoes its chosen comp back into the query).

## Files changed
- `Soccer/index.js` (server routing)
- `data/tenants/Basketball/competitions/NBL-2025/scores/rules.json` (added postSeason block)

Nothing else was touched.

## Deploy
1. Replace your server `index.js` with the one in this zip.
2. Deploy.
3. Hit the two meta URLs above to confirm routing by week.
4. Enter Week 1 results, then compute → they’ll appear on the predictions & tables.

If you want me to also convert your *tenant* config to the new `{ finals: { autoRoute, ... } }` shape, I can do that too — not required now because the server understands both.