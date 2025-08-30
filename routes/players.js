// routes/players.js — self-signup + 5-player demo cap + license bypass + config-driven

const express = require('express');
const path = require('path');
const { readFile } = require('fs/promises');
const bcrypt = require('bcryptjs');
const { writeJsonAtomic } = require('../utils/atomicJson');
const license = require('../lib/license');

const router = express.Router();

const DATA_DIR   = path.join(__dirname, '..', 'data');
const PLAYERS    = path.join(DATA_DIR, 'players.json');
const CONFIG_PATH= path.join(DATA_DIR, 'config.json');

// ---- env / toggles ----
const SKIP_LICENSE = String(process.env.DEMO_SKIP_LICENSE || '').toLowerCase() === 'true';

// Optional env overrides (if set, they take precedence over config.json)
function readBoolEnv(name) {
  if (!(name in process.env)) return null;
  const v = String(process.env[name] || '').trim().toLowerCase();
  return ['1','true','yes','y','on'].includes(v);
}
const ENV_ALLOW_SELF = readBoolEnv('ALLOW_SELF_SIGNUP');                 // optional boolean
const ENV_REQUIRE_INV = readBoolEnv('REQUIRE_INVITE_CODE');              // optional boolean
const ENV_WHITELIST   = (process.env.WHITELIST_EMAIL_DOMAIN || '').trim().toLowerCase();
const ENV_INVITE      = (process.env.INVITE_CODE || '').trim();
const DEMO_CAP        = parseInt(process.env.DEMO_PLAYERS_MAX || '', 10) || 0;

// ---- helpers ----
async function loadJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function loadPlayers() {
  return loadJson(PLAYERS, []);
}
async function savePlayers(list) {
  await writeJsonAtomic(PLAYERS, list);
}

function norm(s) { return String(s || '').trim(); }

function emailDomainOk(email, whitelist) {
  if (!whitelist) return true;
  const e = String(email || '').toLowerCase();
  return e.endsWith('@' + whitelist);
}

async function loadConfigNormalized() {
  // Read whatever is in config.json and normalize keys that might have snakeCase or camelCase
  const raw = await loadJson(CONFIG_PATH, {});
  const cfg = Object.assign({}, raw);

  const allowSelf =
    (ENV_ALLOW_SELF !== null ? ENV_ALLOW_SELF :
      (cfg.allowSelfRegistration ?? cfg.allow_self_registration ?? false));

  const maxPlayers =
    (Number.isFinite(parseInt(cfg.maxPlayers)) ? parseInt(cfg.maxPlayers,10) :
     Number.isFinite(parseInt(cfg.max_players)) ? parseInt(cfg.max_players,10) :
     undefined);

  const requireInvite =
    (ENV_REQUIRE_INV !== null ? ENV_REQUIRE_INV :
      (cfg.requireInviteCode ?? cfg.require_invite_code ?? false));

  const inviteCode =
    (ENV_INVITE ||
      norm(cfg.inviteCode ?? cfg.invite_code ?? ''));

  const whitelist =
    (ENV_WHITELIST ||
      norm((cfg.whitelistEmailDomain ?? cfg.whitelist_email_domain ?? '').toLowerCase()));

  return { allowSelf, maxPlayers, requireInvite, inviteCode, whitelist };
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

// ---- self-signup (public; honors config + demo license bypass) ----
router.post('/register', express.json(), async (req, res) => {
  // License gate (skipped if DEMO_SKIP_LICENSE=true)
  if (!SKIP_LICENSE) {
    const st = license.getStatus();
    if (!st.ok) return res.status(403).json({ error: 'license_invalid' });
  }

  // Load config (with env overrides)
  const cfg = await loadConfigNormalized();
  if (!cfg.allowSelf) return res.status(403).json({ error: 'self_signup_disabled' });

  const name   = norm(req.body?.name);
  const email  = norm(req.body?.email);
  const pin    = norm(req.body?.pin);
  const invite = norm(req.body?.invite_code);

  if (!name)            return res.status(400).json({ error: 'name_required' });
  if (pin.length < 4)   return res.status(400).json({ error: 'pin_too_short' });

  if (cfg.requireInvite) {
    if (!cfg.inviteCode || invite !== cfg.inviteCode) {
      return res.status(403).json({ error: 'bad_invite_code' });
    }
  }

  if (email && !emailDomainOk(email, cfg.whitelist)) {
    return res.status(400).json({ error: 'email_invalid_or_domain' });
  }

  const players = await loadPlayers();

  if (players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: 'name_taken' });
  }

  // Determine cap: demo cap > config cap > license cap > Infinity
  let cap = DEMO_CAP || cfg.maxPlayers || Infinity;
  if (!Number.isFinite(cap) && license.getStatus()?.license?.max_players) {
    cap = license.getStatus().license.max_players;
  }
  if (Number.isFinite(cap) && players.length >= cap) {
    return res.status(403).json({ error: 'max_players_reached' });
  }

  const id = String(Date.now());
  const pin_hash = await bcrypt.hash(pin, 10);
  players.push({
    id,
    name,
    email: email || undefined,
    pin_hash,
    created_at: new Date().toISOString()
  });

  await savePlayers(players);
  res.json({ ok: true, id, name });
});

module.exports = router;
