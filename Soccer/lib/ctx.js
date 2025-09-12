// lib/ctx.js (new)
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const safe = s => String(s || '').replace(/[^a-z0-9._-]/gi, '').slice(0, 64);

function readJsonIfExists(p, fallback = null) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return fallback;
}

module.exports = function withCtx(req, res, next) {
  const tenant = safe(req.query.t || process.env.DEFAULT_TENANT || 'DEFAULT');

  // Tenant config may define a default competition
  const tenantDir = path.join(DATA_DIR, 'tenants', tenant);
  const tenantCfgPath = path.join(tenantDir, 'config.json');
  const tenantCfg = readJsonIfExists(tenantCfgPath, {});

  let comp = safe(
    req.query.c ||
    tenantCfg.defaultCompetition ||
    process.env.DEFAULT_COMP ||
    'EPL-2025'
  );

  // Allow blank comp (legacy mode) if you really want: set DEFAULT_COMP=""
  if (!comp) comp = '';

  const compDir = comp
    ? path.join(tenantDir, 'competitions', comp)
    : tenantDir;

  fs.mkdirSync(compDir, { recursive: true });

  const within = (...rel) => path.join(compDir, ...rel);
  const legacy = (...rel) => path.join(tenantDir, ...rel); // for fallback reads

  req.ctx = {
    tenant,
    comp,                // e.g. "EPL-2025" (or "" if legacy)
    tenantDir,
    compDir,
    paths: {
      // Primary (competition-scoped)
      playersJson    : within('players.json'),
      fixturesDir    : within('fixtures'),
      resultsDir     : within('results'),
      predictionsDir : within('predictions'),
      scoresWeeksDir : within('scores', 'weeks'),
      seasonTotals   : within('scores', 'season-totals.json'),
      compConfig     : within('config.json'),
      tenantConfig   : tenantCfgPath,

      // Legacy fallbacks (read-only, used if comp files don’t exist)
      legacyPlayers  : legacy('players.json'),
      legacySeason   : legacy('scores', 'season-totals.json'),
    }
  };

  next();
};
