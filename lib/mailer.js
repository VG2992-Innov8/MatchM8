// lib/mailer.js
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const OUTBOX = path.join(__dirname, '..', 'outbox', 'emails');
const SENT   = path.join(__dirname, '..', 'outbox', 'sent');
const FAILED = path.join(__dirname, '..', 'outbox', 'failed');
for (const p of [OUTBOX, SENT, FAILED]) fs.mkdirSync(p, { recursive: true });

function truthy(v) {
  return ['1','true','yes','y','on'].includes(String(v ?? '').trim().toLowerCase());
}

// Env compatibility:
// - Prefer EMAIL_ENABLED; else infer from MAIL_DRY_RUN (enabled = !MAIL_DRY_RUN); default DRY for safety.
const EMAIL_ENABLED =
  process.env.EMAIL_ENABLED !== undefined
    ? truthy(process.env.EMAIL_ENABLED)
    : (process.env.MAIL_DRY_RUN !== undefined ? !truthy(process.env.MAIL_DRY_RUN) : false);

const FROM = process.env.EMAIL_FROM || process.env.MAIL_FROM || 'MatchM8 <no-reply@matchm8.local>';

let transporter = null;
function getTransporter() {
  if (!EMAIL_ENABLED) return null;
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

// Keep your queue helper as-is
async function enqueueEmail(payload) {
  const fp = path.join(OUTBOX, fileId());
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, queued: path.basename(fp) };
}

// Keep your immediate send; write to SENT on dry-run
async function sendEmailNow(msg) {
  const mailOptions = {
    from: FROM,
    to: msg.to,
    bcc: msg.bcc,                // NEW: bcc supported
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  };

  if (!EMAIL_ENABLED) {
    const dest = path.join(SENT, fileId());
    fs.writeFileSync(dest, JSON.stringify({ ...mailOptions, simulated: true }, null, 2), 'utf8');
    return { ok: true, dryRun: true };
  }

  try {
    const t = getTransporter();
    const info = await t.sendMail(mailOptions);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const fp = path.join(FAILED, fileId());
    fs.writeFileSync(fp, JSON.stringify({ error: err.message, mailOptions }, null, 2), 'utf8');
    throw err;
  }
}

// NEW: small helper so other modules (e.g., reminders) can just call sendMail(...)
async function sendMail({ to, subject, html, text, bcc }) {
  return sendEmailNow({ to, subject, html, text, bcc });
}

module.exports = {
  // Your original exports
  paths: { OUTBOX, SENT, FAILED },
  enqueueEmail,
  sendEmailNow,
  // New exports
  sendMail,
  enabled: EMAIL_ENABLED,
};
