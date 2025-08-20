const express = require('express');
const fs = require('fs');
const path = require('path');
const { ensureDir } = require('../lib/file-utils');
const { sendReceiptEmail } = require('../lib/mailer');

const router = express.Router();
const DATA_ROOT = path.join(__dirname, '../data');

/** Utilities **/
function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}
function writeJsonAtomic(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}
function getFixturesCount(week) {
  const fixturesPath = path.join(DATA_ROOT, `fixtures/season-2025/week-${week}.json`);
  const arr = readJson(fixturesPath, []);
  return Array.isArray(arr) ? arr.length : 0;
}
function findPlayerByName(name) {
  const players = readJson(path.join(DATA_ROOT, 'players.json'), []);
  return players.find(p => p && typeof p.name === 'string' && p.name.toLowerCase() === String(name).toLowerCase());
}

/**
 * Core write used by both endpoints.
 */
async function savePredictions({ week, player_id, predictions }) {
  if (!week) throw new Error('week required');
  if (!player_id) throw new Error('player_id required');
  if (!Array.isArray(predictions)) throw new Error('predictions must be array');

  const filePath = path.join(DATA_ROOT, `predictions/week-${week}.json`);
  await ensureDir(path.dirname(filePath));

  const data = readJson(filePath, {});
  const prev = data[player_id] || {};
  data[player_id] = {
    predictions,
    submitted_at: new Date().toISOString(),
    email_sent_at: prev.email_sent_at || null
  };

  writeJsonAtomic(filePath, data);

  // Optional: send receipt if full set (no spam if already sent)
  const fixtureCount = getFixturesCount(week);
  if (fixtureCount && predictions.length === fixtureCount && !data[player_id].email_sent_at) {
    try {
      const players = readJson(path.join(DATA_ROOT, 'players.json'), []);
      const player = players.find(p => p.id === player_id);
      if (player && player.email) {
        await sendReceiptEmail(player.email, week, predictions);
        data[player_id].email_sent_at = new Date().toISOString();
        writeJsonAtomic(filePath, data);
      }
    } catch (_) {}
  }
}

/**
 * POST /api/predictions?week=1
 * Body: { player_id, predictions }
 */
router.post('/', async (req, res) => {
  try {
    const week = req.query.week;
    const { player_id, predictions } = req.body || {};
    await savePredictions({ week, player_id, predictions });
    res.sendStatus(200);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'bad request' });
  }
});

/**
 * POST /api/predictions/save
 * Body: { name, week, predictions }
 * Compatibility wrapper for the UI that submits by player name.
 */
router.post('/save', async (req, res) => {
  try {
    const { name, week, predictions } = req.body || {};
    if (!name) throw new Error('name required');
    const player = findPlayerByName(name);
    if (!player) throw new Error('unknown player');
    await savePredictions({ week, player_id: player.id, predictions });
    res.sendStatus(200);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'bad request' });
  }
});

module.exports = router;
