// lib/time.js
const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon');
const { DATA_DIR } = require('../lib/paths');

const DEFAULT_CFG = {
  season: 2025,
  lock_minutes_before_kickoff: 10,
  timezone: 'Australia/Melbourne'
};

function readConfig() {
  try {
    const p = path.join(DATA_DIR, 'config.json');
    return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch {
    return { ...DEFAULT_CFG };
  }
}

function kickoffToLock(kickoffUtcISO, minutesBefore, tz) {
  return DateTime.fromISO(kickoffUtcISO, { zone: 'utc' })
    .setZone(tz)                      // shift to club/admin TZ (e.g., Australia/Melbourne)
    .minus({ minutes: minutesBefore })
    .toUTC()
    .toISO();
}

/** Is this fixture locked now?  Uses cfg if provided; otherwise reads config.json */
function isLocked(kickoffUtcISO, cfg) {
  const c = cfg || readConfig();
  const mins = Number(c.lock_minutes_before_kickoff || 0);
  const tz = c.timezone || DEFAULT_CFG.timezone;
  const lockUtc = kickoffToLock(kickoffUtcISO, mins, tz);
  return DateTime.utc() >= DateTime.fromISO(lockUtc, { zone: 'utc' });
}

/** Find earliest kickoff ISO for a season/week from DATA_DIR fixtures */
function earliestKickoff(season, week) {
  const p = path.join(DATA_DIR, 'fixtures', `season-${season}`, `week-${week}.json`);
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    const list = Array.isArray(data?.fixtures) ? data.fixtures : Array.isArray(data) ? data : [];
    const times = list.map(f => f.kickoff_utc).filter(Boolean).sort();
    return times[0] || null;
  } catch {
    return null;
  }
}

/** Convenience for UI formatting in a given zone */
function formatInZone(isoUtc, tz, fmt = "EEE d LLL yyyy, h:mm a ZZZZ") {
  return DateTime.fromISO(isoUtc, { zone: 'utc' }).setZone(tz).toFormat(fmt);
}

module.exports = { kickoffToLock, isLocked, earliestKickoff, formatInZone, readConfig };
