// routes/admin_auth.js — per-tenant admin auth (token OR password), with bootstrap + session cookie

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');

const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

router.use(express.json());

/* ---------------- utils ---------------- */
function safeEqual(a = '', b = '') {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function adminDataFile(req) {
  // tenant-aware store; falls back to global DATA_DIR if tenant ctx missing
  const base = (req.ctx && req.ctx.dataDir) || require('../lib/paths').DATA_DIR;
  const dir = path.join(base, 'admin');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return path.join(dir, 'auth.json');
}

async function readAuth(req) {
  try {
    const txt = await fsp.readFile(adminDataFile(req), 'utf8');
    return JSON.parse(txt);
  } catch {
    return {};
  }
}
async function writeAuth(req, obj) {
  await fsp.writeFile(adminDataFile(req), JSON.stringify(obj, null, 2), 'utf8');
}

// very light JWT-ish cookie using ADMIN_TOKEN as HMAC secret
function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64uJSON(obj) { return b64u(JSON.stringify(obj)); }
function sign(payloadStr) {
  const h = crypto.createHmac('sha256', ADMIN_TOKEN || 'dev');
  h.update(payloadStr);
  return b64u(h.digest());
}
function makeSessionToken(claims) {
  const p = b64uJSON(claims);
  const s = sign(p);
  return `v1.${p}.${s}`;
}
function verifySessionToken(tok) {
  if (!tok || typeof tok !== 'string') return null;
  const parts = tok.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [ , payload, sig ] = parts;
  if (sign(payload) !== sig) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8'));
    if (!claims || typeof claims !== 'object') return null;
    if (typeof claims.exp === 'number' && claims.exp < Date.now()) return null;
    return claims;
  } catch { return null; }
}
function setSessionCookie(res, token) {
  res.cookie('admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 7 * 24 * 3600 * 1000, // 7 days
    path: '/api/admin'
  });
}

/* ---------------- public-ish helpers ---------------- */

// Check state (no auth required): do we have a password set for this tenant?
router.get('/auth/state', async (req, res) => {
  const a = await readAuth(req);
  res.json({ ok: true, tenant: (req.ctx && req.ctx.tenant) || null, has_password: !!a.password_hash });
});

// One-time bootstrap: set password if none exists (guarded by admin token)
router.post('/_bootstrap', async (req, res) => {
  if (!ADMIN_TOKEN) return res.status(403).json({ ok: false, error: 'admin_disabled' });
  const hdr = (req.get('x-admin-token') || '').trim();
  if (!safeEqual(hdr, ADMIN_TOKEN)) return res.status(403).json({ ok: false, error: 'forbidden' });

  const { password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ ok: false, error: 'password_too_short' });
  }
  const a = await readAuth(req);
  if (a.password_hash) return res.status(409).json({ ok: false, error: 'already_set' });

  const hash = await bcrypt.hash(String(password), 10);
  await writeAuth(req, { password_hash: hash, updated_at: new Date().toISOString() });

  const token = makeSessionToken({
    tenant: (req.ctx && req.ctx.tenant) || 'default',
    iat: Date.now(),
    exp: Date.now() + 24 * 3600 * 1000
  });
  setSessionCookie(res, token);
  res.json({ ok: true, bootstrapped: true });
});

// Login with password → sets cookie
router.post('/_login', async (req, res) => {
  const { password } = req.body || {};
  const a = await readAuth(req);
  if (!a.password_hash) return res.status(400).json({ ok: false, error: 'no_password_set' });

  const ok = password && await bcrypt.compare(String(password), a.password_hash);
  if (!ok) return res.status(401).json({ ok: false, error: 'bad_password' });

  const token = makeSessionToken({
    tenant: (req.ctx && req.ctx.tenant) || 'default',
    iat: Date.now(),
    exp: Date.now() + 24 * 3600 * 1000
  });
  setSessionCookie(res, token);
  res.json({ ok: true, login: true });
});

// Alias for UIs that call without underscore
router.post('/login', async (req, res) => {
  const { password } = req.body || {};
  req.url = '/_login'; // delegate
  return router.handle(req, res);
});

router.post('/_logout', (req, res) => {
  res.clearCookie('admin_session', { path: '/api/admin' });
  res.json({ ok: true });
});

/* ---------------- guard the rest of /api/admin ---------------- */

// allow header token OR valid session cookie
router.use((req, res, next) => {
  if (ADMIN_TOKEN) {
    const hdr = (req.get('x-admin-token') || '').trim();
    if (safeEqual(hdr, ADMIN_TOKEN)) return next();
  }
  const cookie = (req.cookies && req.cookies.admin_session) || '';
  const claims = verifySessionToken(cookie);
  const tenant = (req.ctx && req.ctx.tenant) || 'default';
  if (claims && claims.tenant === tenant) return next();
  return res.status(403).json({ ok: false, error: 'forbidden' });
});

// Minimal health (after auth)
router.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

module.exports = router;
