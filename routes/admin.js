// routes/admin.js — cleaned & secured
const express = require('express');
const path = require('path');
const fs = require('fs');              // sync FS
const fsp = require('fs/promises');    // async FS
const bcrypt = require('bcryptjs');
const { writeJsonAtomic } = require('../utils/atomicJson');

const router = express.Router();
router.use(express.json()); // parse JSON bodies for all routes in this file

/* ===== ADMIN TOKEN GUARD (header-only) ===== */
function cleanToken(s = '') {
  return String(s)
    .replace(/\r/g, '')
    .replace(/\s+#.*$/, '')
    .replace(/^\s*['"]|['"]\s*$/g, '')
    .trim();
}
const ADMIN_TOKEN = cleanToken(process.env.ADMIN_TOKEN || '');
router.use((req, res, next) => {
  if (!ADMIN_TOKEN) return next(); // dev mode if unset
  const t = cleanToken(req.get('x-admin-token') || '');
  if (t === ADMIN_TOKEN) return next();
  return res.status(401).json({ ok: false, error: 'unauthorized' });
});

/* ---------- paths & helpers ---------- */
const DATA_DIR = path.join(__dirname, '..', 'data');
const PLAYERS_PATH = path.join(DATA_DIR, 'players.json');

async function loadPlayers() {
  try { return JSON.parse(await fsp.readFile(PLAYERS_PATH, 'utf8')); }
  catch { return []; }
}
async function savePlayers(players) { await writeJsonAtomic(PLAYERS_PATH, players); }

function readJsonSync(p, fb = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fb; }
}
function writeJsonSync(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
  return [headers.join(','), ...rows.map(r => headers.map(h => `"${esc(r[h])}"`).join(','))].join('\n');
}

/* ---------- robust CSV parser ---------- */
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
      else { field += c; }
    }
  }
  row.push(field); rows.push(row);
  const headers = (rows.shift() || []).map(h => h.trim());
  const out = [];
  for (const r of rows) {
    if (r.every(v => (v === '' || v == null))) continue;
    const obj = {}; headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    out.push(obj);
  }
  return out;
}

/* ---------- Players (safe list + admin reset) ---------- */
router.get('/players', async (_req, res) => {
  try {
    const players = await loadPlayers();
    res.json(players.map(p => ({ id: p.id, name: p.name, email: p.email || null, has_pin: !!p.pin_hash })));
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

router.post('/players/pin/reset', async (req, res) => {
  try {
    const { player_id, name, new_pin } = req.body || {};
    if (!new_pin || String(new_pin).length < 4) return res.status(400).json({ error: 'PIN must be >= 4 digits' });
    const players = await loadPlayers();
    const idx = players.findIndex(p =>
      (player_id && String(p.id) === String(player_id)) || (name && p.name === name)
    );
    if (idx < 0) return res.status(404).json({ error: 'player_not_found' });
    players[idx].pin_hash = await bcrypt.hash(String(new_pin), 10);
    delete players[idx].pin;
    players[idx].pin_updated_at = new Date().toISOString();
    await savePlayers(players);
    res.json({ ok: true, id: players[idx].id, name: players[idx].name });
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/* ---------- 1) Import fixtures ---------- */
router.post('/fixtures/import', (req, res) => {
  try {
    const { week, fixtures } = req.body || {};
    if (!week || !Array.isArray(fixtures)) return res.status(400).json({ ok: false, error: 'week and fixtures[] required' });
    const fixturesPath = path.join(DATA_DIR, 'fixtures', 'season-2025', `week-${week}.json`);
    fs.mkdirSync(path.dirname(fixturesPath), { recursive: true });
    fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2), 'utf8');
    return res.json({ ok: true, saved: fixtures.length });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

/* ---------- 2) Save results ---------- */
router.post('/results', (req, res) => {
  try {
    const { week, results } = req.body || {};
    if (!week || typeof results !== 'object') return res.status(400).json({ ok: false, error: 'week and results{} required' });
    const p = path.join(DATA_DIR, 'results', `week-${week}.json`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(results, null, 2), 'utf8');
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

/* ---------- 3) Get results ---------- */
router.get('/results', (req, res) => {
  try {
    const { week } = req.query;
    if (!week) return res.status(400).json({ ok: false, error: 'week required' });
    const p = path.join(DATA_DIR, 'results', `week-${week}.json`);
    const obj = readJsonSync(p, {});
    return res.json({ ok: true, results: obj });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

/* ---------- 4) Upload predictions CSV ---------- */
router.post('/predictions/upload', (req, res) => {
  try {
    const { week, csv } = req.body || {};
    if (!week || !csv) return res.status(400).json({ ok: false, error: 'week and csv required' });

    const rows = parseCsv(csv);
    const outPath = path.join(DATA_DIR, 'predictions', `week-${week}.json`);
    const map = {};

    for (const r of rows) {
      const id = r.player_id || r.id || r.playerId;
      if (!id) continue;
      let list = [];
      try { list = r.predictions ? JSON.parse(r.predictions) : []; }
      catch (e) { return res.status(400).json({ ok: false, error: `bad_predictions_json for player_id=${id}: ${e.message}` }); }

      map[id] = {
        predictions: Array.isArray(list) ? list : [],
        submitted_at: r.submitted_at || new Date().toISOString(),
        email_sent_at: r.email_sent_at || null
      };
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(map, null, 2), 'utf8');
    return res.json({ ok: true, imported: Object.keys(map).length });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

/* ---------- 5) Download predictions CSV ---------- */
router.get('/predictions/download', (req, res) => {
  try {
    const { week } = req.query;
    if (!week) return res.status(400).json({ ok: false, error: 'week required' });

    const p = path.join(DATA_DIR, 'predictions', `week-${week}.json`);
    const data = readJsonSync(p, {});
    const rows = [];

    for (const [player_id, val] of Object.entries(data)) {
      rows.push({
        player_id,
        predictions: JSON.stringify(val.predictions || []),
        submitted_at: val.submitted_at || '',
        email_sent_at: val.email_sent_at || ''
      });
    }

    const csv = toCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="predictions-week-${week}.csv"`);
    return res.send(csv);
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

/* ---------- 6) Upload scores CSV ---------- */
router.post('/scores/upload', (req, res) => {
  try {
    const { csv } = req.body || {};
    if (!csv) return res.status(400).json({ ok: false, error: 'csv required' });

    const rows = parseCsv(csv);
    const outPath = path.join(DATA_DIR, 'scores', `season-totals.json`);
    const map = {};

    for (const r of rows) {
      const id = r.player_id || r.id || r.playerId;
      if (!id) continue;
      map[id] = {
        name: r.name || '',
        total: Number(r.total || 0),
        weeks_played: Number(r.weeks_played || 0),
      };
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(map, null, 2), 'utf8');
    return res.json({ ok: true, imported: Object.keys(map).length });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

/* ---------- 7) Download scores CSV ---------- */
router.get('/scores/download', (_req, res) => {
  try {
    const p = path.join(DATA_DIR, 'scores', `season-totals.json`);
    const data = readJsonSync(p, {});
    const rows = [];

    for (const [player_id, val] of Object.entries(data)) {
      rows.push({
        player_id,
        name: val.name || '',
        total: Number(val.total || 0),
        weeks_played: Number(val.weeks_played || 0),
      });
    }

    const csv = toCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="season-totals.csv"');
    return res.send(csv);
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

/* ---------- 8) Players export/import ---------- */
router.get('/players/download', async (_req, res) => {
  try {
    const arr = await loadPlayers();
    const rows = arr.map(pl => ({
      id: pl.id, name: pl.name || '', email: pl.email || '', has_pin: !!pl.pin_hash, pin_updated_at: pl.pin_updated_at || ''
    })); // do NOT export PINs
    const csv = toCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="players.csv"');
    return res.send(csv);
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/players/upload', async (req, res) => {
  try {
    const { csv } = req.body || {};
    if (!csv) return res.status(400).json({ ok: false, error: 'csv required' });
    const rows = parseCsv(csv);

    const out = [];
    for (const r of rows) {
      const rec = { id: r.id, name: r.name || '', email: r.email || '' };
      if (r.pin && String(r.pin).length >= 4) {
        rec.pin_hash = await bcrypt.hash(String(r.pin), 10);
      }
      out.push(rec);
    }

    await writeJsonAtomic(PLAYERS_PATH, out);
    return res.json({ ok: true, imported: out.length, hashed: out.filter(p => p.pin_hash).length });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

/* ---------- 9) Admin health ---------- */
router.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

/* ---------- 10) Delete week data ---------- */
router.post('/wipe/week', (req, res) => {
  try {
    const { week } = req.body || {};
    if (!week) return res.status(400).json({ ok: false, error: 'week required' });
    const preds = path.join(DATA_DIR, 'predictions', `week-${week}.json`);
    const results = path.join(DATA_DIR, 'results', `week-${week}.json`);
    if (fs.existsSync(preds)) fs.unlinkSync(preds);
    if (fs.existsSync(results)) fs.unlinkSync(results);
    return res.json({ ok: true, week });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
