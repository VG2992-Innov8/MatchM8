const express = require('express');
const fs = require('fs');
const path = require('path');
const { ensureDir, loadJson, saveJson } = require('../lib/file-utils');
const { sendReceiptEmail } = require('../lib/mailer');
const router = express.Router();

const DATA_ROOT = path.join(__dirname, '../data');

router.post('/', async (req, res) => {
  const week = req.query.week;
  const { player_id, predictions } = req.body;
  const filePath = path.join(DATA_ROOT, `predictions/week-${week}.json`);

  await ensureDir(path.dirname(filePath));

  let data = {};
  if (fs.existsSync(filePath)) {
    data = JSON.parse(fs.readFileSync(filePath));
  }

  data[player_id] = {
    predictions,
    submitted_at: new Date().toISOString(),
    email_sent_at: data[player_id]?.email_sent_at || null
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  // Send email receipt if predictions are complete and no email sent yet
  if (!data[player_id].email_sent_at) {
    const fixtures = await loadJson(`fixtures/season-2025/week-${week}.json`);
    const fixtureCount = fixtures.length;
    if (predictions.length === fixtureCount) {
      const player = require('../data/players.json').find(p => p.id === player_id);
      if (player && player.email) {
        await sendReceiptEmail(player.email, week, predictions);
        data[player_id].email_sent_at = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      }
    }
  }

  res.sendStatus(200);
});

module.exports = router;
