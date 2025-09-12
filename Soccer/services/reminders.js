// services/reminders.js
const fs = require("fs/promises");
const path = require("path");
const { DateTime } = require("luxon");
const cron = require("node-cron");
const { sendMail } = require("../lib/mailer");
const { computeLockStatus } = require("../lib/locks");

async function readJSON(p) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return null; }
}
async function writeJSON(p, data) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2));
}

function toArrayPlayers(players) {
  if (!players) return [];
  return Array.isArray(players) ? players : Object.values(players);
}

function needsPredictionForMatch(predsForPlayer, matchId) {
  if (!predsForPlayer?.predictions) return true;
  return !predsForPlayer.predictions.some(p => String(p.id ?? p.match_id ?? p._id) === String(matchId));
}

function playerMissingAnyUnlocked(predsForPlayer, fixtures, locksMap) {
  for (const fx of fixtures) {
    const mid = fx.id ?? fx.match_id ?? fx._id;
    const lock = locksMap[mid];
    if (!lock?.locked && needsPredictionForMatch(predsForPlayer, mid)) return true;
  }
  return false;
}

function buildEmail({ playerName, week, tz, mode, whenText, appBaseUrl }) {
  const subject = `MatchM8: ${whenText} Ã¢â‚¬" Week ${week} predictions due`;
  const url = `${appBaseUrl || ""}/Part_B_Predictions.html?week=${week}`;
  const text = [
    `Hi ${playerName || "there"},`,
    ``,
    `Quick heads-up: your Week ${week} predictions will lock ${whenText}.`,
    mode === "per_match"
      ? `Some matches may lock earlier on a per-match basis.`
      : `The whole week locks at the first kickoff.`,
    ``,
    `Make/finish your picks here: ${url}`,
    ``,
    `Ã¢â‚¬" MatchM8`,
  ].join("\n");

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.45">
    <p>Hi ${playerName || "there"},</p>
    <p><strong>Heads-up:</strong> your <strong>Week ${week}</strong> predictions will lock <strong>${whenText}</strong>.</p>
    <p>${mode === "per_match"
      ? `Some matches lock individually on a per-match basis.`
      : `The whole week locks at the first kickoff.`}</p>
    <p><a href="${url}" style="display:inline-block;padding:10px 14px;text-decoration:none;border:1px solid #111;border-radius:8px">Open Predictions</a></p>
    <p style="color:#666;font-size:12px">Timezone: ${tz}</p>
    <p>Ã¢â‚¬" MatchM8</p>
  </div>`;
  return { subject, text, html };
}

async function chooseWeek(config) {
  // Prefer explicit current_week; fallback to 1
  return Number(config.current_week || 1);
}

function targetWindows(lockAtISO, tz) {
  if (!lockAtISO) return [];
  const lockAt = DateTime.fromISO(lockAtISO).setZone(tz);
  return [
    { code: "T24", at: lockAt.minus({ hours: 24 }) },
    { code: "T2",  at: lockAt.minus({ hours: 2 })  },
  ];
}

function inWindow(now, target) {
  // fire if within Ã‚Â±30s of the scheduled minute (cron runs every minute)
  const diff = Math.abs(now.toMillis() - target.toMillis());
  return diff <= 30_000;
}

async function loadSent() {
  const p = path.join("data", "reminders", "sent.json");
  return (await readJSON(p)) || { entries: [] };
}
async function saveSent(sent) {
  const p = path.join("data", "reminders", "sent.json");
  await writeJSON(p, sent);
}
function hasSent(sent, key) {
  return sent.entries.some(e =>
    e.week === key.week &&
    e.type === key.type &&
    e.scope === key.scope &&
    e.player_id === key.player_id);
}
function pushSent(sent, key) {
  sent.entries.push({ ...key, ts: new Date().toISOString() });
}

async function collectData(week) {
  const config = (await readJSON(path.join("data", "config.json"))) || {};
  const tz = config.timezone || "UTC";
  const fixtures = (await readJSON(path.join("data", "fixtures", "season-2025", `week-${week}.json`))) || [];
  const predictions = (await readJSON(path.join("data", "predictions", `week-${week}.json`))) || {};
  const players = toArrayPlayers(await readJSON(path.join("data", "players.json")));
  const lockStatus = computeLockStatus(fixtures, config);
  return { config, tz, fixtures, predictions, players, lockStatus };
}

function computeTargets({ lockStatus, fixtures, tz }) {
  const targets = [];
  if (lockStatus.mode === "first_kickoff" && lockStatus.weekLockAtISO) {
    for (const t of targetWindows(lockStatus.weekLockAtISO, tz)) {
      targets.push({ type: t.code, scope: "week", at: t.at });
    }
  } else if (lockStatus.mode === "per_match") {
    for (const fx of fixtures) {
      const mid = fx.id ?? fx.match_id ?? fx._id;
      const lock = lockStatus.map[mid];
      if (lock?.lockAtISO) {
        for (const t of targetWindows(lock.lockAtISO, tz)) {
          targets.push({ type: t.code, scope: String(mid), at: t.at });
        }
      }
    }
  }
  return targets;
}

function whenLabel(code) {
  return code === "T24" ? "in 24 hours" : "in 2 hours";
}

async function sendBatch({ week, data, target }) {
  const { config, tz, fixtures, predictions, players, lockStatus } = data;
  const now = DateTime.now().setZone(tz);
  const sent = await loadSent();
  const appBaseUrl = process.env.APP_BASE_URL || "";

  // Filter recipients
  const recipients = [];
  for (const pl of players) {
    const pid = pl.id ?? pl.player_id ?? pl._id;
    if (!pid) continue;
    if (!pl.email) continue;

    const predsForPlayer = predictions[pid];

    const needs =
      target.scope === "week"
        ? playerMissingAnyUnlocked(predsForPlayer, fixtures, lockStatus.map)
        : needsPredictionForMatch(predsForPlayer, target.scope);

    if (!needs) continue;

    const key = { week, type: target.type, scope: target.scope, player_id: String(pid) };
    if (hasSent(sent, key)) continue;

    recipients.push({ player: pl, key });
  }

  // Send 1:1 (privacy) Ã¢â‚¬" small leagues so fine
  let sentCount = 0;
  for (const r of recipients) {
    const { subject, text, html } = buildEmail({
      playerName: r.player.name || r.player.displayName || "there",
      week, tz,
      mode: lockStatus.mode,
      whenText: whenLabel(target.type),
      appBaseUrl
    });
    await sendMail({ to: r.player.email, subject, text, html });
    pushSent(sent, r.key);
    sentCount++;
  }

  if (sentCount) await saveSent(sent);
  return { sentCount, totalCandidates: recipients.length, at: target.at.toISO() };
}

// PUBLIC API

async function preview(week, minutesAhead = 180, forceMode = null) {
  const data = await collectData(week);
  if (forceMode) data.lockStatus.mode = forceMode;
  const tz = data.tz;
  const now = DateTime.now().setZone(tz);
  const horizon = now.plus({ minutes: minutesAhead });
  const allTargets = computeTargets(data);
  const next = allTargets
    .filter(t => t.at >= now && t.at <= horizon)
    .sort((a,b) => a.at - b.at)
    .map(t => ({ when: t.at.toISO(), type: t.type, scope: t.scope }));
  return { week, now: now.toISO(), next };
}

function startScheduler() {
  // Run every minute, on the minute
  cron.schedule("* * * * *", async () => {
    try {
      const config = (await readJSON(path.join("data", "config.json"))) || {};
      const week = await chooseWeek(config);
      const data = await collectData(week);
      const tz = data.tz;
      const now = DateTime.now().setZone(tz);

      const targets = computeTargets(data);
      for (const t of targets) {
        if (inWindow(now, t.at)) {
          await sendBatch({ week, data, target: t });
        }
      }
    } catch (e) {
      console.error("[reminders] tick error", e.message);
    }
  });
}

module.exports = { startScheduler, preview, sendBatch };
