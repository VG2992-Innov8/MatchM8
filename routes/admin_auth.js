// routes/admin_auth.js — admin login & first-run password bootstrap
const express = require('express');
const path = require('path');
const { readFile } = require('fs/promises');
const bcrypt = require('bcryptjs');
const { writeJsonAtomic } = require('../utils/atomicJson');

const router = express.Router();

const ADMIN_FILE = path.join(__dirname, '..', 'data', 'admin.json');
const isProd = process.env.NODE_ENV === 'production';

// helpers
async function readAdmin() {
  try { return JSON.parse(await readFile(ADMIN_FILE, 'utf8')); }
  catch { return {}; }
}
async function writeAdmin(obj) { await writeJsonAtomic(ADMIN_FILE, obj); }

function sanitizeToken(s = '') {
  return String(s).replace(/\r/g,'').replace(/\s+#.*$/,'').replace(/^\s*['"]|['"]\s*$/g,'').trim();
}
const ADMIN_TOKEN = sanitizeToken(process.env.ADMIN_TOKEN || ''); // you already use this to gate admin APIs

// GET /api/admin/state -> { bootstrap_required: true|false }
router.get('/state', async (_req, res) => {
  const a = await readAdmin();
  res.json({ bootstrap_required: !a.pass_hash });
});

// POST /api/admin/bootstrap { new_password }  (only allowed if no password set yet)
router.post('/bootstrap', express.json(), async (req, res) => {
  const { new_password } = req.body || {};
  const a = await readAdmin();
  if (a.pass_hash) return res.status(409).json({ ok:false, error:'already_set' });
  if (!new_password || String(new_password).trim().length < 6) {
    return res.status(400).json({ ok:false, error:'weak_password' });
  }
  const pass_hash = await bcrypt.hash(String(new_password), 10);
  await writeAdmin({ pass_hash, set_at: new Date().toISOString() });
  return res.json({ ok:true });
});

// POST /api/admin/login { password } -> { ok:true, token }
router.post('/login', express.json(), async (req, res) => {
  const { password } = req.body || {};
  const a = await readAdmin();

  // First run: no password yet → tell client to bootstrap
  if (!a.pass_hash) {
    return res.status(409).json({ ok:false, error:'bootstrap_required' });
  }

  const ok = await bcrypt.compare(String(password || ''), a.pass_hash);
  if (!ok) return res.status(401).json({ ok:false, error:'bad_password' });

  // hand back the configured admin token; client stores in localStorage and uses x-admin-token header
  if (!ADMIN_TOKEN) return res.status(500).json({ ok:false, error:'admin_token_missing' });
  return res.json({ ok:true, token: ADMIN_TOKEN });
});

// optional logout (clear any client-side state if you decide to set cookies later)
router.post('/logout', (_req, res) => res.json({ ok:true }));

module.exports = router;
