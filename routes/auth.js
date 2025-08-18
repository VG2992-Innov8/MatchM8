const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// --- Helpers ---
const playersPath = path.join(__dirname, '../data/players.json');

const loadPlayers = () => {
  return JSON.parse(fs.readFileSync(playersPath));
};

const savePlayers = (players) => {
  fs.writeFileSync(playersPath, JSON.stringify(players, null, 2));
};

// --- Set PIN manually ---
router.post('/pin/set', (req, res) => {
  const { name, pin } = req.body;
  const players = loadPlayers();
  const player = players.find(p => p.name === name);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  player.pin = pin;
  savePlayers(players);
  res.json({ ok: true });
});

// --- Verify PIN login (name or email) ---
// Verify PIN login
router.post('/pin/verify', (req, res) => {
  const { name, email, pin } = req.body;
  const players = readJSON('data/players.json');

  const player = players.find(p =>
    (p.name?.toLowerCase() === name?.toLowerCase() || 
     p.email?.toLowerCase() === email?.toLowerCase()) &&
    p.pin === pin
  );

  if (player) {
    res.json({ player_id: player.id });
  } else {
    res.status(401).json({ error: 'Invalid login' });
  }
});


// --- Get current session info ---
router.get('/me', (req, res) => {
  const id = req.cookies?.player_id;
  const players = loadPlayers();
  const player = players.find(p => p.id === Number(id));
  if (!player) return res.status(401).json({ error: 'Not logged in' });
  res.json(player);
});

// --- Log out ---
router.post('/logout', (req, res) => {
  res.clearCookie('player_id');
  res.sendStatus(200);
});

// --- Register new player ---
router.post('/register', (req, res) => {
  const { name, email, pin } = req.body;
  const players = loadPlayers();

  let existing = players.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    const initial = name.charAt(0).toUpperCase();
    const fallback = name + initial;
    if (players.find(p => p.name.toLowerCase() === fallback.toLowerCase())) {
      return res.status(409).json({ error: "Name already taken. Try another." });
    }
    return res.status(409).json({ error: "Name already taken. Try '" + fallback + "'." });
  }

  const id = players.length ? Math.max(...players.map(p => p.id)) + 1 : 1;
  const newPlayer = { id, name, email, pin };
  players.push(newPlayer);
  savePlayers(players);

  res.json({ player_id: id, name });
});

module.exports = router;
