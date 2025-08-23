// routes/players.js — self-signup + name checks + demo cap
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { writeJsonAtomic } = require('../utils/atomicJson');
const license = require('../lib/license');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const PLAYERS_PATH = path.join(DATA_DIR, 'players.json');

// ---------- helpers ----------
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
async function loadPlayers() {
  try { return JSON.parse(await fs.promises.readFile(PLAYERS_PATH, 'utf8')); }
  catch { return []; }
}
async function savePlayers(list) {
  ensureDataDir();
  await writeJsonAtomic(PLAYERS_PATH, list);
}
function normName(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
function emailLooksValid(s) { return !!String(s||'').match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/); }
function sameName(a,b){ return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0; }

// Demo/License cap (take the stricter)
const DEMO_CAP = parseInt(process.env.DEMO_PLAYERS_MAX || '', 10);
function effectivePlayerCap() {
  const st = (license && license.getStatus && license.getStatus()) ? license.getStatus() : {};
  const licCap = (st && st.license && Number.isFinite(st.license.max_players)) ? st.license.max_players : undefined;

  if (Number.isFinite(DEMO_CAP) && Number.isFinite(licCap)) return Math.min(DEMO_CAP, licCap);
  if (Number.isFinite(DEMO_CAP)) return DEMO_CAP;
  if (Number.isFinite(licCap)) return licCap;
  return Infinity;
}

// ---------- GET /api/players/check-name?name=Foo ----------
router.get('/check-name', async (req, res) => {
  const name = normName(req.query.name || '');
  if (!name) return res.status(400).json({ ok:false, error:'name_required' });

  const players = await loadPlayers();
  const exists = players.some(p => sameName(normName(p.name), name));
  return res.json({ ok:true, available: !exists });
});

// ---------- POST /api/players/register ----------
/*
  body: { name, email?, pin, invite_code? }
  Errors (strings aligned with your UI):
    - self_signup_disabled (403)
    - license_invalid (403)
    - name_taken (409)
    - pin_too_short (400)
    - email_invalid_or_domain (400)
    - bad_invite_code (403)
    - max_players_reached (403)
*/
router.post('/register', express.json(), async (req, res) => {
  const ALLOW_SELF_SIGNUP = String(process.env.ALLOW_SELF_SIGNUP || '').toLowerCase() === 'true';
  if (!ALLOW_SELF_SIGNUP) return res.status(403).json({ ok:false, error:'self_signup_disabled' });

  // License must be valid
  const st = license.getStatus ? license.getStatus() : { ok:true };
  if (!st.ok) return res.status(403).json({ ok:false, error:'license_invalid' });

  const { name, email, pin, invite_code } = req.body || {};
  const cleanedName = normName(name);

  if (!cleanedName) return res.status(400).json({ ok:false, error:'name_required' });
  if ((String(pin || '')).trim().length < 4) return res.status(400).json({ ok:false, error:'pin_too_short' });

  // Optional invite code requirement
  const REQUIRED_INVITE = (process.env.INVITE_CODE || '').trim();
  if (REQUIRED_INVITE && String(invite_code || '').trim() !== REQUIRED_INVITE) {
    return res.status(403).json({ ok:false, error:'bad_invite_code' });
  }

  // Optional email domain whitelist
  const DOMAIN = (process.env.WHITELIST_EMAIL_DOMAIN || '').trim(); // e.g. "club.com"
  if (email) {
    if (!emailLooksValid(email)) return res.status(400).json({ ok:false, error:'email_invalid_or_domain' });
    if (DOMAIN && !String(email).toLowerCase().endsWith('@' + DOMAIN.toLowerCase())) {
      return res.status(400).json({ ok:false, error:'email_invalid_or_domain' });
    }
  }

  const players = await loadPlayers();

  // Enforce max players (demo cap + license cap; uses stricter)
  const activeCount = players.filter(p => !p.deleted).length;
  const cap = effectivePlayerCap();
  if (activeCount >= cap) {
    return res.status(403).json({ ok:false, error:'max_players_reached' });
  }

  // Unique name (case-insensitive, accent-insensitive-ish)
  const taken = players.some(p => sameName(normName(p.name), cleanedName));
  if (taken) return res.status(409).json({ ok:false, error:'name_taken' });

  // Create new player
  const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2,8);
  const pin_hash = await bcrypt.hash(String(pin), 10);

  const record = {
    id,
    name: cleanedName,
    email: email ? String(email).trim() : undefined,
    pin_hash,
    created_at: new Date().toISOString()
  };

  players.push(record);
  await savePlayers(players);

  return res.json({ ok:true, id, name: cleanedName });
});

module.exports = router;
