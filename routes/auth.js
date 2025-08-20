const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const passwordsFile = path.join(__dirname, '..', 'data', 'passwords.json');

// Helper: read JSON
function readPasswords() {
  try {
    const raw = fs.readFileSync(passwordsFile);
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

// Helper: write JSON
function writePasswords(data) {
  fs.writeFileSync(passwordsFile, JSON.stringify(data, null, 2));
}

// Set password (only if not already set)
router.post('/auth/set', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: 'Missing name or password' });
  }

  const passwords = readPasswords();
  if (passwords[name]) {
    return res.status(409).json({ error: 'Password already set' });
  }

  passwords[name] = password;
  writePasswords(passwords);
  res.json({ success: true });
});

// Verify password (login)
router.post('/auth/verify', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: 'Missing name or password' });
  }

  const passwords = readPasswords();
  if (passwords[name] === password) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Change password (must match current first)
router.post('/auth/change', (req, res) => {
  const { name, oldPassword, newPassword } = req.body;
  if (!name || !oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const passwords = readPasswords();
  if (passwords[name] !== oldPassword) {
    return res.status(401).json({ error: 'Old password incorrect' });
  }

  passwords[name] = newPassword;
  writePasswords(passwords);
  res.json({ success: true });
});

module.exports = router;
