// routes/config.js
const fs = require('fs');
const path = require('path');
const express = require('express');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CFG_PATH = path.join(DATA_DIR, 'config.json');

// sensible defaults
const DEFAULTS = {
  season: 2025,
  total_weeks: 38,
  current_week: 1,
  lock_minutes_before_kickoff: 10,
  deadline_mode: 'first_kickoff',
  timezone: 'Australia/Melbourne'
};

function readConfig() {
  try {
    const raw = fs.readFileSync(CFG_PATH, 'utf8');
    const obj = JSON.parse(raw);
    return { ...DEFAULTS, ...obj };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeConfig(obj) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CFG_PATH, JSON.stringify(obj, null, 2));
}

module.exports = function makeConfigRouter({ requireAdminToken }) {
  const router = express.Router();

  // Public GET
  router.get('/', (_req, res) => {
    return res.json(readConfig());
  });

  // Admin POST
  router.post('/', requireAdminToken, (req, res) => {
    const prev = readConfig();
    const next = {
      ...prev,
      ...req.body,
      // coercions / guards
      total_weeks: Number(req.body.total_weeks ?? prev.total_weeks) || prev.total_weeks,
      current_week: Number(req.body.current_week ?? prev.current_week) || prev.current_week,
      lock_minutes_before_kickoff:
        Number(req.body.lock_minutes_before_kickoff ?? prev.lock_minutes_before_kickoff) || 0,
    };
    writeConfig(next);
    return res.json({ ok: true, config: next });
  });

  return router;
};
