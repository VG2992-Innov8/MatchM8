// lib/license.js — simple HMAC license (config.json-based)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./paths');

let STATE = { ok: false, reason: 'missing_or_invalid_files', license: null };

const CFG_PATH = path.join(DATA_DIR, 'config.json');

function b64u(buf) { return Buffer.from(buf).toString('base64url'); }

function verifyToken(token, secret) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return { ok: false, reason: 'bad-format' };
    const expect = b64u(crypto.createHmac('sha256', secret).update(body).digest());
    const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
    if (!ok) return { ok: false, reason: 'bad-signature' };
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.expires && Date.now() > Date.parse(payload.expires)) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, reason: 'verify-error:' + String(e) };
  }
}

async function loadAndValidate() {
  try {
    const secret = process.env.LICENSE_SECRET;
    if (!secret) {
      STATE = { ok: false, reason: 'server_misconfigured: LICENSE_SECRET not set', license: null };
      return STATE;
    }
    let cfg = {};
    try {
      cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
    } catch {
      STATE = { ok: false, reason: 'missing_or_invalid_files', license: null };
      return STATE;
    }
    const token = String(cfg?.license?.token || '').trim();
    if (!token) {
      STATE = { ok: false, reason: 'missing_or_invalid_files', license: null };
      return STATE;
    }
    const v = verifyToken(token, secret);
    if (!v.ok) {
      STATE = { ok: false, reason: v.reason, license: null };
      return STATE;
    }
    STATE = { ok: true, reason: 'ok', license: v.payload };
    return STATE;
  } catch (e) {
    STATE = { ok: false, reason: 'validate-error:' + String(e), license: null };
    return STATE;
  }
}

function getStatus() {
  return { ok: STATE.ok, reason: STATE.reason, license: STATE.license || null };
}

module.exports = { loadAndValidate, getStatus };
