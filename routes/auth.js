// routes/auth.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const DATA_DIR     = path.join(__dirname, "..", "data");
const PLAYERS_PATH = path.join(DATA_DIR, "players.json");

// ---- Config (env)
const MAX_ATTEMPTS = Number(process.env.PIN_MAX_ATTEMPTS || 5);
const LOCK_MS      = Number(process.env.PIN_LOCK_MS || 15 * 60 * 1000); // 15 minutes

// ---- Helpers: IO
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readJSON(abs, fallback) {
  try { return JSON.parse(fs.readFileSync(abs, "utf8")); } catch { return fallback; }
}
function writeJSON(abs, obj) {
  ensureDataDir();
  const tmp = abs + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, abs);
}

// ---- Players store shape
// Accept either { "players": [ ... ] } or bare [ ... ]
function loadPlayers() {
  const raw = readJSON(PLAYERS_PATH, { players: [] });
  if (Array.isArray(raw)) return { players: raw };
  if (!Array.isArray(raw.players)) raw.players = [];
  return raw;
}
function savePlayers(obj) { writeJSON(PLAYERS_PATH, obj); }
function findPlayerByName(list, name) {
  const n = String(name || "").trim().toLowerCase();
  return list.find(p => String(p.name || "").trim().toLowerCase() === n) || null;
}

// ---- In-memory PIN attempts / lockouts
const attempts = new Map(); // { key: { count, locked_until } }
function keyFor(name) { return String(name || "").trim().toLowerCase(); }
function resetAttempts(name) { attempts.delete(keyFor(name)); }
function recordFail(name) {
  const k = keyFor(name);
  const cur = attempts.get(k) || { count: 0, locked_until: 0 };
  const next = { ...cur, count: cur.count + 1 };
  if (next.count >= MAX_ATTEMPTS) {
    next.locked_until = Date.now() + LOCK_MS;
    next.count = 0;
  }
  attempts.set(k, next);
  return next;
}
function checkLocked(name) {
  const cur = attempts.get(keyFor(name));
  if (!cur) return 0;
  const now = Date.now();
  if (cur.locked_until && cur.locked_until > now) return cur.locked_until - now;
  return 0;
}

// ---- Admin guard middleware (reads env per request)
function requireAdmin(req, res, next) {
  const ADMIN_KEY = process.env.ADMIN_KEY || "";
  const hdr = req.headers["x-admin-key"] || "";
  const auth = req.headers["authorization"] || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const provided = String(hdr || bearer || "").trim();
  if (!ADMIN_KEY || provided !== ADMIN_KEY) {
    return res.status(401).json({ error: "Admin auth required" });
  }
  next();
}

// ---------- Routes

// Admin: list players (names only)
router.get("/players", requireAdmin, (_req, res) => {
  const db = loadPlayers();
  res.json({ players: db.players.map(p => ({ name: p.name })) });
});

// Admin: set or update a player's PIN
// Body: { "name":"Vince", "pin":"1111" }
router.post("/pin/set", requireAdmin, express.json(), (req, res) => {
  const { name, pin } = req.body || {};
  if (!name || !pin) return res.status(400).json({ error: "name and pin required" });

  const db = loadPlayers();
  const existing = findPlayerByName(db.players, name);
  if (existing) existing.pin = String(pin);
  else db.players.push({ name: String(name), pin: String(pin) });

  savePlayers(db);
  resetAttempts(name); // clear lockout
  res.json({ ok: true, name: String(name) });
});

// Player: verify PIN (with lockout)
// Body: { "name":"Vince", "pin":"1111" }
router.post("/pin/verify", express.json(), (req, res) => {
  const { name, pin } = req.body || {};
  if (!name || !pin) return res.status(400).json({ error: "name and pin required" });

  const remain = checkLocked(name);
  if (remain > 0) {
    return res.status(423).json({ error: "Locked. Try later.", ms_remaining: remain });
  }

  const db = loadPlayers();
  const player = findPlayerByName(db.players, name);
  if (!player || String(player.pin) !== String(pin)) {
    const state = recordFail(name);
    if (state.locked_until) {
      return res.status(423).json({ error: "Locked due to repeated failures.", ms_remaining: LOCK_MS });
    }
    return res.status(401).json({ error: "Invalid name or PIN", attempts_left: Math.max(0, (MAX_ATTEMPTS - state.count)) });
  }

  resetAttempts(name);
  res.json({ ok: true, name: String(player.name) });
});

// Admin: ping
router.get("/admin/ping", requireAdmin, (_req, res) => res.json({ ok: true, admin: true }));

module.exports = router;
