// routes/admin.js — cleaned, secured, and tenant-aware Players CRUD

const { readJSON, writeJSON } = require('../lib/storage');

const express = require('express');
const router = express.Router();

const path = require('path');
const fs = require('fs');                 // sync FS
const fsp = require('fs/promises');       // async FS
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { DATA_DIR } = require('../lib/paths');            // still used for fixtures/results/etc
let { writeJsonAtomic } = require('../utils/atomicJson'); // optional helper
if (typeof writeJsonAtomic !== 'function') {
  // safe fallback if utils/atomicJson is absent
  writeJsonAtomic = async (p, obj) => fsp.writeFile(p, JSON.stringify(obj, null, 2));
}

const APP_MODE = process.env.APP_MODE || 'demo';
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();

router.use(express.json()); // parse JSON bodies for all routes in this file

/* ---------- timing-safe token compare ---------- */
function safeEqual(a = '', b = '') {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/* ---------- single ADMIN TOKEN guard (header: x-admin-token) ---------- */
/* In DEMO, allow through when no ADMIN_TOKEN is configured; in PROD, block. */
router.use((req, res, next) => {
  if (!ADMIN_TOKEN) {
    if (APP_MODE === 'demo') return next();
    return res.status(403).json({ ok: false, error: 'admin disabled (missing ADMIN_TOKEN)' });
  }
  const t = (req.get('x-admin-token') || '').trim();
  if (safeEqual(t, ADMIN_TOKEN)) return next();
  return res.status(403).json({ ok: false, error: 'forbidden' });
});

/* ================================================
   Helpers (paths, IO, CSV)
   ================================================ */

// NOTE: For multi-tenant migration we only switched PLAYERS to req.ctx.*
// The rest (fixtures/results/predictions/scores) still use global DATA_DIR for now.

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
  const esc = v => String(v ?? '').replace(/\"/g, '""').replace(/\r?\n/g, ' ');
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

// tolerant CSV (handles quotes, doubled quotes, BOM, empty cells); header is lowercased
function parseCsvTolerant(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return { header: [], rows: [] };

  const splitLine = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
        if (ch === '"') { inQ = false; continue; }
        cur += ch;
      } else {
        if (ch === '"') { inQ = true; continue; }
        if (ch === ',') { out.push(cur); cur = ''; continue; }
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const header = splitLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
    const cells = splitLine(line);
    const row = {};
    header.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
  return { header, rows };
}

/* ================================================
   Players API (mounted under /api/admin) — TENANT-AWARE
   ================================================ */

// Internal helpers (tenant-aware)
async function readPlayers(req) {
  const arr = readJSON(req, 'players.json', []);
  return Array.isArray(arr) ? arr : [];
}
async function writePlayers(req, players) {
  writeJSON(req, 'players.json', players);
}

// GET /players — safe list (no PINs)
router.get('/players', async (req, res) => {
  try {
    const players = await readPlayers(req);
    res.json(players.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email || null,
      has_pin: !!p.pin_hash,
      pin_updated_at: p.pin_updated_at || null
    })));
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /players/count — total number (return a number)
router.get('/players/count', async (req, res) => {
  try {
    const players = await readPlayers(req);
    res.json(players.length);
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /players — { name, email?, pin? } (pin optional; hashed)
router.post('/players', async (req, res) => {
  try {
    const { name, email = '', pin } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name_required' });
    }
    const players = await readPlayers(req);
    const id = (crypto.randomUUID && crypto.randomUUID()) ||
               `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const rec = { id, name: name.trim(), email: String(email || '') || undefined };
    if (pin && String(pin).length >= 4) {
      rec.pin_hash = await bcrypt.hash(String(pin), 10);
      rec.pin_updated_at = new Date().toISOString();
    }
    players.push(rec);
    await writePlayers(req, players);
    return res.json({
      ok: true,
      player: {
        id: rec.id, name: rec.name, email: rec.email || '',
        has_pin: !!rec.pin_hash, pin_updated_at: rec.pin_updated_at || null
      }
    });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

// PUT /players/:id — { name?, email?, new_pin?, clear_pin? }
router.put('/players/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, new_pin, clear_pin } = req.body || {};
    const players = await readPlayers(req);
    const idx = players.findIndex(p => String(p.id) === String(id));
    if (idx < 0) return res.status(404).json({ error: 'player_not_found' });

    if (name != null) players[idx].name = String(name).trim();
    if (email != null) {
      const e = String(email).trim();
      if (e) players[idx].email = e; else delete players[idx].email;
    }
    if (clear_pin) {
      delete players[idx].pin_hash;
      players[idx].pin_updated_at = new Date().toISOString();
    } else if (new_pin != null) {
      if (String(new_pin).length < 4) return res.status(400).json({ error: 'PIN must be ≥ 4 digits' });
      players[idx].pin_hash = await bcrypt.hash(String(new_pin), 10);
      players[idx].pin_updated_at = new Date().toISOString();
    }

    await writePlayers(req, players);
    const p = players[idx];
    return res.json({
      ok: true,
      player: { id: p.id, name: p.name, email: p.email || '', has_pin: !!p.pin_hash, pin_updated_at: p.pin_updated_at || null }
    });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

// DELETE /players/:id
router.delete('/players/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const players = await readPlayers(req);
    const idx = players.findIndex(p => String(p.id) === String(id));
    if (idx < 0) return res.status(404).json({ error: 'player_not_found' });
    const [removed] = players.splice(idx, 1);
    await writePlayers(req, players);
    return res.json({ ok: true, removed: { id: removed.id, name: removed.name, email: removed.email || '' } });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /players/pin/reset — { player_id?, name?, new_pin }
router.post('/players/pin/reset', async (req, res) => {
  try {
    const { player_id, name, new_pin } = req.body || {};
    if (!new_pin || String(new_pin).length < 4) return res.status(400).json({ error: 'PIN must be >= 4 digits' });
    const players = await readPlayers(req);
    const idx = players.findIndex(p =>
      (player_id && String(p.id) === String(player_id)) || (name && p.name === name)
    );
    if (idx < 0) return res.status(404).json({ error: 'player_not_found' });
    players[idx].pin_hash = await bcrypt.hash(String(new_pin), 10);
    players[idx].pin_updated_at = new Date().toISOString();
    await writePlayers(req, players);
    res.json({ ok: true, id: players[idx].id, name: players[idx].name });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

/* ========================= Fixtures & Results ========================= */

// 1) Import fixtures
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

// 2) Save results
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

// 3) Get results
router.get('/results', (req, res) => {
  try {
    const { week } = req.query;
    if (!week) return res.status(400).json({ ok: false, error: 'week required' });
    const p = path.join(DATA_DIR, 'results', `week-${week}.json`);
    const obj = readJsonSync(p, {});
    return res.json({ ok: true, results: obj });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

/* ========================= Predictions CSV ========================= */

router.post('/predictions/upload', async (req, res) => {
  try {
    const { week, csv } = req.body || {};
    const wk = parseInt(week, 10);
    if (!Number.isFinite(wk) || wk < 1) return res.status(400).json({ error: 'bad_week', detail: String(week) });
    if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'missing_csv' });

    const { header, rows } = parseCsvTolerant(csv);
    const need = ['player_id', 'predictions'];
    const missing = need.filter(k => !header.includes(k));
    if (missing.length) return res.status(400).json({ error: 'bad_header', missing });

    const fpath = path.join(DATA_DIR, 'predictions', `week-${wk}.json`);
    let existing = readJsonSync(fpath, {});
    if (Array.isArray(existing)) {
      const conv = {};
      for (const r of existing) if (r && r.player_id) conv[String(r.player_id)] = r;
      existing = conv;
    } else if (!existing || typeof existing !== 'object') {
      existing = {};
    }

    let imported = 0;
    for (const r of rows) {
      if (!r.player_id) continue;

      let predsArr;
      try { predsArr = JSON.parse(r.predictions); }
      catch {
        const fixed = r.predictions.replace(/\"\"/g, '"');
        predsArr = JSON.parse(fixed);
      }
      if (!Array.isArray(predsArr)) return res.status(400).json({ error: 'predictions_not_array', row: r });

      const key = String(r.player_id);
      existing[key] = {
        player_id: key,
        predictions: predsArr,
        submitted_at: r.submitted_at || null,
        email_sent_at: r.email_sent_at || null,
      };
      imported++;
    }

    writeJsonSync(fpath, existing);
    return res.json({ ok: true, week: wk, imported, total_players: Object.keys(existing).length });
  } catch (e) {
    console.error('upload predictions error:', e);
    return res.status(400).json({ error: 'csv_parse_error', detail: e.message });
  }
});

router.get('/predictions/download', (req, res) => {
  try {
    const { week } = req.query;
    if (!week) return res.status(400).json({ ok: false, error: 'week required' });

    const p = path.join(DATA_DIR, 'predictions', `week-${week}.json`);
    let data = readJsonSync(p, {});

    if (Array.isArray(data)) {
      const m = {};
      for (const r of data) if (r && r.player_id) m[String(r.player_id)] = r;
      data = m;
    }

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

/* ========================= Scores CSV ========================= */

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

/* ========================= Players export/import ========================= */

router.get('/players/download', async (req, res) => {
  try {
    const arr = await readPlayers(req);
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
      const rec = { id: r.id || (r.name ? `p-${r.name.toLowerCase().replace(/\s+/g,'-')}` : undefined),
                    name: r.name || '', email: r.email || '' };
      if (r.pin && String(r.pin).length >= 4) {
        rec.pin_hash = await bcrypt.hash(String(r.pin), 10);
        rec.pin_updated_at = new Date().toISOString();
      }
      out.push(rec);
    }

    await writePlayers(req, out);
    return res.json({ ok: true, imported: out.length, hashed: out.filter(p => p.pin_hash).length });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

/* ========================= Admin health & maintenance ========================= */

router.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

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
