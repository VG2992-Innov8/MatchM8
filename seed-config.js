// seed-config.js — force-enable self-registration on boot (demo-safe)
// Runs before index.js (see package.json "start")
// -> Works across Railway redeploys because it rewrites data/config.json every start.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch {
  cfg = {};
}

// New camelCase keys (current codebase)
cfg.allowSelfRegistration = true;
cfg.maxPlayers = 5;
cfg.requireInviteCode = false;

// Old snake_case keys (back-compat with older routes)
cfg.allow_self_registration = true;
cfg.max_players = 5;
cfg.require_invite_code = false;

fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
console.log('[seed-config] Seeded', CONFIG_PATH, cfg);
