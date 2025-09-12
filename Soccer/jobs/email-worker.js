require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { paths, sendEmailNow } = require('../lib/mailer');

async function processOne(file) {
  const src = path.join(paths.OUTBOX, file);
  const raw = fs.readFileSync(src, 'utf8');
  const msg = JSON.parse(raw);

  try {
    const res = await sendEmailNow(msg);
    const dest = path.join(paths.SENT, file);
    fs.renameSync(src, dest);
    console.log('[worker] sent:', file, res);
  } catch (err) {
    console.error('[worker] failed:', file, err.message);
    const dest = path.join(paths.FAILED, file);
    fs.renameSync(src, dest);
  }
}

async function tick() {
  const files = fs.readdirSync(paths.OUTBOX).filter(f => f.endsWith('.json'));
  if (!files.length) return;
  for (const f of files) await processOne(f);
}

console.log('[worker] Email worker running. CTRL+C to stop.');
setInterval(tick, 5000);
tick();
