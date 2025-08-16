const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const { loadFixturesForWeek } = require('../lib/fixtures');
const { isLocked } = require('../lib/time');
const { enqueueEmail } = require('../lib/mailer');

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}
function saveJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function getPlayerIdFromCookie(req) {
  // You mentioned cookie is set by PIN flow; adapt as needed
  return req.cookies?.mm8_pid || req.headers['x-player-id']; // fallback for testing
}

function fmt(dtIso) {
  try { return new Date(dtIso).toLocaleString(); } catch { return dtIso; }
}

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

  const incoming = req.body?.picks || {}; // { [fixture_id]: "H/A/D" or "score" }
  const accepted = {};
  const rejected = {};

  Object.entries(incoming).forEach(([fid, pick]) => {
    const fx = byId[String(fid)];
    if (!fx) { rejected[fid] = 'unknown_fixture'; return; }
    if (isLocked(fx.kickoff_iso)) { rejected[fid] = 'locked'; return; }
    accepted[fid] = pick;
  });

  const predsPath = path.join(__dirname, '..', 'data', 'predictions', `week-${week}.json`);
  const existing = loadJson(predsPath, {});
  const prev = existing[pid] || { picks: {} };

  existing[pid] = {
    ...prev,
    picks: { ...prev.picks, ...accepted },
    submitted_at: new Date().toISOString(),
  };

  saveJson(predsPath, existing);

  // Build and enqueue email receipt if at least one accepted
  let emailEnqueued = false;
  try {
    if (Object.keys(accepted).length) {
      // Load players list to find email
      const players = loadJson(path.join(__dirname, '..', 'data', 'players.json'), []);
      const me = players.find(p => String(p.id) === String(pid));

      if (me?.email) {
        const rows = Object.keys(accepted).map(fid => {
          const fx = byId[fid];
          return `<tr>
            <td style="padding:4px 8px;border:1px solid #ddd;">${fx?.home || '?'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${fx?.away || '?'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${accepted[fid]}</td>
            <td style="padding:4px 8px;border:1px solid #ddd;">${fmt(fx?.kickoff_iso)}</td>
          </tr>`;
        }).join('');

        const html = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Arial;">
            <h2>Your MatchM8 picks — Week ${week}</h2>
            <p>Hi ${me.name || 'player'}, here’s your submission receipt. You can edit picks until each match locks.</p>
            <table style="border-collapse:collapse;border:1px solid #ddd;">
              <thead>
                <tr>
                  <th style="padding:6px 8px;border:1px solid #ddd;">Home</th>
                  <th style="padding:6px 8px;border:1px solid #ddd;">Away</th>
                  <th style="padding:6px 8px;border:1px solid #ddd;">Your Pick</th>
                  <th style="padding:6px 8px;border:1px solid #ddd;">Kickoff (local)</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="color:#666">Submitted: ${fmt(existing[pid].submitted_at)}</p>
          </div>
        `;

        const text = `Your MatchM8 picks — Week ${week}
${Object.keys(accepted).map(fid => {
  const fx = byId[fid];
  return `${fx?.home || '?'} vs ${fx?.away || '?'} | Pick: ${accepted[fid]} | Kickoff: ${fmt(fx?.kickoff_iso)}`;
}).join('\n')}
Submitted: ${fmt(existing[pid].submitted_at)}`;

        await enqueueEmail({
          to: me.email,
          subject: `Your MatchM8 picks for Week ${week}`,
          html, text,
          meta: { kind: 'receipt', week, player_id: pid }
        });

        // Stamp email_sent_at
        const updated = loadJson(predsPath, {});
        updated[pid] = { ...updated[pid], email_sent_at: new Date().toISOString() };
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
