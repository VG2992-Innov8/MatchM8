// routes/players.js — self-signup + 5-player demo cap + license bypass + config-driven (TENANT-AWARE)

const express = require('express');
const path = require('path');
const fs = require('fs');
const { readFile } = require('fs/promises');
const bcrypt = require('bcryptjs');
const { writeJsonAtomic } = require('../utils/atomicJson');
const license = require('../lib/license');

// ⬇️ Tenant helpers (added earlier in lib/tenant.js)
const { BASE_DATA_DIR, joinData } = require('../lib/tenant');

const router = express.Router();

// ---- env / toggles ----
const SKIP_LICENSE = String(process.env.DEMO_SKIP_LICENSE || '').toLowerCase() === 'true';

// Optional env overrides (if set, they take precedence over config.json)
function readBoolEnv(name) {
  if (!(name in process.env)) return null;
  const v = String(process.env[name] || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(v);
}
const ENV_ALLOW_SELF = readBoolEnv('ALLOW_SELF_SIGNUP');            // optional boolean
const ENV_REQUIRE_INV = readBoolEnv('REQUIRE_INVITE_CODE');         // optional boolean
const ENV_WHITELIST   = (process.env.WHITELIST_EMAIL_DOMAIN || '').trim().toLowerCase();
const ENV_INVITE      = (process.env.INVITE_CODE || '').trim();
const DEMO_CAP        = parseInt(process.env.DEMO_PLAYERS_MAX || '', 10) || 0;

/* ------------ path helpers (tenant-first with legacy fallback for reads) ------------ */

function playersPathTenant(req) {
  // Always write to the tenant path
  return joinData(req, 'players.json');
}
function configPathTenantFirst(req) {
  const tenantCfg = joinData(req, 'config.json');
  if (fs.existsSync(tenantCfg)) return tenantCfg;
  // legacy/global fallback so older installs still work
  return path.join(BASE_DATA_DIR, 'config.json');
}

/* ---------------- IO helpers ---------------- */

async function loadJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function loadPlayers(req) {
  // Prefer tenant players.json; fall back to legacy/global if present
  const tenant = playersPathTenant(req);
  if (fs.existsSync(tenant)) return loadJson(tenant, []);
  const legacy = path.join(BASE_DATA_DIR, 'players.json');
  return loadJson(legacy, []);
}
async function savePlayers(req, list) {
  // Persist only to the tenant path (multi-tenant canonical)
  const fp = playersPathTenant(req);
  await writeJsonAtomic(fp, list);
}

function norm(s) { return String(s || '').trim(); }

function emailDomainOk(email, whitelist) {
  if (!whitelist) return true;
  const e = String(email || '').toLowerCase();
  return e.endsWith('@' + whitelist);
}

async function loadConfigNormalized(req) {
  // Read whatever is in config.json (tenant first) and normalize keys that might have snakeCase or camelCase
  const cfgFile = configPathTenantFirst(req);
  const raw = await loadJson(cfgFile, {});
  const cfg = Object.assign({}, raw);

  const allowSelf =
    (ENV_ALLOW_SELF !== null ? ENV_ALLOW_SELF :
      (cfg.allowSelfRegistration ?? cfg.allow_self_registration ?? false));

  const maxPlayers =
    (Number.isFinite(parseInt(cfg.maxPlayers)) ? parseInt(cfg.maxPlayers, 10) :
     Number.isFinite(parseInt(cfg.max_players)) ? parseInt(cfg.max_players, 10) :
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

/* ---------------- Endpoints ---------------- */

// ---- lightweight listings ----
router.get('/', async (req, res) => {
  const list = await loadPlayers(req);
  res.json(list.map(p => ({ id: p.id, name: p.name, has_pin: !!p.pin_hash })));
});

router.get('/check-name', async (req, res) => {
  const name = norm(req.query.name).toLowerCase();
  const list = await loadPlayers(req);
  res.json({ taken: !!list.find(p => p.name.toLowerCase() === name) });
});

// ---- self-signup (public; honors config + demo license bypass) ----
router.post('/register', express.json(), async (req, res) => {
  try {
    // License gate (skipped if DEMO_SKIP_LICENSE=true)
    if (!SKIP_LICENSE) {
      const st = license.getStatus();
      if (!st.ok) return res.status(403).json({ error: 'license_invalid' });
    }

    // Load config (with env overrides), tenant-first
    const cfg = await loadConfigNormalized(req);
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

    const players = await loadPlayers(req);

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

    await savePlayers(req, players);
    res.json({ ok: true, id, name });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'register_failed', detail: String(err?.message || err) });
  }
});

module.exports = router;
