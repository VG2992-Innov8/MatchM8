const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const { loadFixturesForWeek } = require('../lib/fixtures');
const { isLocked } = require('../lib/time');
const { enqueueEmail } = require('../lib/mailer');

// ---------- helpers ----------
function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}
function saveJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}
function getPlayerIdFromCookie(req) {
  return req.cookies?.mm8_pid || req.headers['x-player-id'];
}
function fmt(dt) {
  const d = new Date(dt);
  return isNaN(d) ? '-' : d.toLocaleString();
}
function hasValidPick(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim();
  if (!s) return false;
  return /^[HDA]$/.test(s) || /^\d+\s*-\s*\d+$/.test(s);
}

// ---------- routes ----------
router.get('/me', (req, res) => {
  const week = Number(req.query.week);
  const pid = getPlayerIdFromCookie(req);
  if (!week || !pid) return res.status(400).json({ ok:false, error:'week and auth required' });

  const predsPath = path.join(__dirname, '..', 'data', 'predictions', `week-${week}.json`);
  const data = loadJson(predsPath, {});
  res.json({ ok:true, record: data[pid] || null });
});

router.post('/', async (req, res) => {
  const week = Number(req.query.week);
  const pid = getPlayerIdFromCookie(req);
  if (!week || !pid) return res.status(400).json({ ok:false, error:'week and auth required' });

  const fixtures = loadFixturesForWeek(week) || [];
  const byId = Object.fromEntries(fixtures.map(f => [String(f.id), f]));

  const incoming = req.body?.picks || {};
  const accepted = {};
  const rejected = {};

  for (const [fidRaw, pick] of Object.entries(incoming)) {
    const fid = String(fidRaw);
    const fx = byId[fid];
    if (!fx) { rejected[fid] = 'unknown_fixture'; continue; }
    if (isLocked(fx.kickoff_iso || fx.kickoff)) { rejected[fid] = 'locked'; continue; }
    accepted[fid] = pick;
  }

  const predsPath = path.join(__dirname, '..', 'data', 'predictions', `week-${week}.json`);
  const existing = loadJson(predsPath, {});
  const prev = existing[pid] || { picks: {} };

  existing[pid] = {
    ...prev,
    picks: { ...prev.picks, ...accepted },
    submitted_at: new Date().toISOString(),
  };
  saveJson(predsPath, existing);

  // ------ email only when COMPLETE, and only once ------
  let emailEnqueued = false;
  try {
    const updated = loadJson(predsPath, {});
    const rec = updated[pid];

    const allFixtureIds = fixtures.map(f => String(f.id));
    const remaining = allFixtureIds.filter(fid => !hasValidPick(rec?.picks?.[fid]));
    const isComplete = allFixtureIds.length > 0 && remaining.length === 0;

    if (isComplete && !rec.email_sent_at) {
      // find player email
      const players = loadJson(path.join(__dirname, '..', 'data', 'players.json'), []);
      const me = players.find(p => String(p.id) === String(pid));
      if (me?.email) {
        // order rows by kickoff time if available
        const ordered = fixtures.slice().sort((a,b) => {
          const ta = new Date(a.kickoff_iso || a.kickoff || 0).getTime();
          const tb = new Date(b.kickoff_iso || b.kickoff || 0).getTime();
          return ta - tb;
        });

        const rows = ordered.map(fx => {
          const pick = rec.picks[String(fx.id)];
          return `<tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${fx.home}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${fx.away}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${pick}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${fmt(fx.kickoff_iso || fx.kickoff)}</td>
          </tr>`;
        }).join('');

        const html = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Arial;">
            <h2>Your MatchM8 picks — Week ${week} (Complete)</h2>
            <p>Hi ${me.name || 'player'}, here’s your receipt. You can edit picks until each match locks.</p>
            <table style="border-collapse:collapse;border:1px solid #ddd;">
              <thead><tr>
                <th style="padding:6px 8px;border:1px solid #ddd;">Home</th>
                <th style="padding:6px 8px;border:1px solid #ddd;">Away</th>
                <th style="padding:6px 8px;border:1px solid #ddd;">Your Pick</th>
                <th style="padding:6px 8px;border:1px solid #ddd;">Kickoff (local)</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="color:#666">Submitted: ${fmt(rec.submitted_at)}</p>
          </div>
        `;
        const text = `Your MatchM8 picks — Week ${week} (Complete)
${ordered.map(fx => `${fx.home} vs ${fx.away} | Pick: ${rec.picks[String(fx.id)]} | Kickoff: ${fmt(fx.kickoff_iso || fx.kickoff)}`).join('\n')}
Submitted: ${fmt(rec.submitted_at)}`;

        await enqueueEmail({
          to: me.email,
          subject: `Your MatchM8 picks for Week ${week} (Complete)`,
          html, text,
          meta: { kind: 'receipt', week, player_id: pid }
        });

        updated[pid] = { ...rec, email_sent_at: new Date().toISOString() };
        saveJson(predsPath, updated);
        emailEnqueued = true;
      }
    }
  } catch (e) {
    console.error('enqueue email failed:', e.message);
  }

  res.json({ ok: true, accepted, rejected, email_enqueued: emailEnqueued });
});

module.exports = router;
