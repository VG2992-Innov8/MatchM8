// routes/scores.js (hardened)
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const router = express.Router();

const DATA_DIR         = path.join(__dirname, "..", "data");
const FIXTURES_PATH    = path.join(DATA_DIR, "fixtures_by_week.json");
const PREDICTIONS_PATH = path.join(DATA_DIR, "predictions.json");
const SCORES_PATH      = path.join(DATA_DIR, "scores.json");

// ---------- IO helpers
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readJSON(absPath, fallback) {
  try { return JSON.parse(fs.readFileSync(absPath, "utf8")); }
  catch { return fallback; }
}
function atomicWriteJSON(absPath, obj) {
  ensureDataDir();
  const tmp = absPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, absPath);
}

// ---------- Domain helpers
function loadFixtures(week) {
  const all = readJSON(FIXTURES_PATH, {});
  return all[String(week)];
}
function loadPredictionsWeek(week) {
  const all = readJSON(PREDICTIONS_PATH, {});
  const w = all[String(week)];
  // ensure shape: { player: [ {fixture_id, home, away} ] }
  if (!w || typeof w !== "object") return {};
  return w;
}

function toIntOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}
function resultOf(home, away) {
  if (home == null || away == null) return null;
  if (home > away) return 1;
  if (away > home) return -1;
  return 0;
}
function pointsFor(predHome, predAway, ftHome, ftAway) {
  const ph = toIntOrNull(predHome);
  const pa = toIntOrNull(predAway);
  const fh = toIntOrNull(ftHome);
  const fa = toIntOrNull(ftAway);
  if (fh == null || fa == null || ph == null || pa == null) return 0;
  if (ph === fh && pa === fa) return 5;
  return resultOf(ph, pa) === resultOf(fh, fa) ? 2 : 0;
}
function computeChecksum(fixtures) {
  // Stable hash of FT results for the week (order-independent)
  const lines = (fixtures || [])
    .filter(f => f && typeof f.id === "string")
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(f => {
      const fh = toIntOrNull(f.ft_home);
      const fa = toIntOrNull(f.ft_away);
      return `${f.id}:${fh == null ? "" : fh}-${fa == null ? "" : fa}`;
    });
  return crypto.createHash("sha1").update(lines.join("|")).digest("hex");
}

// ---------- Core scoring (robust to dirty data)
function scoreWeek(week) {
  const fixtures = loadFixtures(week);
  if (!fixtures) return { error: "Unknown week" };

  const resultMap = new Map(
    fixtures
      .filter(f => f && typeof f.id === "string")
      .map(f => [f.id, { ft_home: f.ft_home, ft_away: f.ft_away }])
  );

  const byPlayer = loadPredictionsWeek(week); // { player: [preds] }
  const playersTotals = {};
  const breakdown = {};

  for (const [player, predsRaw] of Object.entries(byPlayer)) {
    const preds = Array.isArray(predsRaw) ? predsRaw : [];
    let total = 0;
    const rows = [];

    for (const p of preds) {
      if (!p || typeof p !== "object") continue;
      const fid = typeof p.fixture_id === "string" ? p.fixture_id : "";
      if (!fid) continue; // skip legacy/invalid rows

      const r = resultMap.get(fid); // may be undefined if fixture removed
      const pts = r ? pointsFor(p.home, p.away, r.ft_home, r.ft_away) : 0;
      total += pts;
      rows.push({ fixture_id: fid, points: pts });
    }

    playersTotals[player] = total;
    rows.sort((a, b) => (a.fixture_id || "").localeCompare(b.fixture_id || ""));
    breakdown[player] = rows;
  }

  const checksum = computeChecksum(fixtures);
  return { players: playersTotals, breakdown, checksum };
}

// ---------- POST /api/scores/calc
// Body: { "week":"1", "preview": true|false, "overwrite": true|false }
router.post("/calc", express.json(), (req, res) => {
  const { week, preview = false, overwrite = false } = req.body || {};
  if (!week) return res.status(400).json({ error: "week required" });

  const fixtures = loadFixtures(week);
  if (!fixtures) return res.status(400).json({ error: "Unknown week" });

  const scored = scoreWeek(week);
  if (scored.error) return res.status(400).json(scored);

  if (preview) {
    return res.json({ ok: true, preview: true, week: String(week), ...scored });
  }

  const allScores = readJSON(SCORES_PATH, { weeks: {}, season_totals: {} });
  const prevWeek = allScores.weeks?.[String(week)];
  const prevChecksum = prevWeek?.result_checksum || null;

  if (!overwrite && prevChecksum === scored.checksum) {
    return res.json({
      ok: true,
      skipped: true,
      reason: "unchanged",
      week: String(week),
      checksum: scored.checksum
    });
  }

  const nowISO = new Date().toISOString();
  if (!allScores.weeks) allScores.weeks = {};
  allScores.weeks[String(week)] = {
    scored_at: nowISO,
    result_checksum: scored.checksum,
    players: scored.players,
    breakdown: scored.breakdown
  };

  // Recompute season totals
  const totals = {};
  for (const wk of Object.keys(allScores.weeks)) {
    const ps = allScores.weeks[wk].players || {};
    for (const [name, pts] of Object.entries(ps)) {
      totals[name] = (totals[name] || 0) + (toIntOrNull(pts) || 0);
    }
  }
  allScores.season_totals = totals;

  atomicWriteJSON(SCORES_PATH, allScores);

  return res.json({
    ok: true,
    saved: true,
    week: String(week),
    scored_at: nowISO,
    players: scored.players,
    season_totals: totals,
    checksum: scored.checksum,
    overwrite: !!overwrite
  });
});

// ---------- GET /api/scores/summary?week=1
router.get("/summary", (req, res) => {
  const week = String(req.query.week || "").trim();
  if (!week) return res.status(400).json({ error: "Missing week" });

  const allScores = readJSON(SCORES_PATH, { weeks: {}, season_totals: {} });
  const wk = allScores.weeks?.[week];
  if (!wk) return res.status(404).json({ error: "Week not scored yet" });

  return res.json({
    week,
    scored_at: wk.scored_at,
    players: wk.players,
    breakdown: wk.breakdown,
    checksum: wk.result_checksum
  });
});

// ---------- GET /api/scores/season
router.get("/season", (_req, res) => {
  const allScores = readJSON(SCORES_PATH, { weeks: {}, season_totals: {} });
  return res.json({
    season_totals: allScores.season_totals || {},
    weeks_scored: Object.keys(allScores.weeks || {}).length
  });
});

module.exports = router;
