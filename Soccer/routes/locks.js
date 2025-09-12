// routes/locks.js
const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const { computeLockStatus } = require("../lib/locks");

const router = express.Router();

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return null; }
}

router.get("/", async (req, res) => {
  try {
    const week = Number(req.query.week || 1);
    const config = (await readJson(path.join("data", "config.json"))) || {};
    const fxPath = path.join("data", "fixtures", "season-2025", `week-${week}.json`);
    const fixtures = (await readJson(fxPath)) || [];

    const status = computeLockStatus(fixtures, config);
    res.json({
      week,
      mode: status.mode,
      weekLocked: status.weekLocked,
      weekLockAtISO: status.weekLockAtISO,
      locks: status.map, // { [matchId]: {locked, kickoffISO, lockAtISO} }
    });
  } catch (e) {
    res.status(500).json({ error: "lock_status_failed", message: e.message });
  }
});

module.exports = router;
