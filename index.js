// index.js — MatchM8 server (final)

// ------------- Load & sanitize environment -------------
const path = require('path');
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
const join = (...p) => path.join(__dirname, ...p);
app.use('/data', express.static(join('data')));      // expose JSON for preview
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

// Fixtures
const fixtures = safeRequire('./routes/fixtures.js', './routes/fixtures');
if (fixtures.ok) {
  mount('./routes/fixtures.js', '/api/fixtures', fixtures.mod);
  mount('./routes/fixtures.js', '/fixtures', fixtures.mod);
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

// Players (new)
const players = safeRequire('./routes/players.js', './routes/players');
if (players.ok) {
  mount('./routes/players.js', '/api/players', players.mod);
  mount('./routes/players.js', '/players', players.mod);
}

// Admin (guarded via header)
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
