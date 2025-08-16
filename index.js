require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  if (req.url.includes('%3F') || req.url.includes('%26')) {
    const fixed = req.url.replace(/%3F/gi, '?').replace(/%26/gi, '&');
    return res.redirect(302, fixed);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/ui', express.static(path.join(__dirname, 'ui')));

const mounted = [];
function safeRequire(label, relPath) {
  try {
    const mod = require(relPath);
    if (!mod) throw new Error('module.exports is falsy');
    return { ok: true, mod };
  } catch (e) {
    console.error(`[BOOT] Failed to require ${label} (${relPath}): ${e.message}`);
    mounted.push(`${label} FAILED: ${e.message}`);
    return { ok: false, mod: null };
  }
}
function mount(label, base, router) {
  try {
    app.use(base, router);
    mounted.push(`${label} -> ${base}`);
    console.log(`[BOOT] mounted ${label} at ${base}`);
  } catch (e) {
    console.error(`[BOOT] Failed to mount ${label} at ${base}: ${e.message}`);
    mounted.push(`${label} MOUNT FAILED at ${base}: ${e.message}`);
  }
}

try {
  const adminRoutes = require('./routes/admin');
  app.use('/admin', adminRoutes);
  console.log('[BOOT] admin routes mounted at /admin');
} catch (e) {
  console.error('[BOOT] admin routes FAILED:', e.message);
}

try {
  const { scheduleReminders } = require('./jobs/reminders');
  if (typeof scheduleReminders === 'function') {
    scheduleReminders();
    console.log('[BOOT] reminders scheduled');
  } else {
    console.warn('[BOOT] reminders not scheduled (export missing)');
  }
} catch (e) {
  console.error('[BOOT] reminders FAILED:', e.message);
}

const fixtures = safeRequire('./routes/fixtures.js', './routes/fixtures');
if (fixtures.ok) {
  mount('./routes/fixtures.js', '/api/fixtures', fixtures.mod);
  mount('./routes/fixtures.js', '/fixtures', fixtures.mod);
}

const predictions = safeRequire('./routes/predictions.js', './routes/predictions');
if (predictions.ok) {
  mount('./routes/predictions.js', '/api/predictions', predictions.mod);
  mount('./routes/predictions.js', '/predictions', predictions.mod);
}

const scores = safeRequire('./routes/scores.js', './routes/scores');
if (scores.ok) {
  mount('./routes/scores.js', '/api/scores', scores.mod);
  mount('./routes/scores.js', '/scores', scores.mod);
}

const auth = safeRequire('./routes/auth.js', './routes/auth');
if (auth.ok) {
  mount('./routes/auth.js', '/api/auth', auth.mod);
  mount('./routes/auth.js', '/auth', auth.mod);
}

app.get(['/api/health', '/health'], (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});
app.get(['/api/__routes', '/__routes'], (_req, res) => {
  res.json({ mounted });
});

['Part_A_PIN.html', 'Part_B_Predictions.html', 'Part_D_Scoring.html', 'Part_E_Season.html']
  .forEach(page => {
    app.get('/' + page, (_req, res) => {
      res.sendFile(path.join(__dirname, 'public', page));
    });
  });

app.get('/', (_req, res) => res.redirect('/Part_A_PIN.html'));

app.listen(PORT, () => {
  console.log(`MatchM8 listening on http://localhost:${PORT}`);
});
