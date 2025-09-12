// routes/admin.js — tenant-aware Admin API (Players/Fixtures/Results/Predictions/Scores)

const express = require('express');
const router = express.Router();

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { DATA_DIR } = require('../lib/paths'); // global fallback
let { writeJsonAtomic } = require('../utils/atomicJson');
if (typeof writeJsonAtomic !== 'function') {
  writeJsonAtomic = async (p, obj) => {
    await fsp.mkdir(path.dirname(p), { recursive: true }).catch(()=>{});
    await fsp.writeFile(p, JSON.stringify(obj, null, 2), 'utf8');
  };
}

// ---------- security ----------
const APP_MODE = process.env.APP_MODE || 'demo';
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();

function safeEqual(a = '', b = '') {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

router.use(express.json());

// single ADMIN TOKEN guard (header: x-admin-token)
router.use((req, res, next) => {
  if (!ADMIN_TOKEN) {
    if (APP_MODE === 'demo') return next();
    return res.status(403).json({ ok: false, error: 'admin disabled (missing ADMIN_TOKEN)' });
  }
  const t = (req.get('x-admin-token') || '').trim();
  if (safeEqual(t, ADMIN_TOKEN)) return next();
  return res.status(403).json({ ok: false, error: 'forbidden' });
});

// ---------- tenant + competition helpers ----------
function tenantSlug(req) {
  return String(req?.ctx?.tenant || 'default');
}
function tenantDir(req) {
  return req?.ctx?.tenantDir || path.join(DATA_DIR, 'tenants', tenantSlug(req));
}
function dataDir(req) {
  // competition-scoped dir (or tenant root in legacy mode)
  return (req && req.ctx && req.ctx.dataDir) ? req.ctx.dataDir : tenantDir(req);
}
function pJoin(req, ...p) {
  return path.join(dataDir(req), ...p);
}
async function ensureDirFor(filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true }).catch(() => {});
}
async function readJson(p, fb = null) {
  try { return JSON.parse(await fsp.readFile(p, 'utf8')); } catch { return fb; }
}
function readJsonSync(p, fb = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; }
}
async function writeJson(req, p, obj) {
  await ensureDirFor(p);
  await writeJsonAtomic(p, obj);
}

// ---------- license / seat-cap helpers (tenant-level license) ----------
function b64urlEncode(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr));
  return b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(str) {
  let s = String(str || '').replace(/-/g,'+').replace(/_/g,'/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}
function verifyTenantLicenseToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return { ok:false, reason:'malformed' };
  if (!secret) return { ok:false, reason:'missing LICENSE_SECRET' };
  const [body, sig] = token.split('.');
  const expected = b64urlEncode(crypto.createHmac('sha256', secret).update(body).digest());
  if (sig !== expected) return { ok:false, reason:'bad signature' };
  let claims;
  try { claims = JSON.parse(b64urlDecode(body)); }
  catch { return { ok:false, reason:'bad payload' }; }
  return { ok:true, claims };
}
function readTenantConfig(req) {
  try { return JSON.parse(fs.readFileSync(path.join(tenantDir(req), 'config.json'), 'utf8')); }
  catch { return {}; }
}
function getTenantLicenseClaims(req) {
  const cfg = readTenantConfig(req);
  const token  = String(cfg.license_token || '');
  const secret = process.env.LICENSE_SECRET || '';
  const v = verifyTenantLicenseToken(token, secret);
  if (!v.ok) return v;
  const c = v.claims || {};
  if (c.tenant && c.tenant !== tenantSlug(req)) return { ok:false, reason:'tenant mismatch', claims:c };
  if (c.exp && Date.now() > Date.parse(c.exp)) return { ok:false, reason:'expired', claims:c };
  return { ok:true, claims:c };
}
async function readPlayers(req){ return await readJson(pJoin(req, 'players.json'), []) || []; }
async function writePlayers(req, arr){ await writeJson(req, pJoin(req, 'players.json'), arr); }

async function enforceSeatLimitOrFail(req, toAddCount = 1) {
  // DEMO bypass keeps behaviour consistent with the rest of the app
  if (String(process.env.DEMO_SKIP_LICENSE || '').toLowerCase() === 'true') return { ok:true };
  const v = getTenantLicenseClaims(req);
  if (!v.ok) return { ok:false, status:403, error: 'No valid tenant license (' + (v.reason || 'unknown') + ')' };
  const seats = Number(v.claims?.seats);
  if (!Number.isFinite(seats) || seats <= 0) return { ok:false, status:403, error:'Seat limit not set' };
  const players = await readPlayers(req);
  if (players.length + toAddCount > seats) {
    const remaining = Math.max(0, seats - players.length);
    return { ok:false, status:403, error:`Seat limit reached (${seats})`, seats, current: players.length, remaining };
  }
  return { ok:true, seats };
}

// ---------- CSV helpers ----------
function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => String(v ?? '').replace(/\"/g, '""').replace(/\r?\n/g, ' ');
  return [headers.join(','), ...rows.map(r => headers.map(h => `"${esc(r[h])}"`).join(','))].join('\n');
}
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { inQ = false; } }
      else { field += c; }
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field=''; }
      else if (c === '\n') { row.push(field); rows.push(row); row=[]; field=''; }
      else if (c === '\r') { /* ignore */ }
      else { field += c; }
    }
  }
  row.push(field); rows.push(row);
  const headers = (rows.shift() || []).map(h => h.trim());
  const out = [];
  for (const r of rows) {
    if (r.every(v => (v === '' || v == null))) continue;
    const obj = {}; headers.forEach((h,i) => { obj[h] = (r[i] ?? '').trim(); });
    out.push(obj);
  }
  return out;
}
function parseCsvTolerant(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return { header: [], rows: [] };
  const splitLine = (line) => {
    const out = []; let cur=''; let inQ=false;
    for (let i=0;i<line.length;i++){
      const ch=line[i];
      if (inQ) {
        if (ch === '"' && line[i+1] === '"'){ cur+='"'; i++; continue; }
        if (ch === '"'){ inQ=false; continue; }
        cur+=ch;
      } else {
        if (ch === '"'){ inQ=true; continue; }
        if (ch === ','){ out.push(cur); cur=''; continue; }
        cur+=ch;
      }
    }
    out.push(cur); return out;
  };
  const header = splitLine(lines[0]).map(h=>h.trim().toLowerCase());
  const rows = lines.slice(1).map(line=>{
    const cells = splitLine(line);
    const row={}; header.forEach((h,i)=>{ row[h]=(cells[i]??'').trim(); });
    return row;
  });
  return { header, rows };
}

// ---------- Admin health ----------
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    tenant: (req.ctx && req.ctx.tenant) || tenantSlug(req),
    competition: (req.ctx && req.ctx.comp) || '',
    dataDir: dataDir(req),
    tenantDir: tenantDir(req)
  });
});

/* ========================= Players CRUD ========================= */

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
  } catch { res.status(500).json({ error: 'server_error' }); }
});

router.get('/players/count', async (req, res) => {
  try { res.json((await readPlayers(req)).length); }
  catch { res.status(500).json({ error: 'server_error' }); }
});

router.post('/players', async (req, res) => {
  try {
    const { name, email = '', pin } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim())
      return res.status(400).json({ error: 'name_required' });

    // Enforce seat cap (per-competition)
    const cap = await enforceSeatLimitOrFail(req, 1);
    if (!cap.ok) return res.status(cap.status || 403).json({ ok:false, error: cap.error, ...cap });

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
    res.json({ ok: true, player: { id: rec.id, name: rec.name, email: rec.email || '', has_pin: !!rec.pin_hash, pin_updated_at: rec.pin_updated_at || null }});
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

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
    res.json({ ok: true, player: { id: p.id, name: p.name, email: p.email || '', has_pin: !!p.pin_hash, pin_updated_at: p.pin_updated_at || null }});
  } catch { res.status(500).json({ error: 'server_error' }); }
});

router.delete('/players/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const players = await readPlayers(req);
    const idx = players.findIndex(p => String(p.id) === String(id));
    if (idx < 0) return res.status(404).json({ error: 'player_not_found' });
    const [removed] = players.splice(idx, 1);
    await writePlayers(req, players);
    res.json({ ok: true, removed: { id: removed.id, name: removed.name, email: removed.email || '' } });
  } catch { res.status(500).json({ error: 'server_error' }); }
});

// Reset by id or name
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
  } catch { res.status(500).json({ error: 'server_error' }); }
});

/* ========================= Fixtures & Results ========================= */

router.post('/fixtures/import', (req, res) => {
  try {
    const { season = 2025, week, fixtures } = req.body || {};
    if (!week || !Array.isArray(fixtures)) return res.status(400).json({ ok: false, error: 'week and fixtures[] required' });
    const fixturesPath = pJoin(req, 'fixtures', `season-${season}`, `week-${week}.json`);
    fs.mkdirSync(path.dirname(fixturesPath), { recursive: true });
    fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2), 'utf8');
    return res.json({ ok: true, saved: fixtures.length, path: fixturesPath });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/results', (req, res) => {
  try {
    const { week, results } = req.body || {};
    if (!week || typeof results !== 'object') return res.status(400).json({ ok: false, error: 'week and results{} required' });
    const p = pJoin(req, 'results', `week-${week}.json`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(results, null, 2), 'utf8');
    return res.json({ ok: true, path: p });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/results', (req, res) => {
  try {
    const { week } = req.query;
    if (!week) return res.status(400).json({ ok: false, error: 'week required' });
    const p = pJoin(req, 'results', `week-${week}.json`);
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

    const fpath = pJoin(req, 'predictions', `week-${wk}.json`);
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

    await writeJson(req, fpath, existing);
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

    const pth = pJoin(req, 'predictions', `week-${week}.json`);
    let data = readJsonSync(pth, {});

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
    const outPath = pJoin(req, 'scores', `season-totals.json`);
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

router.get('/scores/download', (req, res) => {
  try {
    const pth = pJoin(req, 'scores', `season-totals.json`);
    const data = readJsonSync(pth, {});
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

    // enforce seat cap across bulk import (per-competition)
    const existing = await readPlayers(req);
    let remaining = Infinity;
    if (String(process.env.DEMO_SKIP_LICENSE || '').toLowerCase() !== 'true') {
      const v = getTenantLicenseClaims(req);
      if (!v.ok) return res.status(403).json({ ok:false, error:'No valid tenant license (' + (v.reason || 'unknown') + ')' });
      const seats = Number(v.claims?.seats);
      if (Number.isFinite(seats) && seats > 0) remaining = Math.max(0, seats - existing.length);
      if (remaining <= 0) return res.status(403).json({ ok:false, error:`Seat limit reached (${seats})`, seats, current: existing.length, remaining: 0 });
    }

    const out = [];
    let hashed = 0;
    for (const r of rows) {
      if (out.length >= remaining) break; // stop when we hit seat cap
      const rec = {
        id: r.id || (crypto.randomUUID && crypto.randomUUID()) || `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,
        name: r.name || '',
        email: r.email || ''
      };
      if (r.pin && String(r.pin).length >= 4) {
        rec.pin_hash = await bcrypt.hash(String(r.pin), 10);
        rec.pin_updated_at = new Date().toISOString();
        hashed++;
      }
      out.push(rec);
    }

    const finalArr = existing.concat(out);
    await writePlayers(req, finalArr);

    const truncated = rows.length > out.length;
    return res.json({
      ok: true,
      imported: out.length,
      hashed,
      totalPlayers: finalArr.length,
      truncated, // true if seat cap prevented importing all rows
      remainingAfter: Math.max(0, (remaining === Infinity ? finalArr.length : remaining - out.length))
    });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

/* ========================= Maintenance ========================= */

router.post('/wipe/week', (req, res) => {
  try {
    const { week } = req.body || {};
    if (!week) return res.status(400).json({ ok: false, error: 'week required' });
    const preds = pJoin(req, 'predictions', `week-${week}.json`);
    const results = pJoin(req, 'results', `week-${week}.json`);
    if (fs.existsSync(preds)) fs.unlinkSync(preds);
    if (fs.existsSync(results)) fs.unlinkSync(results);
    return res.json({ ok: true, week, dataDir: dataDir(req) });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
