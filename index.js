// index.js — MatchM8 server (prod-ready with ephemeral fallback + seeding + per-request tenant meta)
const path = require('path');
const fs = require('fs');

// ------------- Load & sanitize environment -------------
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

function cleanToken(s = '') {
  return String(s)
    .replace(/\r/g, '')
    .replace(/\s+#.*$/, '')
    .replace(/^\s*['"]|['"]\s*$/g, '')
    .trim();
}
if (process.env.ADMIN_TOKEN) process.env.ADMIN_TOKEN = cleanToken(process.env.ADMIN_TOKEN);
if (process.env.LICENSE_PUBKEY_B64) process.env.LICENSE_PUBKEY_B64 = cleanToken(process.env.LICENSE_PUBKEY_B64);

// If DATA_DIR not provided (e.g., Render Free), default to /tmp (ephemeral) so writes succeed.
if (!process.env.DATA_DIR) {
  const fallback = process.env.RENDER ? '/tmp/matchm8-data' : path.join(__dirname, 'data');
  process.env.DATA_DIR = fallback;
  console.log(`[boot] DATA_DIR not set; using ${fallback} ${process.env.RENDER ? '(ephemeral)' : ''}`);
}

// 🔒 Lock to prod
const APP_MODE = 'prod';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fetchFn = (...args) => import('node-fetch').then(({default: f}) => f(...args)).catch(() => fetch(...args)); // Node18+ or node-fetch polyfill
const { DATA_DIR } = require('./lib/paths'); // central data dir (reads env DATA_DIR or ./data)

// -------------------- Per-request TENANT context (no extra files needed) --------------------
/**
 * TENANT selection rules (in priority order):
 * 1) TENANT_MAP JSON env maps request hostname -> tenant slug
 * 2) TENANT env fallback (lets you run without DNS/subdomains)
 * 3) 'default'
 *
 * Data for each request is isolated under:  <BASE_DATA_DIR>/tenants/<TENANT>/
 * We only set req.ctx.{tenant,dataDir} here; routers can start using it later.
 */
const BASE_DATA_DIR = process.env.DATA_DIR; // global base; per-tenant lives under this
function parseTenantMap() {
  try { return JSON.parse(process.env.TENANT_MAP || '{}'); }
  catch { return {}; }
}
function tenantFromHost(host) {
  const h = (host || '').split(':')[0].toLowerCase();
  const map = parseTenantMap();
  return map[h] || process.env.TENANT || 'default';
}
function tenantMiddleware(req, _res, next) {
  try {
    const tenant = tenantFromHost(req.hostname);
    const dataDir = path.join(BASE_DATA_DIR, 'tenants', tenant);
    fs.mkdirSync(dataDir, { recursive: true });
    req.ctx = { tenant, dataDir };
  } catch (e) {
    // Fall back to global if anything odd happens — keeps current app behavior
    req.ctx = { tenant: process.env.TENANT || 'default', dataDir: BASE_DATA_DIR };
  }
  next();
}

// Ensure data dir exists + common subdirs; optionally seed demo content once.
function ensureDataDirsAndSeed() {
  const subdirs = [
    '.', 'fixtures', 'results', 'predictions',
    path.join('scores', 'weeks'), 'scores'
  ];
  for (const rel of subdirs) {
    try { fs.mkdirSync(path.join(DATA_DIR, rel), { recursive: true }); } catch {}
  }

  const seedDir = path.join(__dirname, 'data', '_seed');
  const seededMarker = path.join(DATA_DIR, '.seeded');

  try {
    const already = fs.existsSync(seededMarker);
    const hasSeed = fs.existsSync(seedDir);
    if (!already && hasSeed) {
      fs.cpSync(seedDir, DATA_DIR, { recursive: true, force: false, errorOnExist: false });
      fs.writeFileSync(seededMarker, new Date().toISOString());
      console.log(`[boot] Seeded demo data from ${seedDir} -> ${DATA_DIR}`);
    }
  } catch (e) {
    console.warn('[boot] Seeding skipped:', e.message);
  }
}
ensureDataDirsAndSeed();

const app = express();
app.set('trust proxy', 1); // ✅ for Render/Railway/any proxy
const PORT = process.env.PORT || 3000; // ✅ use platform port if provided

const joinRepo = (...p) => path.join(__dirname, ...p);
const joinData = (...p) => path.join(DATA_DIR, ...p);
const CONFIG_PATH = joinData('config.json');

// --- config defaults used if data/config.json is missing ---
const DEFAULT_CONFIG = {
  season: 2025,
  total_weeks: 38,
  current_week: 1,
  lock_minutes_before_kickoff: 10,
  deadline_mode: 'first_kickoff',
  timezone: 'Australia/Melbourne',
};

// helpers to read/write config.json safely
function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const obj = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...obj };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function writeConfig(cfg) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// timing-safe admin-token guard (used only where needed)
function timingSafeEqual(a = '', b = '') {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  try { return crypto.timingSafeEqual(A, B); } catch { return false; }
}
function requireAdminToken(req, res, next) {
  const token = cleanToken(req.headers['x-admin-token'] || '');
  const expected = process.env.ADMIN_TOKEN || '';
  if (!token || !expected || !timingSafeEqual(token, expected)) {
    return res.status(401).json({ ok: false, error: 'invalid admin token' });
  }
  next();
}

// --- License wiring ---
const license = require('./lib/license');
license.loadAndValidate().then(s => {
  console.log('License:', s.reason);
});

// Simple license gate middleware (no demo/bypass)
function requireValidLicense(req, res, next) {
  const s = license.getStatus();
  if (!s.ok) return res.status(403).json({ error: 'License invalid: ' + s.reason });
  next();
}

// -------------------- Global middleware --------------------

// CORS allowlist via env: CORS_ORIGIN="http://localhost:3000,https://your.site"
const ALLOW = (process.env.CORS_ORIGIN || '')
  .split(',').map(s => s.trim()).filter(Boolean);

if (ALLOW.length) {
  app.use(cors({
    origin: (origin, cb) => (!origin || ALLOW.includes(origin)) ? cb(null, origin) : cb(new Error('Not allowed by CORS')),
    credentials: false
  }));
} else {
  app.use(cors());
}

// Security headers (disable CSP so admin UI inline scripts work)
app.use(helmet({
  contentSecurityPolicy: false,
}));

// Light rate-limit on admin API surface
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/admin', adminLimiter);

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// 🔑 Per-request TENANT context (enable now; routers can adopt later)
app.use(tenantMiddleware);

// Health (Render/Railway)
app.get('/health', (_req, res) => res.json({ ok: true, mode: APP_MODE, ts: Date.now() }));
app.get('/healthz', (_req, res) => res.status(200).send('ok')); // legacy/simple

// Quick meta to see which tenant/folder this request is pointing at
app.get('/api/__meta', (req, res) => {
  res.json({
    ok: true,
    tenant: req.ctx?.tenant || (process.env.TENANT || 'default'),
    dataDir: req.ctx?.dataDir || DATA_DIR,
    appTitle: process.env.APP_TITLE || 'MatchM8'
  });
});

// Static assets (global; safe to keep while we migrate routers to req.ctx)
app.use('/data/scores', express.static(joinData('scores')));
app.use('/data/fixtures', express.static(joinData('fixtures')));
app.use(express.static(joinRepo('public')));
app.use('/ui', express.static(joinRepo('ui')));

// Fix old encoded URLs (legacy)
app.use((req, res, next) => {
  if (req.url.includes('%3F') || req.url.includes('%26')) {
    const fixed = req.url.replace(/%3F/gi, '?').replace(/%26/gi, '&');
    return res.redirect(fixed);
  }
  next();
});

/* -------------------- /api/config -------------------- */
// Public GET: players & UI read season info
app.get('/api/config', (_req, res) => res.json(readConfig()));

// Admin POST: save season settings etc.
app.post('/api/config', requireAdminToken, (req, res) => {
  const prev = readConfig();
  const next = { ...prev, ...req.body };

  // coercions/sanity
  if ('total_weeks' in req.body) next.total_weeks = Math.max(1, parseInt(req.body.total_weeks, 10) || prev.total_weeks);
  if ('current_week' in req.body) next.current_week = Math.max(1, parseInt(req.body.current_week, 10) || prev.current_week);
  if ('lock_minutes_before_kickoff' in req.body) next.lock_minutes_before_kickoff = Math.max(0, parseInt(req.body.lock_minutes_before_kickoff, 10) || 0);
  if ('season' in req.body) next.season = parseInt(req.body.season, 10) || prev.season;
  if ('deadline_mode' in req.body) next.deadline_mode = (req.body.deadline_mode === 'per_match') ? 'per_match' : 'first_kickoff';
  if ('timezone' in req.body) next.timezone = String(req.body.timezone || prev.timezone);

  writeConfig(next);
  res.json({ ok: true, config: next });
});

/* -------------------- Safe require + mount -------------------- */
function safeRequire(label, p) {
  try {
    const mod = require(p);
    console.log(`[boot] mounted ${label} at runtime path ${p}`);
    return { ok: true, mod };
  } catch (e) {
    console.warn(`[boot] Skipping ${label}: ${e.message}`);
    return { ok: false, mod: null, reason: e.message };
  }
}
function mount(label, route, mod) {
  app.use(route, mod);
  mounted.push({ label, route });
}
const mounted = [];

// Fixtures (try user route first)
const fixtures = safeRequire('./routes/fixtures.js', './routes/fixtures');
if (fixtures.ok) {
  mount('./routes/fixtures.js', '/api/fixtures', fixtures.mod);
  mount('./routes/fixtures.js', '/fixtures', fixtures.mod);
} else {
  // Fallback public fixtures: returns plain array for week (global DATA_DIR for now)
  app.get('/api/fixtures', (req, res) => {
    const cfg = readConfig();
    const week = Math.max(1, parseInt(req.query.week, 10) || 1);
    const season = cfg.season || 2025;
    const fpath = path.join(DATA_DIR, 'fixtures', `season-${season}`, `week-${week}.json`);
    try {
      const txt = fs.readFileSync(fpath, 'utf8');
      const arr = JSON.parse(txt);
      if (Array.isArray(arr)) return res.json(arr);
      if (arr && Array.isArray(arr.fixtures)) return res.json(arr.fixtures);
      return res.json([]);
    } catch {
      return res.json([]);
    }
  });
  mounted.push({ label: '(inline)/api/fixtures', route: '/api/fixtures' });
}

// Predictions
const predictions = safeRequire('./routes/predictions.js', './routes/predictions');
if (predictions.ok) {
  mount('./routes/predictions.js', '/api/predictions', predictions.mod);
  mount('./routes/predictions.js', '/predictions', predictions.mod);
}

// Scores — license-gated
const scores = safeRequire('./routes/scores.js', './routes/scores');
if (scores.ok) {
  app.use('/api/scores', requireValidLicense, scores.mod);
  app.use('/scores', requireValidLicense, scores.mod);
  mounted.push({ label: './routes/scores.js', route: '/api/scores' });
  mounted.push({ label: './routes/scores.js', route: '/scores' });
}

// Auth
const auth = safeRequire('./routes/auth.js', './routes/auth');
if (auth.ok) {
  mount('./routes/auth.js', '/api/auth', auth.mod);
  mount('./routes/auth.js', '/auth', auth.mod);
}

// Players (optional)
const players = safeRequire('./routes/players.js', './routes/players');
if (players.ok) {
  mount('./routes/players.js', '/api/players', players.mod);
  mount('./routes/players.js', '/players', players.mod);
}

/* -------------------- LICENSE ENDPOINTS -------------------- */
// Public status
app.get('/api/license/status', (_req, res) => res.json(license.getStatus()));

// Apply license outside /api/admin (still requires x-admin-token).
app.post('/api/license/apply', requireAdminToken, express.json(), async (req, res) => {
  try {
    const token = String(req.body?.license || '').trim();
    if (!token) return res.status(400).json({ ok: false, error: 'missing license' });

    const prev = readConfig();
    const next = { ...prev, license: { token, appliedAt: new Date().toISOString() } };
    writeConfig(next);

    await license.loadAndValidate().catch(e => ({ ok: false, reason: String(e) }));
    return res.json({ ok: !!license.getStatus().ok, status: license.getStatus() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// Legacy admin paths (kept for compatibility)
app.post('/api/admin/license', requireAdminToken, express.json(), async (req, res) => {
  try {
    const token = String(req.body?.license || '').trim();
    if (!token) return res.status(400).json({ ok: false, error: 'missing license' });
    const prev = readConfig();
    const next = { ...prev, license: { token, appliedAt: new Date().toISOString() } };
    writeConfig(next);
    await license.loadAndValidate().catch(e => ({ ok: false, reason: String(e) }));
    return res.json({ ok: !!license.getStatus().ok, status: license.getStatus() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get('/api/admin/license/status', requireAdminToken, (_req, res) => {
  return res.json(license.getStatus());
});

// ---- Admin auth (mounted BEFORE other /api/admin routes) ----
const adminAuth = require('./routes/admin_auth');
app.use('/api/admin', adminAuth);
mounted.push({ label: './routes/admin_auth.js', route: '/api/admin' });

// ---- Admin routes (guarded; token checks inside route impl) ----
const admin = safeRequire('./routes/admin.js', './routes/admin');
if (admin.ok) {
  mount('./routes/admin.js', '/api/admin', admin.mod);
}

// ---- Locks route — license-gated ----
{
  const locksRt = safeRequire('./routes/locks.js', './routes/locks');
  if (locksRt.ok) {
    app.use('/api/locks', requireValidLicense, locksRt.mod);
    mounted.push({ label: './routes/locks.js', route: '/api/locks' });
  } else {
    console.warn('Skipping ./routes/locks.js:', locksRt.reason || 'failed to load');
  }
}

// ---- Admin reminders (under /api/admin; router also checks x-admin-token) ----
{
  const remindersRt = safeRequire('./routes/admin-reminders.js', './routes/admin-reminders');
  if (remindersRt.ok) {
    app.use('/api/admin/reminders', remindersRt.mod);
    mounted.push({ label: './routes/admin-reminders.js', route: '/api/admin/reminders' });
  } else {
    console.warn('Skipping ./routes/admin-reminders.js:', remindersRt.reason || 'failed to load');
  }
}

/* -------------------- Diagnostics -------------------- */
app.get('/api/__health', (req, res) =>
  res.json({
    ok: true,
    mounted,
    mode: APP_MODE,
    dataDir_global: DATA_DIR,         // current global
    tenant: req.ctx?.tenant || null,  // new: per-request
    dataDir_request: req.ctx?.dataDir || null
  })
);
app.get('/api/__routes', (_req, res) => res.json(mounted));

/* -------------------- Map UI pages -------------------- */
[
  'Part_A_PIN.html',
  'Part_B_Predictions.html',
  'Part_D_Scoring.html',
  'Part_E_Season.html',
  'Part_E_Matrix.html',
  'admin.html'
].forEach(page => {
  app.get('/' + page, (_req, res) => res.sendFile(joinRepo('public', page)));
});

/* -------------------- Root -------------------- */
app.get('/', (_req, res) => res.sendFile(joinRepo('public', 'Part_A_PIN.html')));

/* -------------------- Listen -------------------- */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MatchM8 listening on port ${PORT} (mode=${APP_MODE})`);
  console.log(`DATA_DIR (global) = ${DATA_DIR}`);

  // Auto-apply LICENSE_TOKEN on boot (works on Free plan without a disk)
  try {
    const tok = cleanToken(process.env.LICENSE_TOKEN || '');
    if (tok) {
      const prev = readConfig();
      const next = { ...prev, license: { token: tok, appliedAt: new Date().toISOString() } };
      writeConfig(next);
      license.loadAndValidate()
        .then(s => console.log('[license] auto-apply on boot:', s.reason))
        .catch(err => console.error('[license] auto-apply failed:', err.message));
    } else {
      console.log('[license] no LICENSE_TOKEN env; skipping auto-apply');
    }
  } catch (e) {
    console.error('[license] auto-apply error:', e.message);
  }
});
