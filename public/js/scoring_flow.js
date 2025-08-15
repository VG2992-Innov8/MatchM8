// public/js/scoring_flow.js
(() => {
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const weekInput = $("weekInput");
  const overwrite = $("overwrite");
  const calcBtn = $("calcBtn");
  const previewBtn = $("previewBtn");
  const predLink = $("predLink");
  const table = $("scoresTable");
  const tbody = table.querySelector("tbody");
  const winnersEl = $("winners");
  const summary = $("summary");
  const msg = (t) => { const el = $("msg"); if (el) el.textContent = t || ""; };

  // init week from ?week=
  if (qs.get("week")) weekInput.value = Number(qs.get("week"));

  function setPredLink() {
    const w = weekInput.value || "";
    predLink.href = `/Part_B_Predictions.html?week=${encodeURIComponent(w)}&player_id=1`;
  }
  setPredLink();

  function render(data) {
    // summary
    summary.textContent = `Fixtures with FT: ${data.scored_fixture_count}/${data.fixture_count}  —  timestamp: ${data.timestamp || "—"}`;

    // table
    const rows = Object.values(data.totals || {}).sort((a, b) => b.total - a.total);
    tbody.innerHTML = rows.map(r =>
      `<tr><td>${r.player_name || r.player_id}</td><td>${r.total}</td><td>${r.exact_hits}</td><td>${r.result_hits}</td></tr>`
    ).join("");
    table.classList.toggle("hidden", rows.length === 0);

    // winners
    const wn = (data.winners || []).join(", ");
    winnersEl.textContent = wn ? `Winner(s): ${wn}` : "";
  }

  async function postCalc() {
    const w = weekInput.value;
    if (!w) { msg("Enter a week number"); return; }
    msg("");
    try {
      const res = await fetch("/api/scores/calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: Number(w), overwrite: overwrite.checked, writeCsv: true })
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed");
      render(json);
    } catch (e) {
      msg(String(e.message || e));
    }
  }

  async function getSummary() {
    const w = weekInput.value;
    if (!w) { msg("Enter a week number"); return; }
    msg("");
    try {
      const res = await fetch(`/api/scores/summary?week=${encodeURIComponent(w)}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed");
      render(json);
    } catch (e) {
      msg(String(e.message || e));
    }
  }

  calcBtn.addEventListener("click", postCalc);
  previewBtn.addEventListener("click", getSummary);
  weekInput.addEventListener("input", setPredLink);
})();
