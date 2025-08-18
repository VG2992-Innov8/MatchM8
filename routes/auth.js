const express = require('express');
const router = express.Router();
const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');

// Helper: Load all players
async function loadPlayers() {
  try {
    const data = await fs.readFile(PLAYERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load players:', err);
    return [];
  }
}

// Helper: Save all players
async function savePlayers(players) {
  try {
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(players, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save players:', err);
  }
}

// --- Register new player ---
router.post('/player/register', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Missing name or email' });
  }

  const players = await loadPlayers();
  const exists = players.find(p => p.name === name || p.email === email);
  if (exists) {
    return res.status(409).json({ error: 'Player already exists' });
  }

  const newPlayer = {
    id: Date.now().toString(),
    name,
    email,
    pin: null
  };

  players.push(newPlayer);
  await savePlayers(players);
  res.json({ ok: true, player: newPlayer });
});

// --- Update player info ---
router.post('/player/update', async (req, res) => {
  const { id, name, email } = req.body;
  const players = await loadPlayers();
  const player = players.find(p => p.id === id);

  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  player.name = name ?? player.name;
  player.email = email ?? player.email;

  await savePlayers(players);
  res.json({ ok: true, player });
});

// --- Delete player ---
router.post('/player/delete', async (req, res) => {
  const { id } = req.body;
  let players = await loadPlayers();
  const initialLength = players.length;
  players = players.filter(p => p.id !== id);

  if (players.length === initialLength) {
    return res.status(404).json({ error: 'Player not found' });
  }

  await savePlayers(players);
  res.json({ ok: true });
});

// --- Set PIN for player ---
router.post('/pin/set', async (req, res) => {
  const { name, pin } = req.body;
  const players = await loadPlayers();
  const player = players.find(p => p.name === name);

  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  player.pin = pin;
  await savePlayers(players);
  res.json({ ok: true });
});

// --- Verify PIN login (name or email) ---
router.post('/pin/verify', async (req, res) => {
  const { nameOrEmail, pin } = req.body;

  if (!nameOrEmail || !pin) {
    return res.status(400).json({ error: 'Missing nameOrEmail or pin' });
  }

  try {
    const players = await loadPlayers();
    const input = nameOrEmail.toLowerCase();

    const matchedPlayer = players.find(p => {
      const nameMatch = p.name?.toLowerCase() === input;
      const emailMatch = p.email?.toLowerCase() === input;
      return (nameMatch || emailMatch) && p.pin === pin;
    });

    if (matchedPlayer) {
      res.json({ ok: true, player_id: matchedPlayer.id, name: matchedPlayer.name });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify PIN' });
  }
});

module.exports = router;
