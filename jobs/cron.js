require('dotenv').config();
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { enqueueEmail } = require('../lib/mailer');
const { loadFixturesForWeek } = require('../lib/fixtures');

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }
function hasValidPick(v) { if (v == null) return false; const s=String(v).trim(); return /^[HDA]$/.test(s) || /^\d+\s*-\s*\d+$/.test(s); }
function fmt(dt){ const d=new Date(dt); return isNaN(d)? '-' : d.toLocaleString(); }

const ACTIVE_WEEK = Number(process.env.ACTIVE_WEEK || 1);
const SCHEDULE = process.env.CRON_SCHEDULE || '0 9 * * *'; // default: 9:00 daily

async function runReminder() {
  const players = readJson(path.join(__dirname, '..', 'data', 'players.json'), []);
  const fixtures = loadFixturesForWeek(ACTIVE_WEEK) || [];
  if (!players.length || !fixtures.length) return;

  const predsPath = path.join(__dirname, '..', 'data', 'predictions', `week-${ACTIVE_WEEK}.json`);
  const preds = readJson(predsPath, {});

  // ~24h window before first kickoff
  const kicks = fixtures.map(f => new Date(f.kickoff_iso || f.kickoff || 0).getTime()).filter(Boolean).sort((a,b)=>a-b);
  if (!kicks.length) return;
  const hoursToGo = (kicks[0] - Date.now()) / 36e5;
  if (hoursToGo < 23.5 || hoursToGo > 24.5) return;

  for (const pl of players) {
    if (!pl.email) continue;
    const rec = preds[pl.id] || {};
    const have = (fixtures.filter(f => hasValidPick(rec.picks?.[String(f.id)])).length);
    const need = fixtures.length;
    if (have >= need) continue; // already complete

    await enqueueEmail({
      to: pl.email,
      subject: `Reminder: Complete your picks (Week ${ACTIVE_WEEK})`,
      text: `Hi ${pl.name || 'player'},\n\nYou’ve completed ${have}/${need} picks for Week ${ACTIVE_WEEK}.\nFirst kickoff: ${fmt(new Date(kicks[0]).toISOString())}\n\nFinish here: http://localhost:3000/ui/summary.html?week=${ACTIVE_WEEK}`,
      html: `<p>Hi ${pl.name || 'player'},</p>
<p>You’ve completed <strong>${have}/${need}</strong> picks for <strong>Week ${ACTIVE_WEEK}</strong>.</p>
<p>First kickoff: <strong>${fmt(new Date(kicks[0]).toISOString())}</strong></p>
<p><a href="http://localhost:3000/ui/summary.html?week=${ACTIVE_WEEK}">Finish your picks</a></p>`,
      meta: { kind:'reminder', week: ACTIVE_WEEK, player_id: pl.id }
    });
  }

  console.log('[cron] reminder enqueue complete for week', ACTIVE_WEEK);
}

console.log('[cron] Reminder scheduler running with', SCHEDULE);
cron.schedule(SCHEDULE, runReminder);

// run immediately for dev convenience:
runReminder().catch(()=>{});
