(() => {
  const $ = (sel) => document.querySelector(sel);

  async function loadSeason() {
    const base = location.origin;
    const url = `${base}/api/scores/season`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const meta = $('#meta');
    meta.textContent = data.weeks?.length
      ? `Weeks counted: ${data.weeks.join(', ')}  Ã¢â‚¬Â¢  Updated: ${new Date(data.asOf).toLocaleString()}`
      : 'No saved weeks yet. Finalize a week on the Scoring page to populate the season table.';

    const tbody = $('#seasonTable tbody');
    tbody.innerHTML = '';

    (data.leaderboard || []).forEach((row, idx) => {
      const tr = document.createElement('tr');

      const byWeek = row.per_week || {};
      const byWeekStr = Object.keys(byWeek).sort((a,b)=>Number(a)-Number(b))
        .map(w => `W${w}: ${byWeek[w]}`).join('  Ã¢â‚¬Â¢  ');

      tr.innerHTML = `
        <td class="mono">${idx + 1}</td>
        <td>${row.player_name || ('Player ' + row.player_id)}</td>
        <td class="mono"><strong>${row.total ?? 0}</strong></td>
        <td class="mono">${row.exact_hits ?? 0}</td>
        <td class="mono">${row.result_hits ?? 0}</td>
        <td class="mono">${row.weeks_played ?? 0}</td>
        <td>${byWeekStr}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    loadSeason().catch(err => {
      console.error('Season load failed', err);
      $('#meta').textContent = 'Failed to load season leaderboard.';
    });
  });
})();
