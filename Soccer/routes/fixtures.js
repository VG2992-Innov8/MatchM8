// routes/fixtures.js — tenant-aware fixtures reader (robust + BOM-safe + normalised)
const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();
router.use(express.json());

/* ---------------- IO helpers ---------------- */
function readText(p) {
  return fs.readFileSync(p, 'utf8');
}
function stripBOM(s) {
  if (!s) return s;
  // Remove UTF-8 BOM if present
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}
function readJson(p, fb) {
  try {
    const raw = stripBOM(readText(p));
    return JSON.parse(raw);
  } catch {
    return fb;
  }
}
function fileExists(p) {
  try { fs.accessSync(p, fs.constants.R_OK); return true; } catch { return false; }
}
function statSize(p) {
  try { return fs.statSync(p).size || 0; } catch { return 0; }
}

/* ---------------- Config helpers ---------------- */
function cfgPath(req) {
  const base = req?.ctx?.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  return path.join(base, 'config.json');
}
function readConfig(req) {
  const cfg = readJson(cfgPath(req), {});
  return { season: Number(cfg.season) || new Date().getFullYear(), ...cfg };
}

/* ---------------- Normaliser ---------------- */
function pick(obj, ...keys) { for (const k of keys) if (obj && obj[k] != null) return obj[k]; return undefined; }

function normaliseOne(raw, idx = 0) {
  // id variants
  const id = String(
    pick(raw, 'id', 'matchId', 'code', '_id', 'match_id') ??
    `w${idx + 1}`
  );

  // home/away team name variants (string or nested object)
  const hObj = pick(raw, 'home', 'homeTeam', 'home_team');
  const aObj = pick(raw, 'away', 'awayTeam', 'away_team');

  const home = typeof hObj === 'object' && hObj ? (hObj.name ?? hObj.team ?? hObj.title ?? 'Home') : (hObj ?? 'Home');
  const away = typeof aObj === 'object' && aObj ? (aObj.name ?? aObj.team ?? aObj.title ?? 'Away') : (aObj ?? 'Away');

  // kickoff variants
  const ko = pick(raw, 'kickoff_iso', 'kickoffISO', 'kickoff', 'utcDate', 'kickoff_utc');

  // produce a superset so old UIs also work
  return {
    id,
    home,
    away,
    kickoff_iso: ko || null,
    // legacy-friendly mirrors
    homeTeam: home,
    awayTeam: away,
    kickoffISO: ko || null,
  };
}

function normaliseList(any) {
  if (!any) return [];
  if (Array.isArray(any)) return any.map(normaliseOne);

  // { fixtures:[...] } or { matches:[...] }
  if (Array.isArray(any.fixtures)) return any.fixtures.map(normaliseOne);
  if (Array.isArray(any.matches))  return any.matches.map(normaliseOne);

  // Map keyed by id → values are the rows
  if (any && typeof any === 'object') {
    const out = [];
    let i = 0;
    for (const [id, v] of Object.entries(any)) {
      const row = normaliseOne({ id, ...(v || {}) }, i++);
      out.push(row);
    }
    return out;
  }

  return [];
}

/* ---------------- Route ---------------- */
router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');

  const cfg    = readConfig(req);
  const week   = Math.max(1, parseInt(req.query.week, 10) || 1);
  const season = parseInt(req.query.season, 10) || cfg.season;

  const tenantDir = req?.ctx?.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const globalDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

  // Prefer tenant path; fall back to legacy/global
  const candidates = [
    path.join(tenantDir, 'fixtures', `season-${season}`, `week-${week}.json`),
    path.join(tenantDir, 'fixtures', `season-${season}`, 'weeks', `week-${week}.json`),

    // legacy/global fallbacks (in case tenant wasn’t used in older data)
    path.join(globalDir, 'fixtures', `season-${season}`, `week-${week}.json`),
    path.join(globalDir, 'fixtures', `season-${season}`, 'weeks', `week-${week}.json`),

    // super-legacy single-level
    path.join(tenantDir, 'fixtures', `week-${week}.json`),
    path.join(globalDir, 'fixtures', `week-${week}.json`),
  ];

  let foundFile = null;
  let fixtures  = [];

  for (const p of candidates) {
    if (!fileExists(p)) continue;
    const data = readJson(p, null);
    if (!data) continue; // parse failed (e.g., BOM without strip) → keep looking
    foundFile = p;
    fixtures = normaliseList(data);
    break;
  }

  if (String(req.query.debug) === '1') {
    return res.json({
      ok: true,
      tenant: req?.ctx?.tenant || null,
      dataDir: tenantDir,
      season, week,
      candidates: candidates.map(p => ({ path: p, exists: fileExists(p), size: statSize(p) })),
      foundFile,
      count: fixtures.length,
      sample: fixtures[0] || null,
      sampleKeysIfUnparsed: null
    });
  }

  return res.json(fixtures);
});

module.exports = router;
