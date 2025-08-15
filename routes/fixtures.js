// routes/fixtures.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const DATA_PATH = path.join(__dirname, "..", "data", "fixtures_by_week.json");

// -------- IO helpers
function loadFixturesFile() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    return {};
  }
}
function saveFixturesFile(obj) {
  const tmp = DATA_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, DATA_PATH);
}

// -------- Admin guard (header or Bearer)
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

// -------- GET /api/fixtures?week=1
router.get("/", (req, res) => {
  const week = String(req.query.week || "").trim();
  if (!week) return res.status(400).json({ error: "Missing week" });

  const all = loadFixturesFile();
  const fixtures = all[week];
  if (!fixtures) return res.status(404).json({ error: "No fixtures for week" });

  return res.json({ week, fixtures });
});

// -------- POST /api/fixtures/update  (admin only)
// body: { week, updates: [{ id, kickoff?, ft_home?, ft_away? }] }
router.post("/update", requireAdmin, express.json(), (req, res) => {
  const { week, updates } = req.body || {};
  if (!week || !Array.isArray(updates)) {
    return res.status(400).json({ error: "week and updates[] required" });
  }

  const all = loadFixturesFile();
  if (!all[week]) return res.status(404).json({ error: "Week not found" });

  const byId = new Map((all[week] || []).map(f => [f.id, f]));

  const toScore = v =>
    v === "" || v === null || v === undefined ? null : Number.parseInt(v, 10);

  for (const u of updates) {
    if (!u || typeof u !== "object" || typeof u.id !== "string") {
      return res.status(400).json({ error: "each update needs a valid id" });
    }
    const row = byId.get(u.id);
    if (!row) return res.status(400).json({ error: `Unknown fixture id ${u.id}` });

    // kickoff: accept ISO string (keep as-is if provided)
    if (u.kickoff !== undefined) {
      const k = String(u.kickoff || "").trim();
      row.kickoff = k; // optional: validate Date.parse(k)
    }

    if (u.ft_home !== undefined) {
      const n = toScore(u.ft_home);
      row.ft_home = Number.isNaN(n) ? null : n;
    }
    if (u.ft_away !== undefined) {
      const n = toScore(u.ft_away);
      row.ft_away = Number.isNaN(n) ? null : n;
    }
  }

  all[week] = Array.from(byId.values());
  saveFixturesFile(all);

  return res.json({ ok: true, week: String(week), count: updates.length });
});

module.exports = router;
