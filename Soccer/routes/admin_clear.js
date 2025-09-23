// routes/admin_clear.js — admin-only helpers to clear saved weekly scores & totals (per tenant+competition)

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

router.use(express.json({ limit: '256kb' }));

/* ----- helpers bound to the current tenant+competition (req.ctx is set in index.js) ----- */
function dataDir(req) {
  return req?.ctx?.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
}
function scoresDir(req) {
  return path.join(dataDir(req), 'scores');
}
function weeksDir(req) {
  return path.join(scoresDir(req), 'weeks');
}
function rmIfExists(p) {
  try { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); } catch {}
}
function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

/* 
 * POST /api/admin/scores/clear-week?week=N
 * Deletes scores/weeks/week-N.json and recomputes season-totals (by wiping totals files).
 * Does NOT touch fixtures/predictions/results.
 */
router.post('/scores/clear-week', (req, res) => {
  const week = Math.max(1, parseInt(req.query.week, 10) || 1);

  const WEEKS = weeksDir(req);
  const SCO   = scoresDir(req);
  ensureDir(WEEKS);

  const weekFile = path.join(WEEKS, `week-${week}.json`);
  rmIfExists(weekFile);

  // wipe totals so the next compute (or summary) rebuilds from remaining week files
  rmIfExists(path.join(SCO, 'season-totals.json'));
  rmIfExists(path.join(SCO, 'season-totals.legacy.json'));
  rmIfExists(path.join(SCO, 'champion.json'));

  return res.json({
    ok: true,
    cleared: [`scores/weeks/week-${week}.json`],
    totalsReset: true
  });
});

/*
 * POST /api/admin/scores/clear-all
 * Removes scores/weeks/* and season totals files for the current comp.
 * Pass confirm=YES to avoid accidents.
 */
router.post('/scores/clear-all', (req, res) => {
  const confirm = String(req.query.confirm || req.body?.confirm || '').toUpperCase();
  if (confirm !== 'YES') {
    return res.status(400).json({ ok: false, error: 'confirm=YES required' });
  }

  const WEEKS = weeksDir(req);
  const SCO   = scoresDir(req);
  ensureDir(WEEKS);

  rmIfExists(WEEKS);                 // nukes the whole weeks folder
  ensureDir(WEEKS);                  // recreate clean
  rmIfExists(path.join(SCO, 'season-totals.json'));
  rmIfExists(path.join(SCO, 'season-totals.legacy.json'));
  rmIfExists(path.join(SCO, 'champion.json'));

  return res.json({
    ok: true,
    cleared: ['scores/weeks/*', 'scores/season-totals.json', 'scores/season-totals.legacy.json', 'scores/champion.json']
  });
});

module.exports = router;
