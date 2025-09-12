// lib/locks.js
// Compute lock status for a week given fixtures + config
// Accepts flexible kickoff fields: kickoff_iso | kickoff | datetime | ko | ts
// Returns { mode, weekLocked, weekLockAtISO, firstKickoffAtISO, lockedIds:Set, map: { [id]: { locked, kickoffISO, lockAtISO } } }

const { DateTime } = require("luxon");

function pickKickoffISO(fx) {
  // Try common fields; if numeric, treat as epoch ms
  if (typeof fx.kickoff_iso === "string") return fx.kickoff_iso;
  if (typeof fx.kickoff === "string") return fx.kickoff;
  if (typeof fx.datetime === "string") return fx.datetime;
  if (typeof fx.ko === "string") return fx.ko;
  if (typeof fx.ts === "number") return DateTime.fromMillis(fx.ts).toUTC().toISO();
  return null;
}

function computeLockStatus(fixtures = [], config = {}) {
  const mode = (config.deadline_mode || "first_kickoff").toLowerCase();
  const lockMins = Number(config.lock_mins ?? 0);
  const tz = config.timezone || "UTC";

  const now = DateTime.now().setZone(tz);

  const items = fixtures.map(fx => {
    const id = fx.id ?? fx.match_id ?? fx._id ?? String(fx.home + "-" + fx.away);
    const kickoffISO = pickKickoffISO(fx);
    if (!kickoffISO) {
      return { id, kickoffISO: null, lockAt: null, locked: false };
    }
    const kickoff = DateTime.fromISO(kickoffISO, { zone: tz }).isValid
      ? DateTime.fromISO(kickoffISO, { zone: tz })
      : DateTime.fromISO(kickoffISO); // fallback
    const lockAt = kickoff.minus({ minutes: lockMins });
    const locked = now >= lockAt;
    return { id, kickoffISO: kickoff.toUTC().toISO(), lockAt, locked };
  });

  // First kickoff details
  const withLockTimes = items.filter(i => i.lockAt);
  const firstKickoff = withLockTimes.length
    ? withLockTimes.map(i => i.lockAt).sort((a, b) => a - b)[0]
    : null;

  let weekLocked = false;
  if (mode === "first_kickoff") {
    weekLocked = firstKickoff ? now >= firstKickoff : false;
  }

  const lockedIds = new Set(items.filter(i => i.locked).map(i => i.id));
  const map = {};
  for (const i of items) {
    map[i.id] = {
      locked: Boolean(i.locked),
      kickoffISO: i.kickoffISO,
      lockAtISO: i.lockAt ? i.lockAt.toUTC().toISO() : null,
    };
  }

  return {
    mode,
    weekLocked,
    weekLockAtISO: firstKickoff ? firstKickoff.toUTC().toISO() : null,
    firstKickoffAtISO: firstKickoff ? firstKickoff.plus({ minutes: lockMins }).toUTC().toISO() : null,
    lockedIds,
    map,
  };
}

module.exports = { computeLockStatus };
