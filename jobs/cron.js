require('dotenv').config();
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { enqueueEmail } = require('../lib/mailer');

function loadJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}

function formatLocal(dtIso) {
  try {
    const d = new Date(dtIso);
    return d.toLocaleString();
  } catch { return dtIso; }
}

// Example: weekly reminder for week=1 (adjust to your active week detection)
const ACTIVE_WEEK = Number(process.env.ACTIVE_WEEK || 1);

cron.schedule('*/5 * * * *', async () => {
  // Runs every 5 minutes (for demo). Change to "0 9 * * *" for daily 9am.
  const playersPath = path.join(__dirname, '..', 'data', 'players.json');
  const fixturesPath = path.join(__dirname, '..', 'data', 'fixtures', 'season-2025', `week-${ACTIVE_WEEK}.json`);
  const predsPath = path.join(__dirname, '..', 'data', 'predictions', `week-${ACTIVE_WEEK}.json`);

  const players = loadJson(playersPath, []);
  const fixtures = loadJson(fixturesPath, []);
  const preds = loadJson(predsPath, {});

  if (!players.length || !fixtures.length) return;

  const kickoffs = fixtures.map(f => new Date(f.kickoff_iso).getTime()).filter(Boolean).sort((a,b)=>a-b);
  if (!kickoffs.length) return;

  const firstKickoff = kickoffs[0];
  const now = Date.now();
  const hoursToGo = (firstKickoff - now) / 36e5;

  if (hoursToGo < 23.5 || hoursToGo > 24.5) return; // ~24h window

  for (const pl of players) {
    const rec = preds[pl.id];
    if (rec && rec.picks && Object.keys(rec.picks).length) continue; // already has picks

    if (!pl.email) continue;

    await enqueueEmail({
      to: pl.email,
      subject: `Reminder: Make your MatchM8 picks (Week ${ACTIVE_WEEK})`,
      text: `Hi ${pl.name || 'player'},\n\nYou haven't made your picks for Week ${ACTIVE_WEEK}.\nFirst kickoff: ${formatLocal(new Date(firstKickoff).toISOString())}\n\nGood luck!`,
      html: `<p>Hi ${pl.name || 'player'},</p>
<p>You haven't made your picks for <strong>Week ${ACTIVE_WEEK}</strong>.</p>
<p>First kickoff: <strong>${formatLocal(new Date(firstKickoff).toISOString())}</strong></p>
<p>Good luck!</p>`,
      meta: { kind: 'reminder', week: ACTIVE_WEEK, player_id: pl.id }
    });
  }

  console.log('[cron] reminder enqueue complete for week', ACTIVE_WEEK);
});

console.log('[cron] Reminder scheduler running. CTRL+C to stop.');
