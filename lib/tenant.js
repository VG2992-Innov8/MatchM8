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

function tenantFromHost(host) {
  const h = (host || '').split(':')[0].toLowerCase();
  const map = parseTenantMap();
  // Fallbacks let you test before DNS is set up
  return map[h] || process.env.TENANT || 'default';
}

function tenantMiddleware(req, _res, next) {
  const tenant = tenantFromHost(req.hostname);
  const dataDir = path.join(BASE_DATA_DIR, 'tenants', tenant);
  fs.mkdirSync(dataDir, { recursive: true });
  req.ctx = { tenant, dataDir };
  next();
}

module.exports = { tenantMiddleware, BASE_DATA_DIR };
