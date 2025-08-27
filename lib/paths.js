// lib/paths.js
const path = require('path');

// Resolve the runtime data directory.
// - If DATA_DIR is set, use it (absolute or relative).
// - Otherwise default to <repo>/data
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'data');

// Convenience joiner: p('scores','season-totals.json') -> <DATA_DIR>/scores/season-totals.json
const p = (...segs) => path.join(DATA_DIR, ...segs);

module.exports = { DATA_DIR, p };
