// overlay/matchm8_overlay.js
// MatchM8 overlay: PIN auth, secure predictions upsert, CSV exports, unified /audit
// Usage in your server.js:
//   import matchm8Overlay from './overlay/matchm8_overlay.js';
//   app.use(express.json()); app.use(cookieParser());
//   matchm8Overlay(app);

import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { Parser as Json2CsvParser } from 'json2csv';

export default function matchm8Overlay(app) {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    PRED_TOKEN_SECRET = 'change-me',
    ADMIN_TOKEN = ''
  } = process.env;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'] || '';
    if (!token || token !== ADMIN_TOKEN) return res.status(401).send('Admin token required');
    next();
  }

  async function writeAudit({ actor_type, actor_id, action, meta = {} }) {
    try {
      await supabase.from('audit_log').insert([{ actor_type, actor_id, action, meta }]);
    } catch (e) {
      console.error('audit_log insert failed:', e.message);
    }
  }

  function requirePredToken(req, res, next) {
    const token = req.cookies?.pred_edit_token;
    if (!token) return res.status(401).send('Missing predictions token');
    try {
      const payload = jwt.verify(token, PRED_TOKEN_SECRET);
      req.predToken = payload; // { player_id, iat, exp }
      next();
    } catch {
      return res.status(401).send('Invalid or expired token');
    }
  }

  // ----- PIN: set & verify -----
  app.post('/auth/pin/set', async (req, res) => {
    const { player_id, pin } = req.body || {};
    if (!player_id || !pin) return res.status(400).send('player_id and pin required');
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash(pin, 10);
    const { error } = await supabase.from('players').update({ pin_hash: hash }).eq('id', player_id);
    if (error) return res.status(400).send(error.message);
    await writeAudit({ actor_type: 'player', actor_id: player_id, action: 'pin_set' });
    res.sendStatus(200);
  });

  app.post('/auth/pin/verify', async (req, res) => {
    const { player_id, pin } = req.body || {};
    if (!player_id || !pin) return res.status(400).send('player_id and pin required');
    const { data: player, error } = await supabase
      .from('players')
      .select('id, pin_hash')
      .eq('id', player_id)
      .single();
    if (error || !player?.pin_hash) return res.status(401).send('PIN not set');
    const bcrypt = await import('bcryptjs');
    const ok = await bcrypt.compare(pin, player.pin_hash);
    if (!ok) return res.status(401).send('Invalid PIN');
    const token = jwt.sign({ player_id }, PRED_TOKEN_SECRET, { expiresIn: '14d' });
    res.cookie('pred_edit_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 14 * 24 * 3600 * 1000
    });
    await writeAudit({ actor_type: 'player', actor_id: player_id, action: 'pin_verified' });
    res.sendStatus(200);
  });

  // ----- Secure predictions upsert -----
  app.put('/predictions/upsert', requirePredToken, async (req, res) => {
    const { player_id, week, predictions } = req.body || {};
    if (!player_id || !week || !Array.isArray(predictions)) {
      return res.status(400).send('player_id, week, predictions[] required');
    }
    if (req.predToken.player_id !== player_id) {
      return res.status(403).send('Cannot edit another player\'s predictions');
    }
    const nowIso = new Date().toISOString();
    const { data: fixtures, error: fxErr } = await supabase
      .from('fixtures')
      .select('id, week, kickoff_at')
      .eq('week', week);
    if (fxErr) return res.status(400).send(fxErr.message);
    const fixtureMap = new Map((fixtures || []).map(f => [f.id, f]));
    const rows = [];
    for (const p of predictions) {
      const f = fixtureMap.get(p.match_id);
      if (!f) continue;
      if (new Date(nowIso) >= new Date(f.kickoff_at)) continue; // lock after kickoff
      rows.push({
        player_id,
        match_id: p.match_id,
        home_score: Number.isFinite(+p.home_score) ? +p.home_score : null,
        away_score: Number.isFinite(+p.away_score) ? +p.away_score : null,
        updated_at: nowIso
      });
    }
    if (rows.length === 0) return res.status(400).send('No editable predictions in payload');
    const { error: upErr } = await supabase.from('predictions').upsert(rows, {
      onConflict: 'player_id,match_id',
      ignoreDuplicates: false
    });
    if (upErr) return res.status(400).send(upErr.message);
    await writeAudit({ actor_type: 'player', actor_id: player_id, action: 'predictions_upsert', meta: { week, count: rows.length } });
    res.sendStatus(200);
  });

  // ----- CSV Exports -----
  app.get('/predictions/export.csv', requireAdmin, async (req, res) => {
    const week = Number(req.query.week);
    const leagueId = req.query.league_id || null;
    if (!Number.isFinite(week)) return res.status(400).send('week required');

    const { data: preds, error: pErr } = await supabase
      .from('predictions')
      .select('player_id, match_id, home_score, away_score, updated_at');
    if (pErr) return res.status(400).send(pErr.message);

    const { data: fixtures, error: fErr } = await supabase
      .from('fixtures')
      .select('id, week, league_id, home_team, away_team, kickoff_at')
      .eq('week', week);
    if (fErr) return res.status(400).send(fErr.message);

    const { data: players, error: plErr } = await supabase
      .from('players')
      .select('id, name, email, team');
    if (plErr) return res.status(400).send(plErr.message);

    const fxMap = new Map((fixtures || []).map(f => [f.id, f]));
    const plMap = new Map((players || []).map(p => [p.id, p]));

    const rows = (preds || [])
      .filter(r => fxMap.has(r.match_id))
      .filter(r => !leagueId || fxMap.get(r.match_id).league_id === leagueId)
      .map(r => {
        const fx = fxMap.get(r.match_id);
        const pl = plMap.get(r.player_id);
        return {
          week: fx.week,
          league_id: fx.league_id || '',
          player_id: r.player_id,
          player_name: pl?.name || '',
          player_email: pl?.email || '',
          player_team: pl?.team || '',
          match_id: r.match_id,
          home_team: fx.home_team,
          away_team: fx.away_team,
          kickoff_at: fx.kickoff_at,
          pred_home: r.home_score,
          pred_away: r.away_score,
          updated_at: r.updated_at
        };
      });

    const parser = new Json2CsvParser({ fields: Object.keys(rows[0] || { week: '', player_id: '' }) });
    const csv = parser.parse(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="predictions_week_${week}.csv"`);
    res.send(csv);
    await writeAudit({ actor_type: 'admin', actor_id: null, action: 'export_predictions_csv', meta: { week, count: rows.length } });
  });

  app.get('/leaderboard/export.csv', requireAdmin, async (req, res) => {
    const weekTo = Number(req.query.week_to);
    const leagueId = req.query.league_id || null;
    if (!Number.isFinite(weekTo)) return res.status(400).send('week_to required');

    const { data: fixtures, error: fErr } = await supabase
      .from('fixtures')
      .select('id, week, league_id, home_score, away_score')
      .lte('week', weekTo);
    if (fErr) return res.status(400).send(fErr.message);
    const fxMap = new Map((fixtures || []).map(f => [f.id, f]));

    const { data: preds, error: pErr } = await supabase
      .from('predictions')
      .select('player_id, match_id, home_score, away_score');
    if (pErr) return res.status(400).send(pErr.message);

    function pointsFor(pred, actual) {
      if (actual.home_score == null || actual.away_score == null) return 0;
      const exact = pred.home_score === actual.home_score && pred.away_score === actual.away_score;
      if (exact) return 5;
      const predDiff = (pred.home_score ?? 0) - (pred.away_score ?? 0);
      const actDiff  = (actual.home_score ?? 0) - (actual.away_score ?? 0);
      const predRes = predDiff === 0 ? 0 : predDiff > 0 ? 1 : -1;
      const actRes  = actDiff === 0 ? 0 : actDiff > 0 ? 1 : -1;
      return predRes === actRes ? 2 : 0;
    }

    const totals = new Map();
    for (const r of (preds || [])) {
      const fx = fxMap.get(r.match_id);
      if (!fx) continue;
      if (leagueId && fx.league_id !== leagueId) continue;
      const pts = pointsFor(r, fx);
      totals.set(r.player_id, (totals.get(r.player_id) || 0) + pts);
    }

    const { data: players, error: plErr } = await supabase.from('players').select('id, name, email, team');
    if (plErr) return res.status(400).send(plErr.message);
    const plMap = new Map((players || []).map(p => [p.id, p]));

    const rows = Array.from(totals.entries()).map(([player_id, total_points]) => ({
      player_id,
      player_name: plMap.get(player_id)?.name || '',
      player_email: plMap.get(player_id)?.email || '',
      player_team: plMap.get(player_id)?.team || '',
      week_to: weekTo,
      total_points
    })).sort((a,b) => b.total_points - a.total_points);

    const parser = new Json2CsvParser({ fields: Object.keys(rows[0] || { player_id: '', total_points: 0 }) });
    const csv = parser.parse(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leaderboard_to_week_${weekTo}.csv"`);
    res.send(csv);
    await writeAudit({ actor_type: 'admin', actor_id: null, action: 'export_leaderboard_csv', meta: { week_to: weekTo, count: rows.length } });
  });

  // ----- Unified /audit for admin visibility (Option 2 keeps only this) -----
  app.get('/audit', requireAdmin, async (req, res) => {
    res.json({ ok: true });
  });
}
