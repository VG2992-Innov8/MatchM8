// routes/config.js
const fs = require('fs');
const path = require('path');
const express = require('express');

// Root data dir
const DATA_DIR = path.join(__dirname, '..', 'data');

// sensible defaults
const DEFAULTS = {
  season: 2025,
  total_weeks: 38,
  current_week: 1,
  lock_minutes_before_kickoff: 10,
  deadline_mode: 'first_kickoff',
  timezone: 'Australia/Melbourne'
};

/* ---------- helpers ---------- */
function safeReadJson(p, fb = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fb; }
}
function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
function writeJson(p, obj) {
  ensureDirFor(p);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

// Context helpers (compatible with your other routes)
function tenantSlug(req) {
  return String(req?.ctx?.tenant || 'default');
}
function tenantDir(req) {
  return req?.ctx?.tenantDir || path.join(DATA_DIR, 'tenants', tenantSlug(req));
}
function compSlug(req) {
  return String(req?.ctx?.comp || '');
}
function compDataDir(req) {
  // if middleware already set ctx.dataDir, prefer it; else compute from tenant+comp
  if (req?.ctx?.dataDir) return req.ctx.dataDir;
  const c = compSlug(req);
  return c ? path.join(tenantDir(req), 'competitions', c) : tenantDir(req);
}

/* ---------- readers ---------- */
function readGlobalConfig() {
  return { ...DEFAULTS, ...safeReadJson(path.join(DATA_DIR, 'config.json'), {}) };
}
function readTenantConfig(req) {
  return safeReadJson(path.join(tenantDir(req), 'config.json'), {}) || {};
}
function readCompetitionConfig(req) {
  return safeReadJson(path.join(compDataDir(req), 'config.json'), {}) || {};
}

/* ---------- writers ---------- */
function writeTenantConfig(req, next) {
  writeJson(path.join(tenantDir(req), 'config.json'), next);
}
function writeCompetitionConfig(req, next) {
  writeJson(path.join(compDataDir(req), 'config.json'), next);
}

/* ---------- router ---------- */
module.exports = function makeConfigRouter({ requireAdminToken }) {
  const router = express.Router();

  // Public GET — merged view
  router.get('/', (req, res) => {
    const globalCfg = readGlobalConfig();
    const tenantCfg = readTenantConfig(req);
    const compCfg   = readCompetitionConfig(req);

    // Compose: competition overrides the global scheduling knobs.
    const merged = {
      // identity
      tenant: tenantSlug(req),
      competition: compSlug(req),

      // brand / tenant props
      brand_title: tenantCfg.brand_title ?? null,
      brand_subtitle: tenantCfg.brand_subtitle ?? null,
      sport: tenantCfg.sport ?? null,
      seats: tenantCfg.seats ?? null,

      // finals switching signals
      defaultCompetition: tenantCfg.defaultCompetition || '',
      finals: tenantCfg.finals || null,

      // schedule/scoring knobs (comp -> global -> defaults)
      ...globalCfg,
      ...compCfg
    };

    return res.json(merged);
  });

  // Admin POST — writes competition config; optionally writes tenant finals/defaultCompetition
  router.post('/', requireAdminToken, (req, res) => {
    const body = req.body || {};

    // ----- update competition config (season knobs etc.)
    const prevComp = readCompetitionConfig(req);
    const nextComp = {
      ...prevComp,
      // coerce known numeric/enum fields while allowing extra keys if you add later
      season: Number(body.season ?? prevComp.season ?? DEFAULTS.season),
      total_weeks: Number(body.total_weeks ?? prevComp.total_weeks ?? DEFAULTS.total_weeks),
      current_week: Number(body.current_week ?? prevComp.current_week ?? DEFAULTS.current_week),
      lock_minutes_before_kickoff:
        Number(body.lock_minutes_before_kickoff ?? prevComp.lock_minutes_before_kickoff ?? DEFAULTS.lock_minutes_before_kickoff),
      deadline_mode: String(body.deadline_mode ?? prevComp.deadline_mode ?? DEFAULTS.deadline_mode),
      timezone: String(body.timezone ?? prevComp.timezone ?? DEFAULTS.timezone)
    };
    writeCompetitionConfig(req, nextComp);

    // ----- optionally update tenant config for finals/defaultCompetition
    let tenantUpdated = false;
    if (Object.prototype.hasOwnProperty.call(body, 'defaultCompetition') ||
        Object.prototype.hasOwnProperty.call(body, 'finals')) {
      const prevTenant = readTenantConfig(req);
      const nextTenant = {
        ...prevTenant,
        ...(Object.prototype.hasOwnProperty.call(body, 'defaultCompetition')
            ? { defaultCompetition: String(body.defaultCompetition || '') } : {}),
        ...(Object.prototype.hasOwnProperty.call(body, 'finals')
            ? { finals: body.finals || null } : {})
      };
      writeTenantConfig(req, nextTenant);
      tenantUpdated = true;
    }

    // Compose response like GET does
    const globalCfg = readGlobalConfig();
    const tenantCfg = readTenantConfig(req);
    const merged = {
      tenant: tenantSlug(req),
      competition: compSlug(req),
      brand_title: tenantCfg.brand_title ?? null,
      brand_subtitle: tenantCfg.brand_subtitle ?? null,
      sport: tenantCfg.sport ?? null,
      seats: tenantCfg.seats ?? null,
      defaultCompetition: tenantCfg.defaultCompetition || '',
      finals: tenantCfg.finals || null,
      ...globalCfg,
      ...nextComp
    };

    return res.json({ ok: true, updated: { competition: true, tenant: tenantUpdated }, config: merged });
  });

  return router;
};
