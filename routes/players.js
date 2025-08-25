// routes/players.js Ã¢â‚¬" self-signup + 5-player demo cap + license bypass

const express = require('express');
const path = require('path');
const { readFile } = require('fs/promises');
const bcrypt = require('bcryptjs');
const { writeJsonAtomic } = require('../utils/atomicJson');
const license = require('../lib/license');

const router = express.Router();
const PLAYERS = path.join(__dirname, '..', 'data', 'players.json');

// ---- env / config ----
const SKIP_LICENSE = String(process.env.DEMO_SKIP_LICENSE || '').toLowerCase() === 'true';
const ALLOW_SELF = String(process.env.ALLOW_SELF_SIGNUP || '').toLowerCase() === 'true';
const INVITE = (process.env.INVITE_CODE || '').trim();
const WHITELIST = (process.env.WHITELIST_EMAIL_DOMAIN || '').trim().toLowerCase();
const DEMO_CAP = parseInt(process.env.DEMO_PLAYERS_MAX || '', 10) || 0;

// ---- helpers ----
async function loadPlayers() {
  try { return JSON.parse(await readFile(PLAYERS, 'utf8')); }
  catch { return []; }
}
async function savePlayers(list) { await writeJsonAtomic(PLAYERS, list); }

function norm(s) { return String(s || '').trim(); }
function emailDomainOk(email) {
  if (!WHITELIST) return true;
  const e = String(email || '').toLowerCase();
  return e.endsWith('@' + WHITELIST);
}

// ---- lightweight listings ----
router.get('/', async (_req, res) => {
  const list = await loadPlayers();
  res.json(list.map(p => ({ id: p.id, name: p.name, has_pin: !!p.pin_hash })));
});

router.get('/check-name', async (req, res) => {
  const name = norm(req.query.name).toLowerCase();
  const list = await loadPlayers();
  res.json({ taken: !!list.find(p => p.name.toLowerCase() === name) });
});

// ---- self-signup (public, respects license unless demo skip) ----
router.post('/register', express.json(), async (req, res) => {
  const st = license.getStatus();
  if (!SKIP_LICENSE && !st.ok) return res.status(403).json({ error: 'license_invalid' });
  if (!ALLOW_SELF)            return res.status(403).json({ error: 'self_signup_disabled' });

  const name = norm(req.body?.name);
  const email = norm(req.body?.email);
  const pin   = norm(req.body?.pin);
  const invite = norm(req.body?.invite_code);

  if (!name)                    return res.status(400).json({ error: 'name_required' });
  if (pin.length < 4)           return res.status(400).json({ error: 'pin_too_short' });
  if (INVITE && invite !== INVITE) return res.status(403).json({ error: 'bad_invite_code' });
  if (email && !emailDomainOk(email)) return res.status(400).json({ error: 'email_invalid_or_domain' });

  const players = await loadPlayers();
  if (players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: 'name_taken' });
  }

  // player cap: use demo cap if set, else license max if present
  const maxPlayers = DEMO_CAP || (st.license && st.license.max_players) || Infinity;
  if (players.length >= maxPlayers) {
    return res.status(403).json({ error: 'max_players_reached' });
  }

  const id = String(Date.now());
  const pin_hash = await bcrypt.hash(pin, 10);
  players.push({
    id, name, email: email || undefined,
    pin_hash, created_at: new Date().toISOString()
  });
  await savePlayers(players);
  res.json({ ok: true, id, name });
});

module.exports = router;
