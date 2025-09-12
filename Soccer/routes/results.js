// routes/results.js — tenant-aware results upsert with Supabase *or* file fallback (CommonJS)

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { pathToFileURL } = require('url');

const resultsRouter = express.Router();

/* ---------------- Helpers: tenant + admin token ---------------- */
function sanitize(t) { return String(t ?? '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'default'; }
function resolveTenant(req) {
  if (process.env.ALLOW_TENANT_OVERRIDE === 'true') {
    const q = (req?.query?.t) || req?.headers?.['x-tenant'];
    if (q) return sanitize(q);
  }
  const host = (req?.hostname || '').split(':')[0].toLowerCase();
  try {
    const map = JSON.parse(process.env.TENANT_MAP || '{}');
    return sanitize(map[host] || process.env.TENANT || 'default');
  } catch { return sanitize(process.env.TENANT || 'default'); }
}

function cleanToken(s = '') {
  return String(s).replace(/\r/g, '').replace(/\s+#.*$/, '').replace(/^\s*['"]|['"]\s*$/g, '').trim();
}
function timingSafeEqual(a = '', b = '') {
  const A = Buffer.from(a); const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  try { return require('crypto').timingSafeEqual(A, B); } catch { return false; }
}
function requireAdminToken(req, res, next) {
  const token = cleanToken(req.headers['x-admin-token'] || '');
  const expected = cleanToken(process.env.ADMIN_TOKEN || '');
  if (!token || !expected || !timingSafeEqual(token, expected)) {
    return res.status(401).json({ ok: false, error: 'invalid admin token' });
  }
  req.admin = { id: 'admin-token' }; // minimal actor for audit
  next();
}

/* ---------------- Small utils ---------------- */
async function readJson(file, fb) { try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fb; } }
async function writeJson(file, obj) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(obj, null, 2));
}
function inferWeek(match_id) {
  if (!match_id) return null;
  const patterns = [/-W(\d+)\b/i, /\bW(\d+)\b/i, /week[-_]?(\d+)/i];
  for (const re of patterns) {
    const m = String(match_id).match(re);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0 && n < 100) return n;
    }
  }
  return null;
}

/* ---------------- Supabase loader (ESM friendly) ---------------- */
let _supa = null;
async function getSupa() {
  if (_supa) return _supa;

  // 1) Try your local lib/supa.js as ESM
  try {
    const full = pathToFileURL(path.join(__dirname, '../lib/supa.js')).href;
    const mod = await import(full);
    const client = mod.supa || mod.default || mod;
    if (client && typeof client.from === 'function') {
      _supa = client;
      return _supa;
    }
  } catch { /* fall through */ }

  // 2) Try creating a client directly from env
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('missing env');
    _supa = createClient(url, key, { auth: { persistSession: false } });
    return _supa;
  } catch {
    // 3) Give up → signal to caller to use FS fallback
    throw new Error('SUPABASE_UNAVAILABLE');
  }
}

/* ---------------- Optional audit ---------------- */
let _logAudit = null;
async function logAuditSafe(entry) {
  if (_logAudit === null) {
    try {
      const full = pathToFileURL(path.join(__dirname, '../lib/audit.js')).href;
      const mod = await import(full);
      _logAudit = mod.logAudit || mod.default || null;
    } catch { _logAudit = null; }
  }
  if (typeof _logAudit === 'function') {
    try { await _logAudit(entry); } catch { /* ignore */ }
  }
}

/* ---------------- Route ---------------- */
/**
 * PUT /api/results/upsert
 * body: { match_id, home_score, away_score, league_id? }
 * - Primary: upsert to Supabase table "results" scoped by (match_id, league_id).
 * - Fallback: write to per-tenant JSON: <DATA_DIR>/tenants/<tenant>/results/week-<N>.json
 */
resultsRouter.put('/upsert', requireAdminToken, async (req, res) => {
  const { match_id, league_id, home_score, away_score } = req.body || {};
  if (!match_id || home_score == null || away_score == null) {
    return res.status(400).json({ error: 'match_id, home_score, away_score required' });
  }

  const tenant = resolveTenant(req);
  const league = String(league_id ?? tenant);
  const hs = Number.isFinite(+home_score) ? parseInt(home_score, 10) : null;
  const as = Number.isFinite(+away_score) ? parseInt(away_score, 10) : null;
  if (hs == null || as == null) {
    return res.status(400).json({ error: 'home_score and away_score must be numbers' });
  }

  // Try Supabase path first
  try {
    const supa = await getSupa();

    // 1) Existing row for (match_id, league_id)
    const { data: existingExact } = await supa
      .from('results')
      .select('*')
      .eq('match_id', match_id)
      .eq('league_id', league)
      .maybeSingle();

    // 2) Legacy row where league_id is NULL
    let existing = existingExact || null;
    if (!existing) {
      const { data: legacyRow } = await supa
        .from('results')
        .select('*')
        .eq('match_id', match_id)
        .is('league_id', null)
        .maybeSingle();
      if (legacyRow) existing = legacyRow;
    }

    const payload = {
      match_id,
      league_id: league,
      home_score: hs,
      away_score: as,
      updated_at: new Date().toISOString(),
    };

    let before = existing || null;
    let resultRow;

    if (existing) {
      const { data, error } = await supa
        .from('results')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      resultRow = data;
    } else {
      const { data, error } = await supa
        .from('results')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      resultRow = data;
    }

    await logAuditSafe({
      league_id: resultRow?.league_id || league || null,
      actor_id: req.admin?.id || null,
      action: before ? 'RESULTS_UPDATE' : 'RESULTS_CREATE',
      target_table: 'results',
      target_id: resultRow?.id || null,
      details: { before: before || null, after: resultRow, ip: req.ip, match_id, tenant, storage: 'supabase' },
    });

    return res.json({ ok: true, result: resultRow, storage: 'supabase' });
  } catch (e) {
    // Supabase unavailable → file fallback
    if (String(e.message) !== 'SUPABASE_UNAVAILABLE' && !/Cannot use import statement/i.test(String(e.message))) {
      // For other DB errors, still allow FS fallback to proceed
    }

    try {
      const week = inferWeek(match_id) ?? 0; // if we can't infer, drop into week-0.json
      const base = (req.ctx?.dataDir) || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'tenants', tenant);
      const file = path.join(base, 'results', `week-${week}.json`);

      const obj = await readJson(file, {});
      obj[match_id] = {
        match_id,
        league_id: league,
        home_score: hs,
        away_score: as,
        updated_at: new Date().toISOString(),
      };
      await writeJson(file, obj);

      await logAuditSafe({
        league_id: league,
        actor_id: req.admin?.id || null,
        action: obj[match_id]?.updated_at ? 'RESULTS_UPDATE' : 'RESULTS_CREATE',
        target_table: 'results',
        target_id: match_id,
        details: { after: obj[match_id], ip: req.ip, tenant, storage: 'fs', file },
      });

      return res.json({ ok: true, result: obj[match_id], storage: 'fs' });
    } catch (fsErr) {
      return res.status(500).json({ error: 'Failed to save result', detail: String(fsErr?.message || fsErr) });
    }
  }
});

module.exports = resultsRouter;
