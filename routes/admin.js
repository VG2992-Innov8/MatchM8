// routes/admin.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// ---------- helpers ----------
function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}
function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
  return [headers.join(','), ...rows.map(r => headers.map(h => `"${esc(r[h])}"`).join(','))].join('\n');
}
function parseCsv(text) {
  // lightweight CSV: comma-separated, simple quotes; good enough for admin imports
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',').map(s => s.trim());
  return lines.filter(Boolean).map(line => {
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
  if (/^[HDA]$/.test(String(pick))) return pick;
  const m = String(pick).match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return null;
  const h = Number(m[1]), a = Number(m[2]);
  return resultFromGoals(h, a);
}

// ---------- config & paths ----------
const SEASON = String(process.env.SEASON || '2025');

const playersPath   = path.join(__dirname, '..', 'data', 'players.json');
const fixturesPath  = (week) => path.join(__dirname, '..', 'data', 'fixtures', `season-${SEASON}`, `week-${week}.json`);
const resultsPath   = (week) => path.join(__dirname, '..', 'data', 'results',  `week-${week}.json`);
const predsPath     = (week) => path.join(__dirname, '..', 'data', 'predictions', `week-${week}.json`);
const totalsJson    = path.join(__dirname, '..', 'data', 'season_totals.json');
const totalsCsv     = path.join(__dirname, '..', 'data', 'season_scores.csv');

// ---------- body parsers (local to this router) ----------
router.use(express.json({ limit: '1mb' }));
router.use(express.text({ type: ['text/*', 'text/csv'], limit: '1mb' }));

// ---------- 1) Import fixtures ----------
// POST /api/admin/fixtures/import?week=1
// Body: either { fixtures:[{id,home,away,kickoff_iso}, ...] } (JSON)
//   or raw CSV text with headers: id,home,away,kickoff_iso
router.post('/fixtures/import', (req, res) => {
  const week = Number(req.query.week || req.body.week);
  if (!week) return res.status(400).json({ ok:false, error:'week required' });

  let fixtures = [];
  if (req.is('application/json')) {
    fixtures = Array.isArray(req.body?.fixtures) ? req.body.fixtures
             : (Array.isArray(req.body) ? req.body : []);
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

  fixtures = fixtures.map((f, i) => ({
    id: String(f.id ?? `${week}-${i+1}`),
    home: f.home,
    away: f.away,
    kickoff_iso: f.kickoff_iso || null,
  }));

  writeJson(fixturesPath(week), fixtures);
  return res.json({ ok:true, saved: fixtures.length, week });
});

// ---------- 2) Save results ----------
// POST /api/admin/results?week=1
// Body JSON:
//   { results: { "1": {homeGoals:2, awayGoals:1}, ... } }
//   or { results: [ {id:"1", homeGoals:2, awayGoals:1}, ... ] }
router.post('/results', (req, res) => {
  const week = Number(req.query.week || req.body.week);
  if (!week) return res.status(400).json({ ok:false, error:'week required' });

  const incoming = req.body?.results;
  if (!incoming) return res.status(400).json({ ok:false, error:'results required' });

  const map = {};
  if (Array.isArray(incoming)) {
    incoming.forEach(r => {
      if (!r) return;
      const hg = Number(r.homeGoals), ag = Number(r.awayGoals);
      map[String(r.id)] = { homeGoals: hg, awayGoals: ag, result: resultFromGoals(hg, ag) };
    });
  } else {
    Object.entries(incoming).forEach(([id, r]) => {
      const hg = Number(r.homeGoals), ag = Number(r.awayGoals);
      map[String(id)] = { homeGoals: hg, awayGoals: ag, result: resultFromGoals(hg, ag) };
    });
  }

  writeJson(resultsPath(week), map);
  return res.json({ ok:true, saved: Object.keys(map).length, week });
});

// ---------- 3) Compute scores (5/2/0) ----------
// POST /api/admin/scores/compute?week=1
router.post('/scores/compute', (req, res) => {
  const week = Number(req.query.week || req.body.week);
  if (!week) return res.status(400).json({ ok:false, error:'week required' });

  const players = readJson(playersPath, []);
  const preds   = readJson(predsPath(week), {});
  const results = readJson(resultsPath(week), {});

  // per-player points this week
  const weekly = {};
  for (const [pid, rec] of Object.entries(preds)) {
    const picks = rec?.picks || {};
    let pts = 0;

    for (const [fid, pick] of Object.entries(picks)) {
      const r = results[String(fid)];
      if (!r) continue;
      const exact = String(pick).match(/^(\d+)\s*-\s*(\d+)$/);
      if (exact) {
        const hp = Number(exact[1]), ap = Number(exact[2]);
        if (hp === r.homeGoals && ap === r.awayGoals) {
          pts += 5;
        } else if (resultFromGoals(hp, ap) === resultFromGoals(r.homeGoals, r.awayGoals)) {
          pts += 2;
        }
      } else if (resultFromPick(pick) === resultFromGoals(r.homeGoals, r.awayGoals)) {
        pts += 2;
      }
    }
    weekly[pid] = pts;
  }

  // update season totals
  const totals = readJson(totalsJson, {});
  for (const pl of players) {
    const id = String(pl.id);
    if (!totals[id]) totals[id] = { name: pl.name || `Player ${id}`, total: 0, weeks: {} };
    totals[id].weeks[week] = weekly[id] || 0;
    totals[id].total = Object.values(totals[id].weeks).reduce((a,b)=>a+(b||0), 0);
  }
  writeJson(totalsJson, totals);

  // write CSV leaderboard
  const weekSet = new Set();
  Object.values(totals).forEach(t => Object.keys(t.weeks).forEach(w => weekSet.add(Number(w))));
  const cols = Array.from(weekSet).sort((a,b)=>a-b);
  const rows = Object.entries(totals).map(([pid, t]) => {
    const r = { player_id: pid, name: t.name, total: t.total };
    cols.forEach(w => r[`W${w}`] = t.weeks[w] ?? 0);
    return r;
  });
  fs.mkdirSync(path.dirname(totalsCsv), { recursive: true });
  fs.writeFileSync(totalsCsv, toCSV(rows), 'utf8');

  return res.json({
    ok: true,
    week,
    weekly_points: weekly,
    leaderboard: rows.sort((a,b)=>b.total - a.total),
    csv: path.relative(process.cwd(), totalsCsv),
  });
});

// ---------- 4) Preview ----------
// GET /api/admin/preview?week=1
router.get('/preview', (req, res) => {
  const week = Number(req.query.week);
  if (!week) return res.status(400).json({ ok:false, error:'week required' });
  const fixtures = readJson(fixturesPath(week), []);
  const results  = readJson(resultsPath(week), {});
  const preds    = readJson(predsPath(week), {});
  res.json({ ok:true, week, fixtures, results, predictions: preds });
});

module.exports = router;
