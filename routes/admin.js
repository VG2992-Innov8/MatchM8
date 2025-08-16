// routes/admin.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// ---------- utils ----------
function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}
function saveJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}
function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => String(v ?? '')
    .replace(/"/g, '""')
    .replace(/\r?\n/g, ' ');
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${esc(r[h])}"`).join(',')),
  ].join('\n');
}
function parseCsv(text) {
  // very small CSV parser for Admin import: header, comma, no quotes nesting
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',').map(s => s.trim());
  return lines.map(line => {
    const cols = line.split(',').map(s => s.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i]);
    return obj;
  });
}
function resultFromGoals(h, a) {
  if (h > a) return 'H';
  if (h < a) return 'A';
  return 'D';
}
function resultFromPick(pick) {
  // supports "H/D/A" or "2-1" style exact-score
  if (/^[HDA]$/.test(String(pick))) return pick;
  const m = String(pick).match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return null;
  const h = Number(m[1]), a = Number(m[2]);
  return resultFromGoals(h, a);
}

// ---------- config-ish ----------
const SEASON = String(process.env.SEASON || '2025');

// data paths
const playersPath = path.join(__dirname, '..', 'data', 'players.json');
const fixturesPath = (week) =>
  path.join(__dirname, '..', 'data', 'fixtures', `season-${SEASON}`, `week-${week}.json`);
const resultsPath = (week) =>
  path.join(__dirname, '..', 'data', 'results', `week-${week}.json`);
const predictionsPath = (week) =>
  path.join(__dirname, '..', 'data', 'predictions', `week-${week}.json`);
const totalsJsonPath = path.join(__dirname, '..', 'data', 'season_totals.json');
const totalsCsvPath  = path.join(__dirname, '..', 'data', 'season_scores.csv');

// ---------- middleware ----------
router.use(express.json({ limit: '1mb' }));
router.use(express.text({ type: ['text/*', 'text/csv'], limit: '1mb' }));

// ---------- 1) Import fixtures ----------
//
// POST /api/admin/fixtures/import?week=1
// Body (choose one):
//  - JSON: { fixtures: [{id, home, away, kickoff_iso}, ...] }
//  - text/csv: id,home,away,kickoff_iso\n1,Arsenal,Leeds,2025-08-20T19:00:00Z\n...
//
router.post('/fixtures/import', (req, res) => {
  const week = Number(req.query.week || req.body.week);
  if (!week) return res.status(400).json({ ok:false, error:'week required' });

  let fixtures = [];
  if (req.is('application/json')) {
    fixtures = Array.isArray(req.body?.fixtures) ? req.body.fixtures : [];
  } else if (req.is('text/*')) {
    const rows = parseCsv(String(req.body));
    fixtures = rows.map(r => ({
      id: r.id ?? r.fixture_id,
      home: r.home,
      away: r.away,
      kickoff_iso: r.kickoff_iso || r.kickoff || null,
    }));
  }

  if (!fixtures.length) return res.status(400).json({ ok:false, error:'no fixtures provided' });

  // normalize ids as strings
  fixtures = fixtures.map(f => ({
    id: String(f.id),
    home: f.home,
    away: f.away,
    kickoff_iso: f.kickoff_iso || null,
  }));

  saveJson(fixturesPath(week), fixtures);
  return res.json({ ok:true, saved: fixtures.length, week });
});

// ---------- 2) Enter results ----------
//
// POST /api/admin/results?week=1
// Body JSON (choose one):
//  a) { results: { "1": {homeGoals:2, awayGoals:1}, "2": {...} } }
//  b) { results: [ { id:"1", homeGoals:2, awayGoals:1 }, ... ] }
//
router.post('/results', (req, res) => {
  const week = Number(req.query.week || req.body.week);
  if (!week) return res.status(400).json({ ok:false, error:'week required' });

  let incoming = req.body?.results;
  if (!incoming) return res.status(400).json({ ok:false, error:'results required' });

  const map = {};
  if (Array.isArray(incoming)) {
    incoming.forEach(r => {
      if (!r) return;
      map[String(r.id)] = {
        homeGoals: Number(r.homeGoals),
        awayGoals: Number(r.awayGoals),
        result: resultFromGoals(Number(r.homeGoals), Number(r.awayGoals)),
      };
    });
  } else {
    Object.entries(incoming).forEach(([id, r]) => {
      map[String(id)] = {
        homeGoals: Number(r.homeGoals),
        awayGoals: Number(r.awayGoals),
        result: resultFromGoals(Number(r.homeGoals), Number(r.awayGoals)),
      };
    });
  }

  saveJson(resultsPath(week), map);
  return res.json({ ok:true, saved: Object.keys(map).length, week });
});

// ---------- 3) Compute scores (5/2/0) ----------
//
// POST /api/admin/scores/compute?week=1
// Reads predictions + results, writes/updates season_totals.json and season_scores.csv
//
router.post('/scores/compute', (req, res) => {
  const week = Number(req.query.week || req.body.week);
  if (!week) return res.status(400).json({ ok:false, error:'week required' });

  const players = loadJson(playersPath, []);
  const preds = loadJson(predictionsPath(week), {});
  const resMap = loadJson(resultsPath(week), {});

  // compute points per player for this week
  const weekly = {}; // { player_id: points }
  for (const [pid, rec] of Object.entries(preds)) {
    const picks = rec?.picks || {};
    let points = 0;

    for (const [fid, pick] of Object.entries(picks)) {
      const r = resMap[String(fid)];
      if (!r) continue; // no result yet
      const exactPick = String(pick).match(/^(\d+)\s*-\s*(\d+)$/);
      if (exactPick) {
        // exact score pick e.g. "2-1"
        const hp = Number(exactPick[1]);
        const ap = Number(exactPick[2]);
        if (hp === r.homeGoals && ap === r.awayGoals) {
          points += 5;
        } else {
          const pickRes = resultFromGoals(hp, ap);
          const realRes = resultFromGoals(r.homeGoals, r.awayGoals);
          if (pickRes === realRes) points += 2;
        }
      } else {
        // result only pick: H/D/A
        const pickRes = resultFromPick(pick);
        if (!pickRes) continue;
        const realRes = resultFromGoals(r.homeGoals, r.awayGoals);
        if (pickRes === realRes) points += 2;
      }
    }

    weekly[pid] = points;
  }

  // load/update season totals
  const totals = loadJson(totalsJsonPath, {}); // { player_id: { name, total, weeks: {1: pts, 2: pts, ...} } }
  for (const pl of players) {
    const id = String(pl.id);
    if (!totals[id]) totals[id] = { name: pl.name || `Player ${id}`, total: 0, weeks: {} };
    const wPts = weekly[id] || 0;
    totals[id].weeks[week] = wPts;
    // re-calc total to keep it honest
    totals[id].total = Object.values(totals[id].weeks).reduce((a,b)=>a+(b||0), 0);
  }
  saveJson(totalsJsonPath, totals);

  // write CSV (player_id,name,total,W1,W2,... up to current week seen)
  const allWeeks = new Set();
  Object.values(totals).forEach(t => Object.keys(t.weeks).forEach(w => allWeeks.add(Number(w))));
  const sortedWeeks = Array.from(allWeeks).sort((a,b)=>a-b);
  const rows = Object.entries(totals).map(([pid, t]) => {
    const row = { player_id: pid, name: t.name, total: t.total };
    sortedWeeks.forEach(w => row[`W${w}`] = t.weeks[w] ?? 0);
    return row;
  });
  fs.mkdirSync(path.dirname(totalsCsvPath), { recursive: true });
  fs.writeFileSync(totalsCsvPath, toCSV(rows), 'utf8');

  return res.json({
    ok: true,
    week,
    weekly_points: weekly,
    leaderboard: rows.sort((a,b)=>b.total - a.total),
    csv: path.relative(process.cwd(), totalsCsvPath)
  });
});

// ---------- 4) Quick preview ----------
//
// GET /api/admin/preview?week=1  -> { fixtures, results, predictions }
router.get('/preview', (req, res) => {
  const week = Number(req.query.week);
  if (!week) return res.status(400).json({ ok:false, error:'week required' });

  const fixtures = loadJson(fixturesPath(week), []);
  const results  = loadJson(resultsPath(week), {});
  const preds    = loadJson(predictionsPath(week), {});
  res.json({ ok:true, week, fixtures, results, predictions: preds });
});

module.exports = router;
