// routes/auth.js Ã¢â‚¬" bcrypt PIN set/verify/change (back-compatible) + whoami cookies
const express = require('express');
const path = require('path');
const { readFile } = require('fs/promises');
const bcrypt = require('bcryptjs');
const { writeJsonAtomic } = require('../utils/atomicJson');

const router = express.Router();
const PLAYERS = path.join(__dirname, '..', 'data', 'players.json');

async function loadPlayers() {
  try { return JSON.parse(await readFile(PLAYERS, 'utf8')); }
  catch { return []; }
}
async function savePlayers(list) { await writeJsonAtomic(PLAYERS, list); }

// Helpers
const asId = v => v != null ? String(v) : undefined;
const isValidPin = v => typeof v === 'string' ? v.trim().length >= 4 : String(v||'').length >= 4;

// ---- NEW: cookie helpers for whoami/personalization ----
const isProd = process.env.NODE_ENV === 'production';
function setWhoamiCookies(res, player) {
  // lightweight, non-HttpOnly so front-end can read (used only for display)
  const base = { sameSite: 'Lax', httpOnly: false, secure: isProd, maxAge: 180*24*60*60*1000 }; // ~180 days
  res.cookie('player_id',   String(player.id),   base);
  res.cookie('player_name', String(player.name), base);
}
function clearWhoamiCookies(res) {
  const base = { sameSite: 'Lax', httpOnly: false, secure: isProd };
  res.clearCookie('player_id', base);
  res.clearCookie('player_name', base);
}
// -------------------------------------------------------

/**
 * POST /api/auth/pin/set
 * body: { player_id? | name?, pin }
 * Sets a PIN only if one isn't already set for that player.
 */
router.post('/pin/set', express.json(), async (req, res) => {
  const { player_id, name, pin } = req.body || {};
  if (!isValidPin(pin)) return res.status(400).json({ error: 'PIN must be at least 4 characters' });

  const players = await loadPlayers();
  const idx = players.findIndex(p => (player_id && asId(p.id) === asId(player_id)) || (name && p.name === name));
  if (idx < 0) return res.status(404).json({ error: 'player not found' });

  if (players[idx].pin_hash) return res.status(409).json({ error: 'PIN already set' });

  players[idx].pin_hash = await bcrypt.hash(String(pin), 10);
  delete players[idx].pin; // remove any legacy plaintext field
  players[idx].pin_updated_at = new Date().toISOString();
  await savePlayers(players);
  res.json({ ok: true, id: players[idx].id, name: players[idx].name });
});

/**
 * POST /api/auth/pin/verify
 * body: { player_id? | name?, pin }
 * Verifies a player's PIN; if legacy plaintext `pin` exists and matches, migrates to hash.
 * NEW: sets cookies (player_id, player_name) for personalization (/api/auth/whoami).
 */
router.post('/pin/verify', express.json(), async (req, res) => {
  const { player_id, name, pin } = req.body || {};
  const players = await loadPlayers();
  const p = players.find(u => (player_id && asId(u.id) === asId(player_id)) || (name && u.name === name));
  if (!p) return res.status(404).json({ error: 'player not found' });

  // Back-compat: migrate on first successful verify
  if (p.pin && String(pin) === String(p.pin)) {
    p.pin_hash = await bcrypt.hash(String(pin), 10);
    delete p.pin;
    p.pin_updated_at = new Date().toISOString();
    await savePlayers(players);
    setWhoamiCookies(res, p); // <-- NEW
    return res.json({ ok: true, id: p.id, name: p.name });
  }

  if (!p.pin_hash) return res.status(400).json({ error: 'no PIN set' });
  const ok = await bcrypt.compare(String(pin || ''), p.pin_hash);
  if (!ok) return res.status(401).json({ error: 'invalid PIN' });

  // success
  setWhoamiCookies(res, p); // <-- NEW
  return res.json({ ok: true, id: p.id, name: p.name });
});

/**
 * POST /api/auth/pin/change
 * body: { player_id? | name?, old_pin, new_pin }
 */
router.post('/pin/change', express.json(), async (req, res) => {
  const { player_id, name, old_pin, new_pin } = req.body || {};
  if (!isValidPin(new_pin)) return res.status(400).json({ error: 'New PIN must be at least 4 characters' });

  const players = await loadPlayers();
  const idx = players.findIndex(u => (player_id && asId(u.id) === asId(player_id)) || (name && u.name === name));
  if (idx < 0) return res.status(404).json({ error: 'player not found' });

  const p = players[idx];
  let ok = false;
  if (p.pin_hash) {
    ok = await bcrypt.compare(String(old_pin || ''), p.pin_hash);
  } else if (p.pin) {
    ok = String(old_pin) === String(p.pin);
  }
  if (!ok) return res.status(401).json({ error: 'old PIN incorrect' });

  p.pin_hash = await bcrypt.hash(String(new_pin), 10);
  delete p.pin;
  p.pin_updated_at = new Date().toISOString();
  await savePlayers(players);

  // keep cookies in sync with the same identity
  setWhoamiCookies(res, p); // optional
  res.json({ ok: true, id: p.id, name: p.name });
});

/**
 * NEW: GET /api/auth/whoami
 * Returns { ok:true, player:{id,name} } if cookies are present, else 401.
 * Used by /public/hero.js to render "<Name>'s Predictions".
 */
router.get('/whoami', (req, res) => {
  const id = req.cookies?.player_id;
  const name = req.cookies?.player_name;
  if (id && name) return res.json({ ok: true, player: { id, name } });
  return res.status(401).json({ ok: false });
});

/**
 * NEW: POST /api/auth/logout
 * Clears whoami cookies.
 */
router.post('/logout', (_req, res) => {
  clearWhoamiCookies(res);
  res.json({ ok: true });
});

module.exports = router;
