// routes/predictions.js — map storage + server-side per-match/first-kickoff locking
const express = require('express');
const path = require('path');
const fsp = require('fs/promises');

// ADD: TZ-aware lock helpers
const { isLocked, earliestKickoff, kickoffToLock } = require('../lib/time');

const router = express.Router();
router.use(express.json());

const DATA    = path.join(__dirname, '..', 'data');
const FIXDIR  = path.join(DATA, 'fixtures', 'season-2025');
const PREDDIR = path.join(DATA, 'predictions');
const CONFIG  = path.join(DATA, 'config.json');

const weekFile = (dir, w) => path.join(dir, `week-${w}.json`);

async function readJson(file, fb) { try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fb; } }
async function writeJson(file, obj) { await fsp.mkdir(path.dirname(file), { recursive: true }); await fsp.writeFile(file, JSON.stringify(obj, null, 2)); }

async function loadConfig() {
  const defaults = {
    season: 2025,
    total_weeks: 38,
    current_week: 1,
    // both keys tolerated; normalize below
    lock_minutes_before_kickoff: 10,
    lock_mins: undefined,
    deadline_mode: 'first_kickoff',
    timezone: 'Australia/Melbourne',
  };
  return { ...defaults, ...(await readJson(CONFIG, {})) };
}

function normalizeConfig(cfg) {
  // computeLockStatus expects lock_mins, deadline_mode, timezone
  const lock_mins = cfg.lock_mins ?? cfg.lock_minutes_before_kickoff ?? 0;
  const deadline_mode = (cfg.deadline_mode || 'first_kickoff').toLowerCase();
  const timezone = cfg.timezone || 'UTC';
  return { ...cfg, lock_mins, deadline_mode, timezone };
}

// ---- normalize helpers ----

// Accept either array or map from disk and return a MAP shape
function toMapShape(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw; // already map
  if (Array.isArray(raw)) {
    const m = {};
    for (const row of raw) {
      const pid = String(row.player_id || '').trim();
      if (!pid) continue;
      m[pid] = {
        player_id: pid,
        predictions: Array.isArray(row.predictions) ? row.predictions : [],
        submitted_at: row.submitted_at || null,
        email_sent_at: row.email_sent_at || null,
      };
    }
    return m;
  }
  return {};
}

// Normalize incoming predictions: [{id,home,away}] -> clean array
function normIncomingPreds(arr) {
  const out = [];
  for (const p of (Array.isArray(arr) ? arr : [])) {
    const id = String(p.id ?? p.match_id ?? p._id ?? '').trim();
    if (!id) continue;
    const home = clampInt(p.home, 0, 0);
    const away = clampInt(p.away, 0, 0);
    out.push({ id, home, away });
  }
  return out;
}

// int clamp helper
function clampInt(v, min, fb) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fb;
  const c = Math.max(min, n);
  // hard upper guard so folks don't type 999
  return Math.min(99, c);
}

// Merge predictions by id (updates existing, keeps others)
function mergePreds(existingArr, incomingArr) {
  const byId = new Map((existingArr || []).map(r => [String(r.id), { id: String(r.id), home: clampInt(r.home, 0, 0), away: clampInt(r.away, 0, 0) }]));
  for (const p of incomingArr) byId.set(String(p.id), { id: String(p.id), home: clampInt(p.home, 0, 0), away: clampInt(p.away, 0, 0) });
  return Array.from(byId.values());
}

// ---- routes ----

// Always returns a MAP: { player_id: { player_id, predictions, submitted_at, email_sent_at }, ... }
router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  const w = parseInt(req.query.week, 10);
  if (!Number.isFinite(w) || w <= 0) return res.status(400).json({ error: 'week required' });

  const file = weekFile(PREDDIR, w);
  const raw = await readJson(file, {});
  return res.json(toMapShape(raw));
});

// Handy: return just *this user's* predictions for a week
// GET /api/predictions/mine?week=N  (header x-player-id also accepted)
router.get('/mine', async (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  const w = parseInt(req.query.week, 10);
  if (!Number.isFinite(w) || w <= 0) return res.status(400).json({ error: 'week required' });

  const player_id = String(req.query.player_id || req.query.playerId || req.get('x-player-id') || '').trim();
  if (!player_id) return res.status(400).json({ error: 'player_id required' });

  const file = weekFile(PREDDIR, w);
  const raw = await readJson(file, {});
  const map = toMapShape(raw);
  const row = map[player_id] || { player_id, predictions: [], submitted_at: null, email_sent_at: null };

  return res.json({ ok: true, week: w, player_id, ...row });
});

// body: { week, predictions:[{id,home,away}], player_id? }  (header: x-player-id supported)
// - Enforces locking
// - Merges with existing predictions (partial saves won't wipe others)
// - Returns acceptedIds / skippedIds and lock info
router.post('/', async (req, res) => {
  const { week, predictions } = req.body || {};
  let { player_id } = req.body || {};
  const w = parseInt(week, 10);

  if (!Number.isFinite(w) || w <= 0) return res.status(400).json({ error: 'week required' });

  // ---- TZ-aware locking (first_kickoff) ----
const cfg = normalizeConfig(await loadConfig());
if (cfg.deadline_mode === 'first_kickoff') {
  const firstKO = earliestKickoff(cfg.season, w); // reads fixtures/season-<season>/week-<w>.json
  if (firstKO && isLocked(firstKO, cfg)) {
    const lockUtc = kickoffToLock(firstKO, cfg.lock_minutes_before_kickoff, cfg.timezone);
    return res.status(423).json({ ok: false, error: 'locked', lock_utc: lockUtc });
  }
}
// -------------------------------------------

  // find a player id (body → header → fallback)
  player_id = String(player_id || req.get('x-player-id') || '').trim();
  if (!player_id) {
    player_id = `anon-${Date.now()}`; // soft fallback
  }

  // Normalize incoming predictions
  const incoming = normIncomingPreds(predictions);
  if (!incoming.length) return res.status(400).json({ error: 'predictions must be a non-empty array with {id,home,away}' });

  // Load config + fixtures and compute locking
  const cfgRaw = await loadConfig();
  const config = normalizeConfig(cfgRaw);
  const fixtures = await readJson(weekFile(FIXDIR, w), []);
  const lockStatus = computeLockStatus(fixtures, config);

  // Enforce locking:
  if (lockStatus.mode === 'first_kickoff' && lockStatus.weekLocked) {
    return res.status(423).json({
      error: 'week_locked',
      message: 'This week is locked (first kickoff passed).',
      weekLockAtISO: lockStatus.weekLockAtISO
    });
  }

  // If per_match, drop locked rows and accept the rest
  const accepted = [];
  const skippedIds = [];
  const acceptedIds = [];

  if (lockStatus.mode === 'per_match') {
    for (const p of incoming) {
      const mid = String(p.id);
      const entry = lockStatus.map[mid];
      if (entry?.locked) skippedIds.push(mid);
      else { accepted.push(p); acceptedIds.push(mid); }
    }
    if (accepted.length === 0) {
      return res.status(423).json({
        error: 'all_rows_locked',
        message: 'All selected matches are locked.',
        skippedIds
      });
    }
  } else {
    // first_kickoff but still unlocked → accept all incoming
    for (const p of incoming) { accepted.push(p); acceptedIds.push(String(p.id)); }
  }

  // Persist (map keyed by player_id) — MERGE with existing picks
  const file = weekFile(PREDDIR, w);
  const raw = await readJson(file, {});
  const map = toMapShape(raw);

  const prev = map[player_id]?.predictions || [];
  const next = mergePreds(prev, accepted);

  map[player_id] = {
    player_id,
    predictions: next,
    submitted_at: new Date().toISOString(),
    email_sent_at: map[player_id]?.email_sent_at ?? null,
  };

  await writeJson(file, map);

  res.json({
    ok: true,
    week: w,
    player_id,
    savedCount: accepted.length,
    acceptedIds,
    skippedIds,
    mode: lockStatus.mode,
    weekLocked: !!lockStatus.weekLocked,
    weekLockAtISO: lockStatus.weekLockAtISO ?? null
  });
});

module.exports = router;
