// seed-config.js — durable demo defaults on every boot
// Runs before index.js (see package.json "start")

const fs = require('fs');
const path = require('path');

const DATA_DIR    = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

// ---- Edit these defaults if you want ----
const INVITE_CODE_DEFAULT        = process.env.INVITE_CODE || 'MATCHM8'; // <— set your code
const MAX_PLAYERS_DEFAULT        = Number(process.env.DEMO_PLAYERS_MAX || process.env.MAX_PLAYERS || 5);
const ALLOW_SELF_DEFAULT         = true;
const REQUIRE_INVITE_DEFAULT     = true;
const WHITELIST_DOMAIN_DEFAULT   = (process.env.WHITELIST_EMAIL_DOMAIN || '') // e.g. "yourcompany.com"
  .trim().toLowerCase(); // blank = whitelist OFF

fs.mkdirSync(DATA_DIR, { recursive: true });

let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch {
  cfg = {};
}

// ---- CamelCase (current)
cfg.allowSelfRegistration = ALLOW_SELF_DEFAULT;
cfg.maxPlayers            = MAX_PLAYERS_DEFAULT;
cfg.requireInviteCode     = REQUIRE_INVITE_DEFAULT;
cfg.inviteCode            = INVITE_CODE_DEFAULT;
cfg.whitelistEmailDomain  = WHITELIST_DOMAIN_DEFAULT; // "" disables whitelist

// ---- snake_case (back-compat)
cfg.allow_self_registration = ALLOW_SELF_DEFAULT;
cfg.max_players             = MAX_PLAYERS_DEFAULT;
cfg.require_invite_code     = REQUIRE_INVITE_DEFAULT;
cfg.invite_code             = INVITE_CODE_DEFAULT;
cfg.whitelist_email_domain  = WHITELIST_DOMAIN_DEFAULT; // "" disables whitelist

fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
console.log('[seed-config] Seeded', CONFIG_PATH, cfg);
