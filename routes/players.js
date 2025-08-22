// routes/players.js — public player registration (with license + env guards)
const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');            // already in your deps
const { writeJsonAtomic } = require('../utils/atomicJson');
const license = require('../lib/license');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const PLAYERS_PATH = path.join(DATA_DIR, 'players.json');

function envFlag(name, def=false) {
  const v = String(process.env[name] || '').trim().toLowerCase();
  if (!v) return def;
  return ['1','true','yes','y','on'].includes(v);
}
const ALLOW_SELF_SIGNUP = envFlag('ALLOW_SELF_SIGNUP', false);
const INVITE_CODE_REQ   = (process.env.INVITE_CODE || '').trim();
const EMAIL_DOMAIN      = (process.env.WHITELIST_EMAIL_DOMAIN || '').trim().toLowerCase();

async function loadPlayers() {
  try { return JSON.parse(await fs.readFile(PLAYERS_PATH, 'utf8')); }
  catch { return []; }
}
async function savePlayers(list) {
  await fs.mkdir(path.dirname(PLAYERS_PATH), { recursive: true });
  await writeJsonAtomic(PLAYERS_PATH, list);
}
function normName(s=''){ return s.trim().replace(/\s+/g,' '); }

function emailLooksOk(e='') {
  if (!e) return true;
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  if (!ok) return false;
  if (!EMAIL_DOMAIN) return true;
  return e.toLowerCase().endsWith('@'+EMAIL_DOMAIN);
}

/* ---------- POST /api/players/register ---------- */
router.post('/register', express.json(), async (req,res) => {
  try {
    if (!ALLOW_SELF_SIGNUP) return res.status(403).json({ ok:false, error:'self_signup_disabled' });

    const s = license.getStatus();
    if (!s.ok) return res.status(403).json({ ok:false, error:'license_invalid', reason:s.reason });

    const { name, email='', pin, invite_code='' } = req.body || {};
    const n = normName(String(name||''));
    const p = String(pin||'');

    if (INVITE_CODE_REQ && invite_code !== INVITE_CODE_REQ)
      return res.status(401).json({ ok:false, error:'bad_invite_code' });

    if (n.length < 2 || n.length > 60) return res.status(400).json({ ok:false, error:'name_length' });
    if (!/^[\p{L}\p{N} .,'-]+$/u.test(n)) return res.status(400).json({ ok:false, error:'name_chars' });
    if (p.length < 4) return res.status(400).json({ ok:false, error:'pin_too_short' });
    if (!emailLooksOk(email)) return res.status(400).json({ ok:false, error:'email_invalid_or_domain' });

    const players = await loadPlayers();

    // Enforce max players from license (ignore the special "Admin" if present)
    const activePlayers = players.filter(u => (u.name||'').toLowerCase() !== 'admin');
    const max = Number((s.license && s.license.max_players) || 0);
    if (max && activePlayers.length >= max)
      return res.status(409).json({ ok:false, error:'max_players_reached', max });

    // No duplicate names (case-insensitive)
    const exists = players.some(u => (u.name||'').toLowerCase() === n.toLowerCase());
    if (exists) return res.status(409).json({ ok:false, error:'name_taken' });

    const id = 'p-' + uuidv4().slice(0,8);
    const pin_hash = await bcrypt.hash(p, 10);

    const record = { id, name: n, email: email || undefined, pin_hash, created_at: new Date().toISOString() };
    players.push(record);
    await savePlayers(players);

    res.json({ ok:true, id, name:n });
  } catch (e) {
    res.status(500).json({ ok:false, error:'server_error', detail:e.message });
  }
});

/* ---------- (Optional) GET /api/players/check-name?name=Vince ---------- */
router.get('/check-name', async (req,res)=>{
  const q = normName(String(req.query.name||''));
  if (!q) return res.json({ ok:true, available:false });
  const players = await loadPlayers();
  const taken = players.some(u => (u.name||'').toLowerCase() === q.toLowerCase());
  res.json({ ok:true, available: !taken });
});

module.exports = router;
