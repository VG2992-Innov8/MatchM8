// Factory reset: wipe data to "customer fresh" state
// Usage:
//   node scripts/factory-reset.js
//   node scripts/factory-reset.js --keep-players
//   node scripts/factory-reset.js --force

const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const dirs = {
  fixtures: path.join(DATA, 'fixtures', 'season-2025'),
  results: path.join(DATA, 'results'),
  predictions: path.join(DATA, 'predictions'),
  scoresWeeks: path.join(DATA, 'scores', 'weeks'),
};

const files = {
  seasonTotals: path.join(DATA, 'scores', 'season-totals.json'),
  players: path.join(DATA, 'players.json'),
};

function arg(flag) { return process.argv.includes(flag); }

async function rimraf(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  const keep = path.join(dir, '.gitkeep');
  try { await fs.writeFile(keep, ''); } catch {}
}

async function writeJson(file, value) {
  await ensureDir(path.dirname(file));
  const data = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  await fs.writeFile(file, data);
}

async function confirmPrompt() {
  if (arg('--force')) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));
  const ans = (await ask('Type RESET to factory-wipe data: ')).trim();
  rl.close();
  return ans === 'RESET';
}

async function main() {
  // Safety: refuse in production unless explicitly forced
  if (process.env.NODE_ENV === 'production' && !arg('--force')) {
    console.error('Refusing to run in production without --force');
    process.exit(2);
  }

  const ok = await confirmPrompt();
  if (!ok) { console.log('Aborted.'); process.exit(1); }

  // Wipe directories
  for (const d of Object.values(dirs)) await rimraf(d);

  // Recreate skeleton
  await ensureDir(dirs.fixtures);
  await ensureDir(dirs.results);
  await ensureDir(dirs.predictions);
  await ensureDir(dirs.scoresWeeks);
  await ensureDir(path.dirname(files.seasonTotals));

  // Fresh files
  await writeJson(files.seasonTotals, '[]');             // empty totals; UI should handle []
  if (arg('--keep-players') && fssync.existsSync(files.players)) {
    console.log('Keeping players.json');
  } else {
    await writeJson(files.players, '[]');                // no users
  }
// ...after writing players.json (or keeping it)
const keptPlayers = arg('--keep-players') && fssync.existsSync(files.players);

console.log('✅ Factory reset complete.');
console.log(`   Wiped: fixtures, results, predictions, weekly scores, season totals${keptPlayers ? '' : ', players'}`);
console.log(`   Kept: code, UI, config (.env), mail settings${keptPlayers ? ', players' : ''}`);

}

main().catch(e => { console.error(e); process.exit(1); });
