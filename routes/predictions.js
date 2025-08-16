// routes/predictions.js
// Express router for MatchM8 predictions (per-fixture lock inside the handler)

const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const router = express.Router();

const { loadFixturesForWeek } = require('../lib/fixtures');
const { isLocked } = require('../lib/time');

// ---------- File paths
const DATA_DIR          = path.join(__dirname, '..', 'data');
const PREDICTIONS_PATH  = path.join(DATA_DIR, 'predictions.json');
const PLAYERS_PATH      = path.join(DATA_DIR, 'players.json');

// ---------- Env toggles
// DEV_BYPASS_LOCK=1 to allow late predictions during local dev
const DEV_BYPASS_LOCK   = process.env.DEV_BYPASS_LOCK === '1';
// REQUIRE_PIN=1 to require a PIN to save predictions
const REQUIRE_PIN       = process.env.REQUIRE_PIN === '1';

// ---------- Utilities
function readJsonFlexible(p, fallback) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return fallback;
}
function writeJsonPretty(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}
function normalizeName(s) {
  return (s || '').trim();
}

// Load players for optional PIN validation
function loadPlayersMap() {
  const arr = readJsonFlexible(PLAYERS_PATH, []) || [];
  const map = new Map();
  for (const item of arr) {
    if (typeof item === 'string') {
      map.set(item.trim().toLowerCase(), { name: item.trim(), email: '' });
    } else if (item && item.name) {
      map.set(item.name.trim().toLowerCase(), item);
    }
  }
  return map;
}

// Shape predictions storage canonically as: { [week]: { [playerName]: [ { fixture_id, home, away } ] } }
function loadPredictionsCanonical() {
  const raw = readJsonFlexible(PREDICTIONS_PATH, {});
  const canon = {};

  // Case A: object keyed by week: { "1":[...], "2":[...] }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [w, arr] of Object.entries(raw)) {
      if (!Array.isArray(arr)) continue;
      canon[w] = canon[w] || {};
      for (const rec of arr) {
        const name = normalizeName(rec.playerName || rec.name || '');
        if (!name) continue;
        canon[w][name] = canon[w][name] || [];
        // keep minimal fields; copy unknowns through to be safe
        canon[w][name].push({ ...rec });
      }
    }
    return canon;
  }

  // Case B: array of rows with week+playerName
  if (Array.isArray(raw)) {
    for (const rec of raw) {
      const w = String(rec.week ?? '');
      const name = normalizeName(rec.playerName || rec.name || '');
      if (!w || !name) continue;
      canon[w] = canon[w] || {};
      canon[w][name] = canon[w][name] || [];
      canon[w][name].push({ ...rec });
    }
    return canon;
  }

  // Otherwise empty
  return {};
}

function dumpPredictionsFromCanonical(canon) {
  // Save back in a simple keyed-by-week array form to avoid blowing up file size:
  // { "1": [ ... ], "2": [ ... ] }
  const out = {};
  for (const [w, byPlayer] of Object.entries(canon)) {
    out[w] = out[w] || [];
    for (const [name, rows] of Object.entries(byPlayer)) {
      for (const rec of rows) {
        out[w].push({ playerName: name, ...rec });
      }
    }
  }
  writeJsonPretty(PREDICTIONS_PATH, out);
}

// Basic predictions payload validator
function validatePredictionsArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return 'predictions must be a non-empty array';
  }
  for (const p of arr) {
    if (p == null || typeof p !== 'object') return 'prediction entries must be objects';
    if (p.fixture_id == null) return 'each prediction requires fixture_id';
    // Optional score fields; allow strings or numbers
  }
  return null;
}

// Optional PIN verify (only if REQUIRE_PIN=1)
async function verifyPinIfRequired(playerName, pin) {
  if (!REQUIRE_PIN) return null; // no error
  if (!pin) return 'PIN required';

  const players = loadPlayersMap();
  const key = playerName.trim().toLowerCase();
  const pl = players.get(key);
  if (!pl) return 'Unknown player';

  // Accept either plaintext pin stored as "pin" OR hashed pin as "pinHash"
  if (pl.pinHash) {
    const ok = await bcrypt.compare(String(pin), String(pl.pinHash));
    return ok ? null : 'Invalid PIN';
  }
  if (pl.pin) {
    return String(pl.pin) === String(pin) ? null : 'Invalid PIN';
  }
  // If no pin on record, treat as failure (or change to allow if desired)
  return 'PIN not set for this player';
}

// ------------------- Routes -------------------

/**
 * Get current user's predictions for a week
 * GET /predictions/mine?week=1&player=Vince
 */
router.get('/mine', (req, res) => {
  const week = String(req.query.week || '');
  const player = normalizeName(req.query.player);
  if (!week) return res.status(400).json({ error: 'week required' });
  if (!player) return res.status(400).json({ error: 'player required' });

  const canon = loadPredictionsCanonical();
  const rows = (canon[week]?.[player]) || [];
  res.json({ week: Number(week), player, predictions: rows });
});

/**
 * Save predictions (creates/overwrites only the fixtures present in payload)
 * POST /predictions/save
 * body: { week, player, pin?, predictions: [{ fixture_id, home, away, ... }] }
 */
router.post('/save', express.json(), async (req, res) => {
  try {
    const { week, player, pin, predictions } = req.body || {};
    if (!week)  return res.status(400).json({ error: 'week required' });
    if (!player) return res.status(400).json({ error: 'player required' });

    const playerName = normalizeName(player);

    // Optional PIN check
    const pinErr = await verifyPinIfRequired(playerName, pin);
    if (pinErr) return res.status(401).json({ error: pinErr });

    // Validate predictions payload
    const err = validatePredictionsArray(predictions);
    if (err) return res.status(400).json({ error: err });

    // Load fixtures for lock checks
    const fx = loadFixturesForWeek(week);
    if (!fx || !fx.length) return res.status(400).json({ error: 'Unknown week' });

    // Build map: fixture_id -> kickoff (ISO)
    const kickoffMap = new Map(
      fx.map(f => [String(f.id ?? f.fixture_id), f.kickoff])
    );

    // Enforce lock unless explicitly bypassed for dev
    if (!DEV_BYPASS_LOCK) {
      for (const p of predictions) {
        const ko = kickoffMap.get(String(p.fixture_id));
        if (!ko || Number.isNaN(new Date(ko).getTime())) {
          return res.status(400).json({ error: 'Unknown or invalid fixture kickoff', fixture_id: p.fixture_id });
        }
        if (isLocked(ko)) {
          return res.status(403).json({
            error: 'Predictions closed for one or more fixtures',
            fixture_id: p.fixture_id,
            kickoff: new Date(ko).toISOString(),
          });
        }
      }
    }

    // Merge/upsert predictions for this player & week
    const canon = loadPredictionsCanonical();
    const w = String(week);
    canon[w] = canon[w] || {};
    const existing = new Map((canon[w][playerName] || []).map(e => [String(e.fixture_id), e]));

    const nowISO = new Date().toISOString();

    for (const p of predictions) {
      const k = String(p.fixture_id);
      const merged = { ...(existing.get(k) || {}), ...p, updated_at: nowISO, playerName };
      existing.set(k, merged);
    }

    canon[w][playerName] = Array.from(existing.values());

    // Persist
    dumpPredictionsFromCanonical(canon);

    return res.json({ ok: true, saved: predictions.length });
  } catch (e) {
    console.error('[predictions/save] error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
