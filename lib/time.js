// lib/time.js
const isLocked = (kickoffIso) => Date.now() >= new Date(kickoffIso).getTime();
module.exports = { isLocked, MS: { /* ...optional... */ }, earliestKickoff: () => {} };
