// routes/fixtures.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data', 'fixtures', 'season-2025');

router.get('/', (req, res) => {
  const week = Number(req.query.week || 1);
  const fpath = path.join(DATA_DIR, `week-${week}.json`);
  try {
    const txt = fs.readFileSync(fpath, 'utf8');
    const arr = JSON.parse(txt);
    return res.json(arr); // plain array
  } catch {
    return res.status(404).json([]);
  }
});

module.exports = router;

