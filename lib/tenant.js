// lib/tenant.js
const path = require('path');
const fs = require('fs');

const BASE_DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

function parseTenantMap() {
  try { return JSON.parse(process.env.TENANT_MAP || '{}'); }
  catch { return {}; }
}

function sanitizeSlug(s) {
  return String(s || '').replace(/[^A-Za-z0-9._-]/g, '_');
}

function tenantFromRequest(req) {
  const map = parseTenantMap();
  const host = (req.headers['x-forwarded-host'] || req.hostname || '')
    .split(':')[0].toLowerCase();
  let t = map[host];

  if (!t && process.env.ALLOW_TENANT_OVERRIDE === 'true') {
    t = req.query?.t || req.get?.('x-tenant');
  }
  return sanitizeSlug(t || process.env.TENANT || 'default');
}

function tenantMiddleware(req, _res, next) {
  try {
    const tenant = tenantFromRequest(req);
    const dataDir = path.join(BASE_DATA_DIR, 'tenants', tenant);
    fs.mkdirSync(dataDir, { recursive: true });
    req.ctx = { tenant, dataDir };
  } catch {
    req.ctx = { tenant: process.env.TENANT || 'default', dataDir: BASE_DATA_DIR };
  }
  next();
}

// Return the active data dir for this request (falls back to global)
function dataDir(req) {
  return (req && req.ctx && req.ctx.dataDir) ? req.ctx.dataDir : BASE_DATA_DIR;
}

// Join a path inside the active tenant's data dir
function joinData(req, ...parts) {
  return path.join(dataDir(req), ...parts);
}

// Ensure the folder for a file exists (mkdir -p dirname(file))
function ensureDirForFile(filePath) {
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch {}
}

module.exports = {
  BASE_DATA_DIR,
  tenantMiddleware,
  tenantFromRequest,
  dataDir,
  joinData,
  ensureDirForFile,
};
