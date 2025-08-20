const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const DATA_ROOT = path.join(__dirname, '../data');

function readPlayers() {
  const p = path.join(DATA_ROOT, 'players.json');
  try {
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    // Only expose id and name to the client
    return arr
      .filter(p => !!p && typeof p.name === 'string')
      .map(p => ({ id: p.id, name: p.name }));
  } catch (e) {
    return [];
  }
}

/**
 * GET /api/players  (also mounted at /players)
 * Returns [{ id, name }]
 */
router.get('/', (_req, res) => {
  res.json(readPlayers());
});

module.exports = router;
