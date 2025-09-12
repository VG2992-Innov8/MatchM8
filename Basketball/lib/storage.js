// lib/storage.js
const fs = require('fs');
const path = require('path');

function abs(req, rel) {
  return path.join(req.ctx.dataDir, rel);
}

function readJSON(req, rel, fallback = null) {
  const p = abs(req, rel);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJSON(req, rel, obj) {
  const p = abs(req, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}

module.exports = { abs, readJSON, writeJSON };
