'use strict';

// routes/scores.js — legacy-compatible + GET/POST routes

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

/* ------------ helpers ------------ */
function jp() {
  return path.join(__dirname, '..', ...arguments);
}
function readJson(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fb; }
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

/* scoring helpers: 3 exact, 1 outcome */
function outcome(h, a) {
  if (h == null || a == null) return null;
  h = Number(h); a = Number(a);
  if (h > a) return 'H';
  if (h < a) return 'A';
  return 'D';
}
function pointsFor(ph, pa, rh, ra) {
  if ([ph, pa, rh, ra].some(v => v == null || v === '')) return 0;
  if (Number(ph) === Number(rh) && Number(pa) === Number(ra)) return 3;
  return outcome(ph, pa) === outcome(rh, ra) ? 1 : 0;
}

/* compute one week (returns legacy fields too) */
function computeWeek(week) {
  const fixturesPath = jp('data', 'fixtures', 'season-2025', 'week-' + week + '.json');
  const resultsPath  = jp('data', 'results',                'week-' + week + '.json');
  const predsPath    = jp('data', 'predictions',            'week-' + week + '.json');
  const playersPath  = jp('data', 'players.json');

  const fixtures = readJson(fixturesPath, []);
  const results  = readJson(resultsPath,  {});
  if (!results || Object.keys(results).length === 0) {
    return { ok: false, error: 'no_results', message: 'No results for week ' + week };
  }
  const predictions = readJson(predsPath, {});
  const playersArr  = readJson(playersPath, []);
  const nameById = new Map(playersArr.map(p => [String(p.id || p.player_id), p.name || '']));

  // scores
  const scores = [];
  for (const k of Object.keys(predictions)) {
    const entry = predictions[k] || {};
    const list = Array.isArray(entry.predictions) ? entry.predictions : [];
    let pts = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i] || {};
      const id = p.id || p.fixtureId || (fixtures[i] && fixtures[i].id);
      if (!id || !results[id]) continue;
      const r = results[id];
      pts += pointsFor(p.home, p.away, r.homeGoals, r.awayGoals);
    }
    scores.push({ player_id: String(k), name: nameById.get(String(k)) || '', points: pts });
  }
  scores.sort(function (a, b) {
    if (b.points !== a.points) return b.points - a.points;
    return String(a.name).localeCompare(String(b.name));
  });

  // legacy summary fields expected by Part_D_Scoring.html
  const totalFixtures = fixtures.length;
  let fixturesWithFT = 0;
  for (const f of fixtures) {
    const r = results[f.id];
    if (r && r.homeGoals != null && r.awayGoals != null) fixturesWithFT++;
  }
  let timestamp = new Date().toISOString();
  try { timestamp = fs.statSync(resultsPath).mtime.toISOString(); } catch (_) {}

  return {
    ok: true,
    week: Number(week),
    fixturesCount: totalFixtures,
    playerCount: scores.length,
    scores: scores,

    // primary field names
    fixturesWithFT: fixturesWithFT,
    totalFixtures: totalFixtures,
    timestamp: timestamp,

    // aliases so old UI code finds them
    fixtures_with_ft: fixturesWithFT,
    fixturesFT: fixturesWithFT,
    fixtures_done: fixturesWithFT,
    fixturesCompleted: fixturesWithFT,

    fixtures_total: totalFixtures,
    total_fixtures: totalFixtures
  };
}

/* persist this week's results and rebuild season totals idempotently */
function writeWeekAndRebuildTotals(week, weekScores) {
  const weekPath = jp('data', 'scores', 'weeks', 'week-' + week + '.json');
  writeJson(weekPath, weekScores);

  const weeksDir = jp('data', 'scores', 'weeks');
  fs.mkdirSync(weeksDir, { recursive: true });
  const files = fs.readdirSync(weeksDir).filter(function (f) { return /^week-\d+\.json$/i.test(f); });

  const totals = {}; // { player_id: { name, total, weeks_played } }
  for (const f of files) {
    const arr = readJson(path.join(weeksDir, f), []);
    for (const row of arr) {
      const id = String(row.player_id);
      if (!totals[id]) totals[id] = { name: row.name || '', total: 0, weeks_played: 0 };
      totals[id].name = row.name || totals[id].name;
      totals[id].total += Number(row.points || 0);
      totals[id].weeks_played += 1;
    }
  }
  writeJson(jp('data', 'scores', 'season-totals.json'), totals);
  return totals;
}

/* ------------ routes (new + legacy, GET + POST) ------------ */

// new: compute only
router.get('/', function (req, res) {
  const week = Number(req.query.week || 0);
  if (!week) return res.status(400).json({ ok: false, error: 'week_required' });
  const r = computeWeek(week); if (!r.ok) return res.status(400).json(r);
  res.json(r);
});

// new: compute + persist
router.get('/compute', function (req, res) {
  const week = Number(req.query.week || 0);
  if (!week) return res.status(400).json({ ok: false, error: 'week_required' });
  const r = computeWeek(week); if (!r.ok) return res.status(400).json(r);
  const totals = writeWeekAndRebuildTotals(week, r.scores);
  res.json(Object.assign({}, r, { season_totals: totals }));
});

// legacy GET
router.get('/summary', function (req, res) {
  const week = Number(req.query.week || 0);
  if (!week) return res.status(400).json({ ok: false, error: 'week_required' });
  const r = computeWeek(week); if (!r.ok) return res.status(400).json(r);
  res.json(r);
});
router.get('/calc', function (req, res) {
  const week = Number(req.query.week || 0);
  if (!week) return res.status(400).json({ ok: false, error: 'week_required' });
  const r = computeWeek(week); if (!r.ok) return res.status(400).json(r);
  const totals = writeWeekAndRebuildTotals(week, r.scores);
  res.json(Object.assign({}, r, { season_totals: totals }));
});

// legacy POST (same endpoints, accept week in body)
router.post('/summary', function (req, res) {
  const week = Number((req.body && req.body.week) || req.query.week || 0);
  if (!week) return res.status(400).json({ ok: false, error: 'week_required' });
  const r = computeWeek(week); if (!r.ok) return res.status(400).json(r);
  res.json(r);
});
router.post('/calc', function (req, res) {
  const week = Number((req.body && req.body.week) || req.query.week || 0);
  if (!week) return res.status(400).json({ ok: false, error: 'week_required' });
  const r = computeWeek(week); if (!r.ok) return res.status(400).json(r);
  const totals = writeWeekAndRebuildTotals(week, r.scores);
  res.json(Object.assign({}, r, { season_totals: totals }));
});

module.exports = router;
