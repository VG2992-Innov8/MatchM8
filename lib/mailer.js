const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const OUTBOX = path.join(__dirname, '..', 'outbox', 'emails');
const SENT   = path.join(__dirname, '..', 'outbox', 'sent');
const FAILED = path.join(__dirname, '..', 'outbox', 'failed');

for (const p of [OUTBOX, SENT, FAILED]) fs.mkdirSync(p, { recursive: true });

const MAIL_DRY_RUN = String(process.env.MAIL_DRY_RUN || 'true').toLowerCase() === 'true';

let transporter = null;
function getTransporter() {
  if (MAIL_DRY_RUN) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

function fileId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
}

async function enqueueEmail(payload) {
  const filePath = path.join(OUTBOX, fileId());
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, queued: path.basename(filePath) };
}

async function sendEmailNow(msg) {
  const from = process.env.MAIL_FROM || 'MatchM8 <no-reply@matchm8.local>';
  const mailOptions = { from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text };

  if (MAIL_DRY_RUN) {
    // Simulate: move to sent
    const dest = path.join(SENT, fileId());
    fs.writeFileSync(dest, JSON.stringify({ ...msg, simulated: true }, null, 2), 'utf8');
    return { ok: true, dryRun: true };
  }

  const t = getTransporter();
  const info = await t.sendMail(mailOptions);
  return { ok: true, messageId: info.messageId };
}

module.exports = {
  paths: { OUTBOX, SENT, FAILED },
  enqueueEmail,
  sendEmailNow,
};
