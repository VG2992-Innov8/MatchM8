// routes/scores.js — tenant+competition-aware scorer with opt-in Basketball rules
// Default (no rules.json): Soccer scoring (3 exact, 1 outcome)

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

// Use DATA_DIR to resolve safe fallbacks when req.ctx is missing
const { DATA_DIR } = require('../lib/paths');

const router = express.Router();
router.use(express.json());

/* ---------------- IO helpers ---------------- */

function readJson(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fb; }
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}
function clampInt(v, min, fb) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= min ? n : fb;
}
function safeStat(p) {
  try { return fs.statSync(p); } catch { return null; }
}
function toIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function cleanToken(s=''){ return String(s).trim().replace(/^\s*['"]|['"]\s*$/g,''); }

/* ---------------- Tenant/competition roots ---------------- */

function tenantSlug(req) {
  return String(req?.ctx?.tenant || 'default');
}
function tenantRoot(req) {
  // <DATA_DIR>/tenants/<TENANT>
  return req?.ctx?.tenantDir || path.join(DATA_DIR, 'tenants', tenantSlug(req));
}
function compDataDir(req) {
  // Either <tenantRoot>/competitions/<COMP> or legacy <tenantRoot>
  return req?.ctx?.dataDir || tenantRoot(req);
}
function joinData(req, ...parts) {
  return path.join(compDataDir(req), ...parts);
}

/* ---------------- Tenant path helpers ---------------- */

function PRED_DIR(req) { return joinData(req, 'predictions'); }
function RES_DIR(req)  { return joinData(req, 'results'); }
function SCO_DIR(req)  { return joinData(req, 'scores'); }
function SCO_WEEKS(req){ return path.join(SCO_DIR(req), 'weeks'); }
function PLAYERS(req)  { return joinData(req, 'players.json'); }
function CFG_PATH(req) { return joinData(req, 'config.json'); }
function RULES_PATH(req){ return path.join(SCO_DIR(req), 'rules.json'); }

// tenant-level config (for flipping default competition)
function TENANT_CFG_PATH(req) { return path.join(tenantRoot(req), 'config.json'); }

// legacy (read-only) fallbacks at TENANT ROOT (not competition)
function LEGACY_PRED_DIR(req) { return path.join(tenantRoot(req), 'predictions'); }
function LEGACY_RES_DIR(req)  { return path.join(tenantRoot(req), 'results'); }

/* ---------------- Normalisers ---------------- */

// results can be {id:{homeGoals,awayGoals}} or {id:{home,away}} or {id:{home_score,away_score}} or {id:[h,a]}
function normaliseResults(obj = {}) {
  const out = {};
  for (const [id, v] of Object.entries(obj || {})) {
    if (Array.isArray(v)) {
      const h = toIntOrNull(v[0]); const a = toIntOrNull(v[1]);
      if (h != null && a != null) out[id] = { home: h, away: a };
    } else if (v && typeof v === 'object') {
      const home = ('homeGoals' in v) ? v.homeGoals
                 : ('home_score' in v) ? v.home_score
                 : ('home' in v)      ? v.home
                 : null;
      const away = ('awayGoals' in v) ? v.awayGoals
                 : ('away_score' in v) ? v.away_score
                 : ('away' in v)      ? v.away
                 : null;
      const h = toIntOrNull(home), a = toIntOrNull(away);
      if (h != null && a != null) out[id] = { home: h, away: a };
    }
  }
  return out;
}

// predictions may be array rows or map keyed by player_id
// supports basketball fields: winner ('HOME'|'AWAY'), spread_pick ('HOME'|'AWAY'), total_pick ('OVER'|'UNDER'),
// exact_home/exact_away (ints). Falls back to {home,away} numeric predictions.
function normalisePredictions(data) {
  const map = new Map(); // player_id -> [{id, home, away, exact_home, exact_away, winner, spread_pick, total_pick}, ...]
  const normOne = (raw) => {
    const id = String(raw.id);
    const home = toIntOrNull(raw.home ?? raw.home_score ?? raw.homeScore ?? raw.exact_home);
    const away = toIntOrNull(raw.away ?? raw.away_score ?? raw.awayScore ?? raw.exact_away);
    const exact_home = toIntOrNull(raw.exact_home ?? home);
    const exact_away = toIntOrNull(raw.exact_away ?? away);
    let winner = (raw.winner || '').toString().toUpperCase();
    if (winner !== 'HOME' && winner !== 'AWAY') winner = null;

    // If no explicit winner, infer from numeric prediction (if not a draw)
    if (!winner && home != null && away != null && home !== away) {
      winner = home > away ? 'HOME' : 'AWAY';
    }

    let spread_pick = (raw.spread_pick || raw.spreadPick || '').toString().toUpperCase();
    if (spread_pick !== 'HOME' && spread_pick !== 'AWAY') spread_pick = null;

    let total_pick = (raw.total_pick || raw.totalPick || raw.over_under || '').toString().toUpperCase();
    if (total_pick !== 'OVER' && total_pick !== 'UNDER') total_pick = null;

    return { id, home, away, exact_home, exact_away, winner, spread_pick, total_pick };
  };

  if (Array.isArray(data)) {
    for (const row of data) {
      const pid = String(row.player_id ?? '').trim();
      const arr = Array.isArray(row.predictions) ? row.predictions : [];
      if (!pid) continue;
      map.set(pid, arr.filter(p => p && p.id != null).map(normOne));
    }
  } else if (data && typeof data === 'object') {
    for (const [pidRaw, row] of Object.entries(data)) {
      const pid = String(pidRaw);
      const arr = Array.isArray(row?.predictions) ? row.predictions : [];
      map.set(pid, arr.filter(p => p && p.id != null).map(normOne));
    }
  }
  return map;
}

// Basketball/Soccer fixtures: accept many shapes; capture spread & total lines if present
function normaliseFixtures(any) {
  const out = new Map();
  const norm = (m, idKey) => {
    const id = String(m[idKey] ?? m.id ?? m.matchId ?? m.code ?? out.size + 1);
    const home = m.home?.name ?? m.home ?? m.homeTeam ?? m.home_team ?? m.homeTeamName ?? 'Home';
    const away = m.away?.name ?? m.away ?? m.awayTeam ?? m.away_team ?? m.awayTeamName ?? 'Away';
    const ko   = m.kickoffISO ?? m.kickoff_iso ?? m.kickoff ?? m.tipoff_utc ?? m.utcDate ?? null;

    // Spread & total lines (various keys)
    const spread = Number(m.spread_line ?? m.spreadLine ?? m.line ?? m.home_spread ?? m.spread ?? NaN);
    const total  = Number(m.total_line  ?? m.totalLine  ?? m.over_under ?? m.total ?? NaN);

    out.set(id, {
      id,
      homeTeam: String(home),
      awayTeam: String(away),
      kickoffISO: ko,
      spread_line: Number.isFinite(spread) ? spread : null,
      total_line: Number.isFinite(total) ? total : null
    });
  };

  if (Array.isArray(any)) {
    for (const m of any) {
      if (m && typeof m === 'object') norm(m, 'id');
    }
  } else if (any && typeof any === 'object') {
    for (const [idRaw, m] of Object.entries(any)) {
      if (m && typeof m === 'object') norm({ ...m, id: idRaw }, 'id');
    }
  }
  return out;
}

/* ---------------- Scoring rules & engines ---------------- */

// Read optional per-competition rules (e.g., Basketball)
function readRules(req) {
  return readJson(RULES_PATH(req), null);
}

// Default SOCCER scoring: 3 for exact score, 1 for correct outcome (win/draw/loss)
function computeSoccerPoints(pred, actual) {
  if (!actual) return 0;
  const ph = toIntOrNull(pred.exact_home ?? pred.home);
  const pa = toIntOrNull(pred.exact_away ?? pred.away);
  if (!Number.isInteger(ph) || !Number.isInteger(pa)) return 0;

  const ah = actual.home, aa = actual.away;
  if (ph === ah && pa === aa) return 3;

  const predOutcome = ph === pa ? 'D' : (ph > pa ? 'H' : 'A');
  const realOutcome = ah === aa ? 'D' : (ah > aa ? 'H' : 'A');
  return predOutcome === realOutcome ? 1 : 0;
}

// Basketball basic: +2 winner, +1 spread side, +1 total side, +2 exact (push = 0)
// Now also INFERS spread/total picks from the user's numeric prediction if not explicitly provided.
function computeBasketballPoints(pred, actual, fx) {
  if (!actual) return 0;
  let pts = 0;

  // Did the user give numeric predictions? (exact_* already normalised from home/away when present)
  const gaveExactNums = Number.isInteger(pred.exact_home) && Number.isInteger(pred.exact_away);

  // Derive implicit ATS/O-U picks if missing
  const spread = fx?.spread_line;
  const totalLine = fx?.total_line;

  let spreadPick = pred.spread_pick; // 'HOME' | 'AWAY' | null
  if (!spreadPick && typeof spread === 'number' && gaveExactNums) {
    const predictedMarginVsLine = (pred.exact_home + spread) - pred.exact_away; // home perspective
    spreadPick = predictedMarginVsLine > 0 ? 'HOME' : predictedMarginVsLine < 0 ? 'AWAY' : null; // push => null
  }

  let totalPick = pred.total_pick; // 'OVER' | 'UNDER' | null
  if (!totalPick && typeof totalLine === 'number' && gaveExactNums) {
    const predictedSum = pred.exact_home + pred.exact_away;
    totalPick = predictedSum > totalLine ? 'OVER' : predictedSum < totalLine ? 'UNDER' : null; // push => null
  }

  // Winner (+2) — winner already inferred earlier from numbers, but respect explicit value if present
  if (pred.winner) {
    const homeWon = actual.home > actual.away;
    if ((pred.winner === 'HOME' && homeWon) || (pred.winner === 'AWAY' && !homeWon)) {
      pts += 2;
    }
  }

  // Spread (+1) — push yields 0
  if (typeof spread === 'number' && spreadPick) {
    const margin = (actual.home + spread) - actual.away; // home perspective
    const homeCovers = margin > 0;
    if ((homeCovers && spreadPick === 'HOME') || (!homeCovers && spreadPick === 'AWAY')) {
      pts += 1;
    }
  }

  // Total (+1) — push yields 0
  if (typeof totalLine === 'number' && totalPick) {
    const sum = actual.home + actual.away;
    const isOver = sum > totalLine;
    if ((isOver && totalPick === 'OVER') || (!isOver && totalPick === 'UNDER')) {
      pts += 1;
    }
  }

  // Exact (+2)
  if (gaveExactNums && pred.exact_home === actual.home && pred.exact_away === actual.away) {
    pts += 2;
  }

  return pts;
}

// Basketball close-to-score mode:
// - Per-team points depending on distance to actual (exact / within5 / within10)
// - Optional winner bonus (winnerPoints)
// rules example:
// { "mode":"basketball_close",
//   "perTeam":{"exact":15,"within5":10,"within10":5},
//   "thresholds":{"within5":5,"within10":10},
//   "winnerPoints":0 }
function computeBasketballClosePoints(pred, actual, rules) {
  if (!actual) return 0;

  const perTeam = {
    exact:    Number(rules?.perTeam?.exact    ?? 15),
    within5:  Number(rules?.perTeam?.within5  ?? 10),
    within10: Number(rules?.perTeam?.within10 ?? 5),
  };
  const thresholds = {
    within5:  Number(rules?.thresholds?.within5  ?? 5),
    within10: Number(rules?.thresholds?.within10 ?? 10),
  };
  const winnerPts = Number(rules?.winnerPoints ?? 0);

  const ph = toIntOrNull(pred.exact_home ?? pred.home);
  const pa = toIntOrNull(pred.exact_away ?? pred.away);

  let pts = 0;

  // Per-team closeness
  if (Number.isInteger(ph)) {
    const dh = Math.abs(ph - actual.home);
    if (dh === 0) pts += perTeam.exact;
    else if (dh <= thresholds.within5)  pts += perTeam.within5;
    else if (dh <= thresholds.within10) pts += perTeam.within10;
  }
  if (Number.isInteger(pa)) {
    const da = Math.abs(pa - actual.away);
    if (da === 0) pts += perTeam.exact;
    else if (da <= thresholds.within5)  pts += perTeam.within5;
    else if (da <= thresholds.within10) pts += perTeam.within10;
  }

  // Optional winner bonus (auto-inferred from predicted scores if not set)
  if (winnerPts > 0) {
    let predictedWinner = (pred.winner || '').toUpperCase();
    if (!predictedWinner && Number.isInteger(ph) && Number.isInteger(pa) && ph !== pa) {
      predictedWinner = ph > pa ? 'HOME' : 'AWAY';
    }
    if (predictedWinner) {
      const homeWon = actual.home > actual.away;
      const ok = (predictedWinner === 'HOME' && homeWon) || (predictedWinner === 'AWAY' && !homeWon);
      if (ok) pts += winnerPts;
    }
  }

  return pts;
}

// Scorer selector (single source of truth)
function getScorer(rules) {
  if (rules?.mode === 'basketball_close')  return (p, a, f) => computeBasketballClosePoints(p, a, rules);
  if (rules?.mode === 'basketball_basic')  return (p, a, f) => computeBasketballPoints(p, a, f);
  return (p, a) => computeSoccerPoints(p, a);
}

/* ---------------- Fixtures helpers ---------------- */

function readConfig(req) {
  try {
    const raw = fs.readFileSync(CFG_PATH(req), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { season: 2025 };
  }
}

function readFixturesForWeek(req, week) {
  const cfg = readConfig(req);
  const fxBase = joinData(req, 'fixtures', `season-${cfg.season || 2025}`);
  const raw =
      readJson(path.join(fxBase, `week-${week}.json`), null)
   ?? readJson(path.join(fxBase, 'weeks', `week-${week}.json`), null);
  return normaliseFixtures(raw);
}

/* ---------------- Champions / post-season helpers ---------------- */

// From season totals array -> champions (handles ties)
function computeChampionsFromTotals(seasonTotalsArr = []) {
  if (!Array.isArray(seasonTotalsArr) || !seasonTotalsArr.length) {
    return { maxPoints: 0, champions: [] };
  }
  const maxPoints = Math.max(...seasonTotalsArr.map(r => Number(r.totalPoints || 0)));
  const champions = seasonTotalsArr
    .filter(r => Number(r.totalPoints || 0) === maxPoints)
    .map(r => ({ player_id: r.player_id, player: r.player, totalPoints: r.totalPoints }));
  return { maxPoints, champions };
}

// Flip tenant default competition if requested (idempotent)
function maybeFlipTenantDefaultCompetition(req, finalsComp, enabled) {
  if (!enabled || !finalsComp) return false;
  const marker = path.join(SCO_DIR(req), '.postseason_switched');
  if (safeStat(marker)) return false; // already flipped

  const tcfgPath = TENANT_CFG_PATH(req);
  const tcfg = readJson(tcfgPath, {}) || {};
  if (tcfg.defaultCompetition === finalsComp) {
    writeJson(marker, { flippedAt: new Date().toISOString(), finalsComp, already: true });
    return false;
  }
  tcfg.defaultCompetition = finalsComp;
  writeJson(tcfgPath, tcfg);
  writeJson(marker, { flippedAt: new Date().toISOString(), finalsComp, changed: true });
  return true;
}

// Called after we recompute season totals
function maybeHandlePostSeason(req, computedWeek, seasonTotalsArr) {
  const rules = readRules(req) || {};
  const post = rules.postSeason || null;
  if (!post) return;

  // Detect end of regular season from competition config
  const cfg = readConfig(req);
  const terminalWeek =
    Number(cfg.regular_season_weeks) || Number(cfg.total_weeks) || null;

  if (!terminalWeek || computedWeek < terminalWeek) return;

  // Persist champion.json
  const { maxPoints, champions } = computeChampionsFromTotals(seasonTotalsArr);
  const championFile = path.join(SCO_DIR(req), 'champion.json');
  const payload = {
    ok: true,
    season: Number(cfg.season || 2025),
    computedAtISO: new Date().toISOString(),
    week: computedWeek,
    maxPoints,
    champions
  };
  writeJson(championFile, payload);

  // Optional: auto flip default competition to finals
  const finalsComp = typeof post.autoSwitchTo === 'string' ? post.autoSwitchTo.trim() : '';
  const doFlip = !!post.autoFlipTenantDefault;
  maybeFlipTenantDefaultCompetition(req, finalsComp, doFlip);
}

/* ---------------- Compute helpers ---------------- */

function computeWeekTable(week, predMap, results, playersIndex, fixturesMap, rules) {
  const scoreFn = getScorer(rules);
  const table = []; // [{player_id, name, week_points}]
  for (const [pid, arr] of predMap.entries()) {
    let pts = 0;
    for (const p of arr) {
      const actual = results[p.id];
      const fx = fixturesMap.get(p.id) || null;
      pts += scoreFn(p, actual, fx);
    }
    table.push({
      player_id: pid,
      name: playersIndex.get(pid)?.name || '',
      week_points: pts
    });
  }
  table.sort((a, b) => b.week_points - a.week_points || a.name.localeCompare(b.name));
  return table;
}

/* -------- Season totals normalisation (array <-> map) -------- */

function seasonToMap(any) {
  const map = new Map(); // pid -> { player_id, player, totalPoints, weeksPlayed }
  if (Array.isArray(any)) {
    for (const row of any) {
      const pid = String(row.player_id ?? row.playerId ?? '');
      const player = String(row.player ?? row.name ?? '').trim();
      const totalPoints = Number(row.totalPoints ?? row.total ?? 0);
      const weeksPlayed = Number(row.weeksPlayed ?? row.weeks_played ?? 0);
      if (!pid && !player) continue;
      map.set(pid || player, { player_id: pid || player, player, totalPoints, weeksPlayed });
    }
  } else if (any && typeof any === 'object') {
    for (const [pid, v] of Object.entries(any)) {
      const player = String(v?.name ?? '').trim();
      const totalPoints = Number(v?.total ?? 0);
      const weeksPlayed = Number(v?.weeks_played ?? 0);
      map.set(String(pid), { player_id: String(pid), player, totalPoints, weeksPlayed });
    }
  }
  return map;
}

function seasonMapToArray(map) {
  return Array.from(map.values())
    .sort((a, b) => b.totalPoints - a.totalPoints || a.player.localeCompare(b.player));
}

/* ---------------- Rebuild season totals from weekly files (idempotent) ---------------- */

function rebuildSeasonTotalsFromWeeks(req) {
  const weeksDir = SCO_WEEKS(req);
  const totals = new Map(); // pid -> { player_id, player, totalPoints, weeksPlayed }
  try {
    fs.mkdirSync(weeksDir, { recursive: true });
    const entries = fs.readdirSync(weeksDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!/^week-\d+\.json$/i.test(ent.name)) continue;
      const weekArr = readJson(path.join(weeksDir, ent.name), []);
      const seenThisWeek = new Set();
      for (const row of weekArr) {
        const pid = String(row.player_id ?? '').trim();
        if (!pid) continue;
        const name = String(row.player ?? row.name ?? '').trim();
        const pts  = Number(row.weekPoints ?? row.week_points ?? row.points ?? 0);
        const cur = totals.get(pid) || { player_id: pid, player: name, totalPoints: 0, weeksPlayed: 0 };
        cur.player = name || cur.player;
        cur.totalPoints += pts;
        if (!seenThisWeek.has(pid)) { cur.weeksPlayed += 1; seenThisWeek.add(pid); }
        totals.set(pid, cur);
      }
    }
  } catch {/* noop */}

  // Ensure every registered player appears, even with zero totals
  const playersArr = readJson(PLAYERS(req), []);
  for (const p of playersArr) {
    const pid = String(p.id);
    if (!totals.has(pid)) {
      totals.set(pid, { player_id: pid, player: p.name || '', totalPoints: 0, weeksPlayed: 0 });
    }
  }

  return seasonMapToArray(totals);
}

/* ---------------- Core compute (shared) ---------------- */

function computeAndPersist(req, week) {
  const predsRaw   = readJson(path.join(PRED_DIR(req), `week-${week}.json`), null)
                   ?? readJson(path.join(LEGACY_PRED_DIR(req), `week-${week}.json`), null);
  const resultsRaw = readJson(path.join(RES_DIR(req),  `week-${week}.json`), null)
                   ?? readJson(path.join(LEGACY_RES_DIR(req),  `week-${week}.json`), null);
  const fixtures   = readFixturesForWeek(req, week);
  const rules      = readRules(req);

  const predMap  = normalisePredictions(predsRaw);
  const results  = normaliseResults(resultsRaw);

  const playersArr = readJson(PLAYERS(req), []);
  const playersIdx = new Map(playersArr.map(p => [String(p.id), { name: p.name || '' }]));

  const weekTable = computeWeekTable(week, predMap, results, playersIdx, fixtures, rules);

  // Persist weekly scores (competition-scoped + legacy alias in comp folder)
  const weeklyOut = weekTable.map(r => ({
    player_id: r.player_id,
    player: r.name,
    weekPoints: r.week_points
  }));
  writeJson(path.join(SCO_WEEKS(req), `week-${week}.json`), weeklyOut);
  writeJson(path.join(SCO_DIR(req),    `week-${week}.json`), weeklyOut); // legacy in-comp (kept)

  // Rebuild season totals from all week files (idempotent)
  const seasonTotalsArr = rebuildSeasonTotalsFromWeeks(req);
  writeJson(path.join(SCO_DIR(req), 'season-totals.json'), seasonTotalsArr);

  // Legacy map (optional; keeps old consumers happy)
  const legacy = {};
  for (const t of seasonTotalsArr) {
    legacy[t.player_id] = { name: t.player, total: t.totalPoints, weeks_played: t.weeksPlayed };
  }
  writeJson(path.join(SCO_DIR(req), 'season-totals.legacy.json'), legacy);

  // Include season total for each weekly row in response
  const totalsMap = new Map(seasonTotalsArr.map(t => [t.player_id, t]));
  const weeklyWithSeason = weeklyOut.map(r => {
    const tot = totalsMap.get(r.player_id);
    return { ...r, seasonTotal: tot ? tot.totalPoints : r.weekPoints };
  });

  // Post-season automation (champion + optional finals flip)
  maybeHandlePostSeason(req, week, seasonTotalsArr);

  return {
    week,
    saved: weeklyOut.length,
    weekly: weeklyWithSeason,
    seasonTotals: seasonTotalsArr
  };
}

/* ---------------- Small helpers for reads ---------------- */

function readSavedWeekly(req, week) {
  const p1 = path.join(SCO_WEEKS(req), `week-${week}.json`);
  const p2 = path.join(SCO_DIR(req),    `week-${week}.json`);
  return readJson(p1, readJson(p2, null));
}

/* ---------------- Endpoints ---------------- */

// Read current rules (handy for debugging)
router.get('/rules', (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  return res.json({ ok: true, path: RULES_PATH(req), rules: readRules(req) });
});

// Admin: upsert rules.json for the current tenant+competition (writes LIVE file)
router.post('/rules', express.json(), (req, res) => {
  try {
    const token = cleanToken(req.get('x-admin-token') || '');
    const expected = cleanToken(process.env.ADMIN_TOKEN || '');
    if (!token || !expected || token !== expected) {
      return res.status(401).json({ ok: false, error: 'invalid admin token' });
    }
    const p = RULES_PATH(req);
    writeJson(p, req.body || {});
    return res.json({ ok: true, path: p });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// Preview (no writes)
router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  const week = clampInt(req.query.week, 1, null);
  if (!week) return res.status(400).json({ ok: false, error: 'week required' });

  const predsRaw   = readJson(path.join(PRED_DIR(req), `week-${week}.json`), null)
                   ?? readJson(path.join(LEGACY_PRED_DIR(req), `week-${week}.json`), null);
  const resultsRaw = readJson(path.join(RES_DIR(req),  `week-${week}.json`), null)
                   ?? readJson(path.join(LEGACY_RES_DIR(req),  `week-${week}.json`), null);
  const fixtures   = readFixturesForWeek(req, week);
  const rules      = readRules(req);

  const predMap  = normalisePredictions(predsRaw);
  const results  = normaliseResults(resultsRaw);

  const playersArr = readJson(PLAYERS(req), []);
  const playersIdx = new Map(playersArr.map(p => [String(p.id), { name: p.name || '' }]));

  const table = computeWeekTable(week, predMap, results, playersIdx, fixtures, rules);

  return res.json({
    ok: true,
    week,
    fixturesCount: fixtures.size || Object.keys(results).length,
    playerCount: predMap.size,
    scores: table
  });
});

// Compute & persist (POST)
router.post('/compute', (req, res) => {
  const week = clampInt(req.body?.week, 1, null);
  if (!week) return res.status(400).json({ ok: false, error: 'week required' });

  const payload = computeAndPersist(req, week);
  return res.json({ ok: true, ...payload });
});

// Compute & persist (GET fallback for compatibility: /api/scores/compute?week=N)
router.get('/compute', (req, res) => {
  const week = clampInt(req.query?.week, 1, null);
  if (!week) return res.status(400).json({ ok: false, error: 'week required' });

  const payload = computeAndPersist(req, week);
  return res.json({ ok: true, ...payload });
});

// Return the saved weekly table verbatim if present (no compute/write)
router.get('/week', (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  const week = clampInt(req.query.week, 1, null);
  if (!week) return res.status(400).json({ ok: false, error: 'week required' });

  let weekly = readSavedWeekly(req, week);
  let saved = true;

  if (!Array.isArray(weekly)) {
    // If not saved yet, compute on the fly (no write)
    const predsRaw   = readJson(path.join(PRED_DIR(req), `week-${week}.json`), null)
                     ?? readJson(path.join(LEGACY_PRED_DIR(req), `week-${week}.json`), null);
    const resultsRaw = readJson(path.join(RES_DIR(req),  `week-${week}.json`), null)
                     ?? readJson(path.join(LEGACY_RES_DIR(req),  `week-${week}.json`), null);
    const fixtures   = readFixturesForWeek(req, week);
    const rules      = readRules(req);

    const predMap    = normalisePredictions(predsRaw);
    const results    = normaliseResults(resultsRaw);
    const playersArr = readJson(PLAYERS(req), []);
    const playersIdx = new Map(playersArr.map(p => [String(p.id), { name: p.name || '' }]));
    const table      = computeWeekTable(week, predMap, results, playersIdx, fixtures, rules);
    weekly = table.map(r => ({ player_id: r.player_id, player: r.name, weekPoints: r.week_points }));
    saved = false;
  }

  return res.json({ ok: true, week, saved, weekly });
});

// Summary — reads from disk; rebuilds missing totals; computes weekly on the fly if missing
router.get('/summary', (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  try {
    const week = clampInt(req.query.week, 1, null);

    // Season totals: read or rebuild (and persist) if missing
    let seasonTotals = readJson(path.join(SCO_DIR(req), 'season-totals.json'), null);
    if (!Array.isArray(seasonTotals)) {
      seasonTotals = rebuildSeasonTotalsFromWeeks(req);
      writeJson(path.join(SCO_DIR(req), 'season-totals.json'), seasonTotals);
      const legacy = {};
      for (const t of seasonTotals) legacy[t.player_id] = { name: t.player, total: t.totalPoints, weeks_played: t.weeksPlayed };
      writeJson(path.join(SCO_DIR(req), 'season-totals.legacy.json'), legacy);
    } else {
      // normalise shape if a legacy map slipped in
      seasonTotals = seasonMapToArray(seasonToMap(seasonTotals));
    }

    // Weekly: prefer saved file; if missing, compute on the fly (no write)
    let weekly = null;
    if (week != null) {
      weekly = readJson(path.join(SCO_WEEKS(req), `week-${week}.json`), null);
      if (!Array.isArray(weekly)) {
        const predsRaw   = readJson(path.join(PRED_DIR(req), `week-${week}.json`), null)
                         ?? readJson(path.join(LEGACY_PRED_DIR(req), `week-${week}.json`), null);
        const resultsRaw = readJson(path.join(RES_DIR(req),  `week-${week}.json`), null)
                         ?? readJson(path.join(LEGACY_RES_DIR(req),  `week-${week}.json`), null);
        const fixtures   = readFixturesForWeek(req, week);
        const rules      = readRules(req);

        const predMap    = normalisePredictions(predsRaw);
        const results    = normaliseResults(resultsRaw);
        const playersArr = readJson(PLAYERS(req), []);
        const playersIdx = new Map(playersArr.map(p => [String(p.id), { name: p.name || '' }]));
        const table      = computeWeekTable(week, predMap, results, playersIdx, fixtures, rules);
        weekly = table.map(r => ({ player_id: r.player_id, player: r.name, weekPoints: r.week_points }));
      }
    }

    const stat = safeStat(path.join(SCO_DIR(req), 'season-totals.json'));
    return res.json({
      ok: true,
      week,
      updatedAtISO: stat?.mtime ? new Date(stat.mtime).toISOString() : null,
      seasonTotals,
      weekly
    });
  } catch (e) {
    console.error('summary_failed', e);
    res.status(500).json({ ok: false, error: 'summary_failed' });
  }
});

// ---- Player week breakdown: predictions + results + per-match points (basketball/soccer)

function findPlayerByName(playersArr, name) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  return playersArr.find(p => String(p.name || '').trim().toLowerCase() === n) || null;
}

router.get('/player-week', (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  const week = clampInt(req.query.week, 1, null);
  if (!week) return res.status(400).json({ ok: false, error: 'week required' });

  const playersArr = readJson(PLAYERS(req), []);
  let playerId = (req.query.player_id || req.query.playerId || '').toString().trim();
  let playerName = (req.query.name || req.query.player || '').toString().trim();

  if (!playerId && playerName) {
    const hit = findPlayerByName(playersArr, playerName);
    if (hit) playerId = String(hit.id), playerName = hit.name;
  }
  if (!playerId) return res.status(400).json({ ok: false, error: 'player_id or name required' });

  const fixtures = readFixturesForWeek(req, week);
  const rules    = readRules(req);
  const scoreFn  = getScorer(rules);

  const predsRaw   = readJson(path.join(PRED_DIR(req), `week-${week}.json`), null)
                   ?? readJson(path.join(LEGACY_PRED_DIR(req), `week-${week}.json`), null);
  const resultsRaw = readJson(path.join(RES_DIR(req),  `week-${week}.json`), null)
                   ?? readJson(path.join(LEGACY_RES_DIR(req),  `week-${week}.json`), null);

  const predMap  = normalisePredictions(predsRaw);
  const results  = normaliseResults(resultsRaw);

  const playerPreds = new Map((predMap.get(playerId) || []).map(p => [String(p.id), p]));

  let weekPoints = 0, exactCount = 0, outcomeCount = 0, pendingCount = 0, missedCount = 0;

  const rows = [];
  const ids = fixtures.size ? Array.from(fixtures.keys()) : Array.from(new Set([
    ...Object.keys(results), ...Array.from(playerPreds.keys())
  ]));

  for (const id of ids) {
    const fx = fixtures.get(id) || { id, homeTeam: 'Home', awayTeam: 'Away', kickoffISO: null, spread_line: null, total_line: null };
    const pred   = playerPreds.get(id) || null;
    const actual = results[id] || null;

    let pts = null;
    if (actual && pred) {
      pts = scoreFn(pred, actual, fx);
      weekPoints += pts;

      // Tally details (works for both soccer & basketball basic; for close mode, exactCount still counts only perfect exacts)
      const gaveExact = Number.isInteger(pred.exact_home) && Number.isInteger(pred.exact_away);
      if (gaveExact && actual && pred.exact_home === actual.home && pred.exact_away === actual.away) {
        exactCount++;
      } else if (actual) {
        // Outcome: soccer via numeric outcome; basketball via winner pick / inferred
        let outcomeOk = false;
        if (rules && (rules.mode === 'basketball_basic' || rules.mode === 'basketball_close')) {
          let w = (pred.winner || '').toUpperCase();
          if (!w && Number.isInteger(pred.exact_home) && Number.isInteger(pred.exact_away) && pred.exact_home !== pred.exact_away) {
            w = pred.exact_home > pred.exact_away ? 'HOME' : 'AWAY';
          }
          if (w) {
            const homeWon = actual.home > actual.away;
            outcomeOk = (w === 'HOME' && homeWon) || (w === 'AWAY' && !homeWon);
          }
        } else {
          const ph = toIntOrNull(pred.exact_home ?? pred.home);
          const pa = toIntOrNull(pred.exact_away ?? pred.away);
          if (Number.isInteger(ph) && Number.isInteger(pa)) {
            const predOutcome = ph === pa ? 'D' : (ph > pa ? 'H' : 'A');
            const realOutcome = actual.home === actual.away ? 'D' : (actual.home > actual.away ? 'H' : 'A');
            outcomeOk = predOutcome === realOutcome && !(ph === actual.home && pa === actual.away);
          }
        }
        if (outcomeOk) outcomeCount++;
      }
    } else if (!actual) {
      pendingCount++;
    } else if (actual && !pred) {
      missedCount++;
    }

    rows.push({
      matchId: id,
      homeTeam: fx.homeTeam,
      awayTeam: fx.awayTeam,
      kickoffISO: fx.kickoffISO,
      lines: {
        spread_line: fx.spread_line,
        total_line: fx.total_line
      },
      prediction: pred ? {
        winner: pred.winner,
        spread_pick: pred.spread_pick,
        total_pick: pred.total_pick,
        exact_home: pred.exact_home ?? pred.home ?? null,
        exact_away: pred.exact_away ?? pred.away ?? null
      } : null,
      result: actual ? { home: actual.home, away: actual.away } : null,
      points: pts
    });
  }

  const player = playersArr.find(p => String(p.id) === String(playerId)) || { id: playerId, name: playerName || '' };

  return res.json({
    ok: true,
    week,
    player: { id: String(player.id), name: player.name || playerName || '' },
    rows,
    totals: { weekPoints, exactCount, outcomeCount, pendingCount, missedCount }
  });
});

/* ---------- Weekly Matrix (per-week points + season total) ---------- */
// GET /api/scores/leaderboard/matrix?window=5&endWeek=auto
router.get('/leaderboard/matrix', async (req, res) => {
  try {
    const WEEKS_DIR  = SCO_WEEKS(req);

    // list available week-N.json files
    const files = await fsp.readdir(WEEKS_DIR).catch(() => []);
    const weekNums = files
      .map(f => (f.match(/^week-(\d+)\.json$/) || [])[1])
      .filter(Boolean)
      .map(n => parseInt(n, 10))
      .sort((a, b) => a - b);

    if (weekNums.length === 0) {
      return res.json({ weeks: [], rows: [] });
    }

    const window   = Math.max(1, Math.min(parseInt(req.query.window, 10) || 5, 38));
    const endWeek  = req.query.endWeek ? parseInt(req.query.endWeek, 10) : weekNums[weekNums.length - 1];
    const startWeek = Math.max(1, endWeek - window + 1);
    const selectedWeeks = weekNums.filter(w => w >= startWeek && w <= endWeek);

    // read a week file and normalise shape
    async function readWeek(w) {
      const p = path.join(WEEKS_DIR, `week-${w}.json`);
      const json = JSON.parse(await fsp.readFile(p, 'utf8'));

      const mapRow = (r) => ({
        player_id: r.player_id ?? r.id ?? r.player ?? r.name,
        name:      r.name ?? String(r.player ?? r.player_id ?? r.id),
        points:    Number(r.weekPoints ?? r.points ?? r.total ?? r.score ?? 0),
      });

      if (Array.isArray(json)) return json.map(mapRow);
      if (Array.isArray(json.players)) return json.players.map(mapRow);
      if (Array.isArray(json.scores))  return json.scores.map(mapRow);
      return [];
    }

    // build player maps
    const players = new Map();      // id -> name
    const perWeek = new Map();      // id -> { [week]: pts }

    for (const w of selectedWeeks) {
      const rows = await readWeek(w);
      for (const r of rows) {
        const id = String(r.player_id ?? r.name);
        players.set(id, r.name ?? id);
        if (!perWeek.has(id)) perWeek.set(id, {});
        perWeek.get(id)[w] = r.points || 0;
      }
    }

    // totals up to endWeek (season-to-date)
    const totalsToDate = new Map();
    for (const id of players.keys()) {
      let total = 0;
      for (const w of weekNums) {
        if (w > endWeek) break;
        total += perWeek.get(id)?.[w] ?? 0;
      }
      totalsToDate.set(id, total);
    }

    // rows + rank
    const rows = [...players.keys()].map(id => ({
      player_id: id,
      name: players.get(id),
      weekly: Object.fromEntries(selectedWeeks.map(w => [w, perWeek.get(id)?.[w] ?? 0])),
      total: totalsToDate.get(id) || 0,
    }));

    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    let last = null, rank = 0, seen = 0;
    for (const r of rows) {
      seen += 1;
      if (r.total !== last) { rank = seen; last = r.total; }
      r.rank = rank;
    }

    res.json({ startWeek, endWeek, weeks: selectedWeeks, rows });
  } catch (err) {
    console.error('leaderboard/matrix error', err);
    res.status(500).json({ error: 'leaderboard matrix failed', details: String(err) });
  }
});

/* ---------- Champion endpoint ---------- */
// Returns champion.json if present, else computes from season-totals.json on the fly
router.get('/champion', (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  const championFile = path.join(SCO_DIR(req), 'champion.json');
  let data = readJson(championFile, null);

  if (!data) {
    const cfg = readConfig(req);
    const seasonTotals = readJson(path.join(SCO_DIR(req), 'season-totals.json'), []);
    const normTotals = seasonMapToArray(seasonToMap(seasonTotals));
    const { maxPoints, champions } = computeChampionsFromTotals(normTotals);
    data = {
      ok: true,
      season: Number(cfg.season || 2025),
      computedAtISO: new Date().toISOString(),
      maxPoints,
      champions
    };
  }

  return res.json(data);
});

module.exports = router;
