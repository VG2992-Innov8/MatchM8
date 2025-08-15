// routes/predictions.js
// CommonJS Express router for MatchM8 predictions
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const router = express.Router();

// ---------- File paths
const DATA_DIR         = path.join(__dirname, "..", "data");
const PREDICTIONS_PATH = path.join(DATA_DIR, "predictions.json");
const FIXTURES_PATH    = path.join(DATA_DIR, "fixtures_by_week.json");
// Optional players file (if you want to validate players/PINs later)
const PLAYERS_PATH     = path.join(DATA_DIR, "players.json");

// ---------- Env toggles
// Set DEV_BYPASS_LOCK=1 in .env to allow late predictions during local dev
const DEV_BYPASS_LOCK  = process.env.DEV_BYPASS_LOCK === "1";

// Require a PIN match for saving predictions (optional, default off)
const REQUIRE_PIN      = process.env.REQUIRE_PIN === "1";

// ---------- Helpers: IO (atomic writes)
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function atomicWriteJSON(absPath, obj) {
  ensureDataDir();
  const tmp = absPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, absPath);
}
function readJSON(absPath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(absPath, "utf8"));
  } catch {
    return fallback;
  }
}

// ---------- Helpers: domain
function loadFixturesForWeek(week) {
  const all = readJSON(FIXTURES_PATH, {});
  return all[String(week)];
}
function isLocked(kickoffISO) {
  if (DEV_BYPASS_LOCK) return false;
  if (!kickoffISO) return false; // choose strict=true if you prefer locking when missing
  const ko = Date.parse(kickoffISO);
  if (Number.isNaN(ko)) return false;
  return Date.now() >= ko;
}
function validatePredictionsArray(arr) {
  if (!Array.isArray(arr)) return "predictions must be an array";
  for (const p of arr) {
    if (!p || typeof p !== "object") return "each prediction must be an object";
    if (!p.fixture_id || typeof p.fixture_id !== "string") return "missing fixture_id";
    if (!Number.isInteger(p.home) || p.home < 0) return "home must be an integer ≥ 0";
    if (!Number.isInteger(p.away) || p.away < 0) return "away must be an integer ≥ 0";
  }
  return null;
}
function normalizePlayerName(name) {
  return String(name || "").trim();
}
function hashKey(input) {
  return crypto.createHash("sha1").update(String(input)).digest("hex");
}

// Optional PIN check (no-op by default)
function verifyPinIfRequired(playerName, pin) {
  if (!REQUIRE_PIN) return true; // disabled
  const players = readJSON(PLAYERS_PATH, {}); // shape suggestion: { players: [{name, pin}], ... }
  const list = Array.isArray(players.players) ? players.players : [];
  const found = list.find(p => (p.name || "").toLowerCase() === (playerName || "").toLowerCase());
  if (!found) return false;
  return String(found.pin) === String(pin);
}

// ---------- Data shape for predictions.json (recommended)
// {
//   "1": {
//     "Vince": [
//       { "fixture_id": "W1-M1", "home": 1, "away": 0, "saved_at": "ISO" },
//       ...
//     ],
//     "Toby": [ ... ]
//   },
//   "2": { ... }
// }
function loadPredictions() {
  return readJSON(PREDICTIONS_PATH, {});
}
function savePredictions(obj) {
  atomicWriteJSON(PREDICTIONS_PATH, obj);
}

// ---------- GET /api/predictions?week=1&player=Vince
// Returns stored predictions for a given week/player
router.get("/", (req, res) => {
  const week = String(req.query.week || "").trim();
  const player = normalizePlayerName(req.query.player);

  if (!week)  return res.status(400).json({ error: "Missing week" });
  if (!player) return res.status(400).json({ error: "Missing player" });

  const all = loadPredictions();
  const byWeek = all[week] || {};
  const entries = byWeek[player] || [];

  return res.json({ week, player, predictions: entries });
});

// ---------- POST /api/predictions/save
// Body:
// {
//   "week": "1",
//   "player": "Vince",
//   "pin": "1111"                 (optional: only checked if REQUIRE_PIN=1)
//   "predictions": [
//     {"fixture_id":"W1-M1","home":1,"away":1},
//     ...
//   ]
// }
router.post("/save", express.json(), (req, res) => {
  const { week, player, pin, predictions } = req.body || {};
  if (!week)  return res.status(400).json({ error: "week required" });

  const playerName = normalizePlayerName(player);
  if (!playerName) return res.status(400).json({ error: "player required" });

  // Optional PIN check
  if (!verifyPinIfRequired(playerName, pin)) {
    return res.status(401).json({ error: "Invalid PIN or player" });
  }

  // Validate predictions array
  const err = validatePredictionsArray(predictions);
  if (err) return res.status(400).json({ error: err });

  // Load fixtures for lock checks
  const fixtures = loadFixturesForWeek(week);
  if (!fixtures) return res.status(400).json({ error: "Unknown week" });

  const kickoffMap = new Map(fixtures.map(f => [f.id, f.kickoff]));

  // Enforce lock: if any prediction's fixture is past kickoff → reject
  for (const p of predictions) {
    const ko = kickoffMap.get(p.fixture_id);
    if (isLocked(ko)) {
      return res.status(423).json({
        error: "Predictions closed for one or more fixtures",
        fixture_id: p.fixture_id,
        kickoff: ko || null
      });
    }
  }

  // Merge/upsert predictions for this player & week
  const all = loadPredictions();
  if (!all[week]) all[week] = {};

  // Keep any existing predictions that are for fixtures NOT in this payload
  const existing = Array.isArray(all[week][playerName]) ? all[week][playerName] : [];
  const existingMap = new Map(existing.map(e => [e.fixture_id, e]));

  const nowISO = new Date().toISOString();
  for (const p of predictions) {
    existingMap.set(p.fixture_id, {
      fixture_id: p.fixture_id,
      home: p.home,
      away: p.away,
      saved_at: nowISO
    });
  }

  // Persist back in stable order (by fixture_id)
  const merged = Array.from(existingMap.values()).sort((a, b) =>
    a.fixture_id.localeCompare(b.fixture_id)
  );
  all[week][playerName] = merged;

  savePredictions(all);

  return res.json({
    ok: true,
    week: String(week),
    player: playerName,
    count: merged.length,
    saved: predictions.length,
    dev_bypass_lock: DEV_BYPASS_LOCK
  });
});

module.exports = router;
