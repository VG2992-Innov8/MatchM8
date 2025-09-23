// routes/results.js — tenant+competition–aware results read/write (safe merge)

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
router.use(express.json({ limit: '1mb' }));

/* ---------- helpers ---------- */
function toIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// normalize many shapes into { [matchId]: {home, away} }
function normaliseResults(obj) {
  const out = {};
  if (!obj) return out;

  // Array of rows?
  if (Array.isArray(obj)) {
    for (const r of obj) {
      if (!r) continue;
      const id = String(r.id ?? r.matchId ?? '').trim();
      if (!id) continue;
      const h = toIntOrNull(r.home ?? r.homeGoals ?? r.home_score);
      const a = toIntOrNull(r.away ?? r.awayGoals ?? r.away_score);
      if (h != null && a != null) out[id] = { home: h, away: a };
    }
    return out;
  }

  // If wrapped like { results: {...} }
  if (obj.results && typeof obj.results === 'object') {
    return normaliseResults(obj.results);
  }

  // Plain object map { id: {home, away} } or { id: [h,a] }
  if (typeof obj === 'object') {
    for (const [idRaw, v] of Object.entries(obj)) {
      const id = String(idRaw).trim();
      if (!id) continue;
      if (Array.isArray(v) && v.length >= 2) {
        const h = toIntOrNull(v[0]);
        const a = toIntOrNull(v[1]);
        if (h != null && a != null) out[id] = { home: h, away: a };
      } else if (v && typeof v === 'object') {
        const h = toIntOrNull(v.home ?? v.homeGoals ?? v.home_score);
        const a = toIntOrNull(v.away ?? v.awayGoals ?? v.away_score);
        if (h != null && a != null) out[id] = { home: h, away: a };
      }
    }
  }
  return out;
}

function cfgPath(req) {
  return path.join(req?.ctx?.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'config.json');
}
function readConfig(req) {
  try { return JSON.parse(fs.readFileSync(cfgPath(req), 'utf8')); }
  catch { return { season: 2025 }; }
}

function resultsFile(req, week) {
  const base = req?.ctx?.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  return path.join(base, 'results', `week-${week}.json`);
}

function readResults(req, week) {
  try {
    const p = resultsFile(req, week);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return {};
}

function safeWriteJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

/* ---------- GET /api/results?week=N ---------- */
router.get('/', (req, res) => {
  const week = Math.max(1, parseInt(req.query.week, 10) || 1);
  const raw = readResults(req, week);
  const norm = normaliseResults(raw);
  return res.json({ ok: true, week, results: norm });
});

/* ---------- POST /api/results/upsert?week=N ---------- */
/* Accepts:
 *  - array: [{id, home, away}, ...]
 *  - object map: { MATCHID: {home, away}, ... } or { MATCHID: [h, a], ... }
 *  - wrapped: { results: <either form above> }
 * Merges with existing file. Writes to the **competition-scoped** folder.
 */
router.post('/upsert', (req, res) => {
  const week = Math.max(1, parseInt(req.query.week, 10) || 1);
  const incoming = normaliseResults(req.body);
  if (!Object.keys(incoming).length) {
    return res.status(400).json({ ok: false, error: 'no valid results in body' });
  }

  const p = resultsFile(req, week);
  const current = normaliseResults(readResults(req, week)); // always normalized

  // merge shallowly by match id
  const merged = { ...current, ...incoming };

  safeWriteJson(p, merged);

  // echo back what’s on disk
  return res.json({
    ok: true,
    week,
    savedIds: Object.keys(incoming),
    totalIds: Object.keys(merged),
    file: p.replace(process.env.DATA_DIR || '', ''), // relative-ish for sanity
    results: merged
  });
});

module.exports = router;
