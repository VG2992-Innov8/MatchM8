#!/usr/bin/env node
/* Factory reset — nukes season data and optionally keeps players/admin or resets config.
 *
 * Usage:
 *   node scripts/factory-reset.js --force [--keep-players | --keep-admin] [--reset-config]
 *                                 [--purge-mail] [--keep-fixtures] [--season=YYYY]
 *
 * Defaults:
 *   - Fixtures ARE wiped by default. Use --keep-fixtures to preserve them.
 *
 * Examples:
 *   node scripts/factory-reset.js --force --reset-config
 *   node scripts/factory-reset.js --force --keep-admin
 *   node scripts/factory-reset.js --force --reset-config --keep-fixtures --season=2026
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const DIRS = {
  predictions: path.join(DATA, 'predictions'),
  results:     path.join(DATA, 'results'),
  scores:      path.join(DATA, 'scores'),
  scoresWeeks: path.join(DATA, 'scores', 'weeks'),
  fixtures:    path.join(DATA, 'fixtures'),
  mail:        path.join(DATA, 'mail'), // optional
};
const FILES = {
  players: path.join(DATA, 'players.json'),
  config:  path.join(DATA, 'config.json'),
};

const DEFAULT_CONFIG = {
  season: 2025,
  totalWeeks: 38,
  currentWeek: 1,
  lockMinutesBeforeKickoff: 10,
  deadlineMode: "first_kickoff",
  timezone: "Australia/Melbourne"
};

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const KEEP_PLAYERS = args.has('--keep-players');
const KEEP_ADMIN = args.has('--keep-admin');
const RESET_CONFIG = args.has('--reset-config');
const PURGE_MAIL = args.has('--purge-mail');
// Fixtures: wipe by default; user can keep with --keep-fixtures
let WIPE_FIXTURES = true;
if (args.has('--keep-fixtures')) WIPE_FIXTURES = false;
else if (args.has('--wipe-fixtures')) WIPE_FIXTURES = true; // optional legacy flag support

if (!FORCE) {
  console.log(`
Factory reset (SAFE MODE)

This will delete season data:
- data/predictions/*
- data/results/*
- data/scores/* (including weeks/)
- data/fixtures/*  (by default; pass --keep-fixtures to preserve fixtures)

Options:
  --force           actually run (required)
  --keep-players    keep data/players.json as-is
  --keep-admin      keep only an "Admin" player (by name or id "admin"), remove others
  --reset-config    rewrite data/config.json to defaults (camelCase)
  --purge-mail      also clear data/mail/* (outbox/sent/failed), if present
  --keep-fixtures   DO NOT wipe fixtures (overrides default wipe)
  --season=YYYY     set/reset season year (used for config & fixtures dir)

Examples:
  node scripts/factory-reset.js --force --reset-config
  node scripts/factory-reset.js --force --keep-admin
  node scripts/factory-reset.js --force --reset-config --keep-fixtures --season=2026
`);
  process.exit(1);
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}
function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}
function readJson(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}
function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}
function getArgVal(name, def) {
  const pfx = name + '=';
  for (const a of args) if (a.startsWith(pfx)) return a.slice(pfx.length);
  return def;
}

// Determine season (flag > existing config > default)
const existingCfg = readJson(FILES.config, DEFAULT_CONFIG);
const season = String(getArgVal('--season', existingCfg.season || DEFAULT_CONFIG.season));

// 1) Nuke season data (predictions/results/scores). Fixtures wiped by default; preserved with --keep-fixtures.
rmrf(DIRS.predictions);
rmrf(DIRS.results);
rmrf(DIRS.scores);
if (WIPE_FIXTURES) rmrf(DIRS.fixtures);
if (PURGE_MAIL) rmrf(DIRS.mail);

// 2) Recreate minimal structure
ensureDir(DIRS.predictions);
ensureDir(DIRS.results);
ensureDir(DIRS.scores);
ensureDir(DIRS.scoresWeeks);
ensureDir(DIRS.fixtures);
ensureDir(path.join(DIRS.fixtures, `season-${season}`)); // season-scoped fixtures folder

// 3) Players handling
if (KEEP_PLAYERS) {
  // leave players.json untouched
} else if (KEEP_ADMIN) {
  const arr = readJson(FILES.players, []);
  const kept = [];
  for (const p of Array.isArray(arr) ? arr : []) {
    const id = String(p.id ?? '').toLowerCase();
    const name = String(p.name ?? '').trim().toLowerCase();
    if (id === 'admin' || name === 'admin') kept.push(p);
  }
  writeJson(FILES.players, kept);
} else {
  // remove all players
  writeJson(FILES.players, []);
}

// 4) Config handling (camelCase)
if (RESET_CONFIG) {
  const fresh = { ...DEFAULT_CONFIG, season: Number(season), currentWeek: 1 };
  writeJson(FILES.config, fresh);
} else {
  // If no config exists, create one with camelCase defaults (respect chosen season)
  if (!exists(FILES.config)) {
    const fresh = { ...DEFAULT_CONFIG, season: Number(season) };
    writeJson(FILES.config, fresh);
  }
}

// 5) Seed empty score files
writeJson(path.join(DIRS.scores, 'season-totals.json'), []);
writeJson(path.join(DIRS.scores, 'season-totals.legacy.json'), {});

// 6) Final report
console.log('✔ Factory reset complete.');
console.log(`  Players: ${KEEP_PLAYERS ? 'kept' : (KEEP_ADMIN ? 'kept only Admin' : 'cleared')}`);
console.log(`  Config:  ${RESET_CONFIG ? 'reset to defaults' : (exists(FILES.config) ? 'kept/created' : 'created defaults')}`);
console.log(`  Season:  ${season}`);
console.log(`  Fixtures: ${WIPE_FIXTURES ? 'wiped' : 'kept'}`);
if (PURGE_MAIL) console.log('  Mail:    purged');
console.log('  Paths:');
console.log(`    fixtures:    ${path.join(DIRS.fixtures, 'season-' + season)}`);
console.log(`    predictions: ${DIRS.predictions}`);
console.log(`    results:     ${DIRS.results}`);
console.log(`    scores:      ${DIRS.scores}`);
