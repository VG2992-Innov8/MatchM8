const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { ensureDir } = require('../lib/file-utils');

const DATA_ROOT = path.join(__dirname, '../data');
const SEASON = process.env.SEASON || '2025';

function getResult(h, a) {
  if (h > a) return 'H';
  if (h < a) return 'A';
  return 'D';
}

function computePoints(pred, actual) {
  if (pred.home_goals === actual.home_goals && pred.away_goals === actual.away_goals) {
    return 5;
  }
  const predictedResult = getResult(pred.home_goals, pred.away_goals);
  const actualResult = getResult(actual.home_goals, actual.away_goals);
  return predictedResult === actualResult ? 2 : 0;
}

router.post('/', async (req, res) => {
  const week = req.query.week;
  if (!week) return res.status(400).send("Missing ?week param");

  const predictionsPath = path.join(DATA_ROOT, `predictions/week-${week}.json`);
  const resultsPath = path.join(DATA_ROOT, `results/week-${week}.json`);
  const scoresPath = path.join(DATA_ROOT, `season_scores.csv`);
  const totalsPath = path.join(DATA_ROOT, `season_totals.json`);

  if (!fs.existsSync(predictionsPath) || !fs.existsSync(resultsPath)) {
    return res.status(400).send("Missing predictions or results file");
  }

  const predictions = JSON.parse(fs.readFileSync(predictionsPath));
  const results = JSON.parse(fs.readFileSync(resultsPath));
  const resultMap = {};
  results.forEach(f => resultMap[f.fixture_id] = f);

  const scores = [];
  const totals = fs.existsSync(totalsPath) ? JSON.parse(fs.readFileSync(totalsPath)) : {};

  for (const [playerId, data] of Object.entries(predictions)) {
    let total = 0;
    const picks = data.predictions;
    picks.forEach(p => {
      if (resultMap[p.fixture_id]) {
        const actual = resultMap[p.fixture_id];
        total += computePoints(p, actual);
      }
    });
    scores.push({ playerId, score: total });
    if (!totals[playerId]) totals[playerId] = 0;
    totals[playerId] += total;
  }

  const csv = ["player_id,week,score"]
    .concat(scores.map(s => `${s.playerId},${week},${s.score}`))
    .join("\n");

  await ensureDir(path.dirname(scoresPath));
  fs.writeFileSync(scoresPath, csv);
  fs.writeFileSync(totalsPath, JSON.stringify(totals, null, 2));

  res.json({ scores });
});

module.exports = router;
