// index.js — MatchM8 server (final)

const path = require('path');
const fs = require('fs');

// ------------- Load & sanitize environment -------------
const envPath = path.join(__dirname, '.env');
require('dotenv').config({ path: envPath, override: true });

function cleanToken(s = '') {
  return String(s)
    .replace(/\r/g, '')                 // strip Windows CR
    .replace(/\s+#.*$/, '')             // strip inline " # comment"
    .replace(/^\s*['"]|['"]\s*$/g, '')  // strip surrounding quotes
    .trim();
}
if (process.env.ADMIN_TOKEN) {
  process.env.ADMIN_TOKEN = cleanToken(process.env.ADMIN_TOKEN);
}

// ------------- App bootstrap -------------
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

const join = (...p) => path.join(__dirname, ...p);
const DATA_DIR = join('data');
const CONFIG_PATH = join('data', 'config.json');

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
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// simple admin-token guard for non-/api/admin routes
function requireAdminToken(req, res, next) {
  const t = cleanToken(req.headers['x-admin-token'] || '');
  if (!t || t !== (process.env.ADMIN_TOKEN || '')) {
    return res.status(401).json({ ok: false, error: 'invalid admin token' });
  }
  next();
}

// --- License wiring (as you had it) ---
const license = require('./lib/license');
license.loadAndValidate().then(s => console.log('License:', s.reason));

// Expose license status for UI (optional)
app.get('/api/license/status', (req, res) => res.json(license.getStatus()) );

// Require license for admin & scores
app.use('/api/admin', (req, res, next) => {
  const s = license.getStatus();
  if (!s.ok) return res.status(403).json({ error: 'License invalid: ' + s.reason });
  next();
});
app.use('/api/scores', (req, res, next) => {
  const s = license.getStatus();
  if (!s.ok) return res.status(403).json({ error: 'License invalid: ' + s.reason });
  next();
});

/* -------------------- Global middleware -------------------- */
// CORS allowlist via env: CORS_ORIGIN="http://localhost:3000,https://your.site"
const ALLOW = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (ALLOW.length) {
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || ALLOW.includes(origin)) return cb(null, origin);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: false
  }));
} else {
  app.use(cors());
}

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Static assets
app.use('/data', express.static(join('data'))); // expose JSON for preview (disable for prod if you like)
app.use(express.static(join('public')));
app.use('/ui', express.static(join('ui')));

// Fix old encoded URLs (legacy)
app.use((req, res, next) => {
  if (req.url.includes('%3F') || req.url.includes('%26')) {
    const fixed = req.url.replace(/%3F/gi, '?').replace(/%26/gi, '&');
    return res.redirect(fixed);
  }
  next();
});

/* -------------------- /api/config (NEW) -------------------- */
// Public GET: players & UI read season info
app.get('/api/config', (_req, res) => {
  res.json(readConfig());
});

// Admin POST: save season settings etc.
app.post('/api/config', requireAdminToken, (req, res) => {
  const prev = readConfig();
  const next = {
    ...prev,
    ...req.body,
  };

  // coercions/sanity
  if ('total_weeks' in req.body) {
    next.total_weeks = Math.max(1, parseInt(req.body.total_weeks, 10) || prev.total_weeks);
  }
  if ('current_week' in req.body) {
    next.current_week = Math.max(1, parseInt(req.body.current_week, 10) || prev.current_week);
  }
  if ('lock_minutes_before_kickoff' in req.body) {
    next.lock_minutes_before_kickoff = Math.max(0, parseInt(req.body.lock_minutes_before_kickoff, 10) || 0);
  }
  if ('season' in req.body) {
    next.season = parseInt(req.body.season, 10) || prev.season;
  }
  if ('deadline_mode' in req.body) {
    next.deadline_mode = (req.body.deadline_mode === 'per_match') ? 'per_match' : 'first_kickoff';
  }
  if ('timezone' in req.body) {
    next.timezone = String(req.body.timezone || prev.timezone);
  }

  writeConfig(next);
  res.json({ ok: true, config: next });
});

/* -------------------- Safe require + mount -------------------- */
function safeRequire(label, p) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return { ok: true, mod: require(p) };
  } catch (e) {
    console.warn(`⚠️  Skipping ${label}:`, e.message);
    return { ok: false, mod: null };
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
  // Fallback public fixtures: returns plain array for week
  app.get('/api/fixtures', (req, res) => {
    const cfg = readConfig();
    const week = Math.max(1, parseInt(req.query.week, 10) || 1);
    const season = cfg.season || 2025;
    const fpath = join('data', 'fixtures', `season-${season}`, `week-${week}.json`);
    try {
      const txt = fs.readFileSync(fpath, 'utf8');
      const arr = JSON.parse(txt);
      if (Array.isArray(arr)) return res.json(arr);
      // If file contains {fixtures:[...]} normalize to array
      if (arr && Array.isArray(arr.fixtures)) return res.json(arr.fixtures);
      return res.json([]);
    } catch {
      return res.json([]); // 200 with empty array keeps client happy
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

// Scores
const scores = safeRequire('./routes/scores.js', './routes/scores');
if (scores.ok) {
  mount('./routes/scores.js', '/api/scores', scores.mod);
  mount('./routes/scores.js', '/scores', scores.mod);
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

// Admin (guarded via license middleware above; token checks inside route impl)
const admin = safeRequire('./routes/admin.js', './routes/admin');
if (admin.ok) {
  mount('./routes/admin.js', '/api/admin', admin.mod);
}

/* -------------------- Diagnostics -------------------- */
app.get('/api/__health', (_req, res) => res.json({ ok: true, mounted }));
app.get('/api/__routes', (_req, res) => res.json(mounted));

/* -------------------- Map legacy UI pages -------------------- */
['Part_A_PIN.html', 'Part_B_Predictions.html', 'Part_D_Scoring.html', 'Part_E_Season.html']
  .forEach(page => {
    app.get('/' + page, (_req, res) => res.sendFile(join('public', page)));
  });

/* -------------------- Root -------------------- */
app.get('/', (_req, res) => res.redirect('/Part_A_PIN.html'));

/* -------------------- Listen -------------------- */
app.listen(PORT, () => {
  console.log(`✅ MatchM8 listening on http://localhost:${PORT}`);
});
