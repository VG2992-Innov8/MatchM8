// routes/fixtures.js
const express = require('express');
const router = express.Router();
const { loadFixturesForWeek } = require('../lib/fixtures');

router.get('/', (req, res) => {
  const week = Number(req.query.week || 1);
  const fixtures = loadFixturesForWeek(week) || [];
  res.json({ ok: true, week, fixtures });
});

module.exports = router;
