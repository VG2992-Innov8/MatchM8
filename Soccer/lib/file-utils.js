const fs = require('fs');
const path = require('path');

async function ensureDir(dir) {
  return fs.promises.mkdir(dir, { recursive: true });
}

async function loadJson(relPath) {
  const fullPath = path.join(__dirname, '../data', relPath);
  if (!fs.existsSync(fullPath)) return [];
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
}

async function saveJson(relPath, data) {
  const fullPath = path.join(__dirname, '../data', relPath);
  await ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
}

module.exports = { ensureDir, loadJson, saveJson };
