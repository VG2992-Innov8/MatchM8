// routes/admin-reminders.js
const express = require("express");
const router = express.Router();
const { preview, sendBatch } = require("../services/reminders");
const path = require("path");
const fs = require("fs/promises");
const { computeLockStatus } = require("../lib/locks");

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
async function readJSON(p) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return null; }
}

router.get("/preview", requireAdmin, async (req, res) => {
  const week = Number(req.query.week || 1);
  const minutes = Number(req.query.minutes || 180);
  const out = await preview(week, minutes);
  res.json(out);
});

router.post("/send-now", requireAdmin, async (req, res) => {
  const week = Number(req.body.week);
  const scope = req.body.scope || "week"; // "week" or specific matchId
  const type = req.body.type || "T2";     // "T24" or "T2"

  if (!week) return res.status(400).json({ error: "week_required" });

  // Build a synthetic target and run sendBatch once
  // Load data to resolve tz and sanity
  const config = (await readJSON(path.join("data", "config.json"))) || {};
  const tz = config.timezone || "UTC";

  const atISO = new Date().toISOString(); // immediate
  const target = { type, scope, at: require("luxon").DateTime.fromISO(atISO).setZone(tz) };

  // Reuse internal collect/send
  const { DateTime } = require("luxon");
  const fixtures = (await readJSON(path.join("data","fixtures","season-2025",`week-${week}.json`))) || [];
  const lockStatus = computeLockStatus(fixtures, config);
  const data = {
    config, tz, fixtures,
    predictions: (await readJSON(path.join("data","predictions",`week-${week}.json`))) || {},
    players: (await readJSON(path.join("data","players.json"))) || [],
    lockStatus
  };
  // Normalise players to array if needed
  data.players = Array.isArray(data.players) ? data.players : Object.values(data.players || {});

  const result = await sendBatch({ week, data, target });
  res.json({ ok: true, ...result });
});

module.exports = router;
