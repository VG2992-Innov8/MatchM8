// lib/fixtures.js
const fs = require('fs');
const path = require('path');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function normalizeFixtures(arr, week) {
  if (!Array.isArray(arr)) return [];
  return arr.map((f, i) => {
    const id = String(
      f.id ?? f.fixture_id ?? f.match_id ?? `${week}-${i + 1}`
    );
    const home = f.home ?? f.homeTeam ?? f.home_name ?? f.home_team ?? 'Home';
    const away = f.away ?? f.awayTeam ?? f.away_name ?? f.away_team ?? 'Away';
    const kickoff_iso =
      f.kickoff_iso ?? f.kickoff ?? f.kickoffTime ?? f.date ?? null;
    return { id, home, away, kickoff_iso };
  });
}

function loadFixturesForWeek(week) {
  const W = String(week);
  const season = String(process.env.SEASON || '2025');

  // 1) Preferred: data/fixtures/season-<season>/week-<week>.json
  const weekFile = path.join(
    __dirname, '..', 'data', 'fixtures', `season-${season}`, `week-${W}.json`
  );
  let data = readJson(weekFile);
  if (Array.isArray(data)) return normalizeFixtures(data, W);

  // 2) Fallback: data/fixtures_by_week.json  (object keyed by week)
  const byWeekFile = path.join(__dirname, '..', 'data', 'fixtures_by_week.json');
  data = readJson(byWeekFile);
  if (data && (Array.isArray(data[W]) || Array.isArray(data[Number(W)]))) {
    return normalizeFixtures(data[W] || data[Number(W)], W);
  }

  // 3) Fallback: data/fixtures.json (flat array, filter by week/gameweek/round)
  const flatFile = path.join(__dirname, '..', 'data', 'fixtures.json');
  data = readJson(flatFile);
  if (Array.isArray(data)) {
    const filtered = data.filter(
      f => String(f.week ?? f.gameweek ?? f.round) === W
    );
    return normalizeFixtures(filtered, W);
  }

  // Nothing found
  return [];
}

module.exports = { loadFixturesForWeek };
