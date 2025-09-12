// public/js/predictions_flow.js
(() => {
  const $ = (id) => document.getElementById(id);
  const msg = (t) => { const el = $("msg"); if (el) el.textContent = t || ""; };

  const params = new URLSearchParams(location.search);
  const WEEK = params.get("week");
  const PLAYER_ID = params.get("player_id");
  if (!WEEK || !PLAYER_ID) { msg("Missing week or player_id in URL."); return; }

  // Ensure the container exists
  let fixturesEl = $("fixtures");
  if (!fixturesEl) {
    fixturesEl = document.createElement("div");
    fixturesEl.id = "fixtures";
    fixturesEl.className = "fixtures";
    document.body.appendChild(fixturesEl);
  }

  const saveBtn = $("saveBtn");
  const saveStatus = $("saveStatus"); // may be null

  // ---------- helpers ----------
  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch {}
      throw new Error(`${res.status} ${res.statusText} @ ${url} :: ${body}`);
    }
    return res.json();
  }
  async function tryEndpoints(candidates, opts) {
    let lastErr;
    for (const url of candidates) {
      try { return await fetchJson(url, opts); }
      catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("No endpoints succeeded");
  }

  function fixturesUrls(week) {
    const w = encodeURIComponent(week);
    return [
      `/api/fixtures?week=${w}`,
      `/api/fixtures/${w}`,
      `/fixtures?week=${w}`,
      `/fixtures/${w}`,
    ];
  }
  function getPredictionsUrls(week, playerId) {
    const w = encodeURIComponent(week), p = encodeURIComponent(playerId);
    return [
      `/api/predictions?week=${w}&player_id=${p}`,
      `/api/predictions/${w}?player_id=${p}`,
      `/predictions?week=${w}&player_id=${p}`,
      `/predictions/${w}?player_id=${p}`,
    ];
  }
  function postPredictionsUrls() {
    return [
      `/api/predictions/save`,
      `/predictions/save`,
    ];
  }

  function ftBadge(ft) {
    if (!ft || ft.home == null || ft.away == null) return "";
    const span = document.createElement("span");
    span.className = "ft-badge";
    span.textContent = `FT ${ft.home}Ã¢â‚¬"${ft.away}`;
    return span;
  }
  function inputScore(value = "") {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.className = "score";
    inp.value = value == null ? "" : value;
    return inp;
  }

  // ---------- load ----------
  async function loadData() {
    msg("");
    let fixtures;
    try {
      fixtures = await tryEndpoints(fixturesUrls(WEEK));
    } catch (e) {
      console.error("Fixtures fetch failed:", e);
      msg("Failed to load fixtures.");
      return;
    }

    let existing = {};
    try {
      const resp = await tryEndpoints(getPredictionsUrls(WEEK, PLAYER_ID));
      existing = resp?.predictions || resp || {};
    } catch {
      existing = {};
    }

    render(fixtures, existing);
  }

  function renderHeader() {
    const hdr = document.createElement("div");
    hdr.className = "row header";
    hdr.innerHTML = `
      <div>Home</div>
      <div>Away</div>
      <div>Your Home</div>
      <div>Your Away</div>
      <div>FT</div>
    `;
    fixturesEl.appendChild(hdr);
  }

  function render(fixtures, existing) {
    fixturesEl.innerHTML = "";       // always start clean
    renderHeader();                  // we create the header ourselves

    fixtures.forEach((f, idx) => {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.fixtureId =
        f.id ?? f.fixture_id ?? f.match_id ?? `W${WEEK}-${idx+1}`;

      const homeName = f.homeTeam ?? f.home ?? f.home_name ?? "Home";
      const awayName = f.awayTeam ?? f.away ?? f.away_name ?? "Away";

      const home = document.createElement("div"); home.textContent = homeName;
      const away = document.createElement("div"); away.textContent = awayName;

      const key = row.dataset.fixtureId;
      const pred = existing[key] || {};
      const inH = inputScore(pred.home);
      const inA = inputScore(pred.away);

      const cellH = document.createElement("div"); cellH.appendChild(inH);
      const cellA = document.createElement("div"); cellA.appendChild(inA);

      const ft =
        f.ft ||
        (f.full_time && { home: f.full_time.home, away: f.full_time.away }) ||
        (f.result && { home: f.result.home, away: f.result.away });

      const ftCell = document.createElement("div");
      const badge = ftBadge(ft);
      if (badge) ftCell.appendChild(badge);

      row.append(home, away, cellH, cellA, ftCell);
      fixturesEl.appendChild(row);
    });
  }

  // ---------- save (with Ã¢â‚¬Å"Saved X/YÃ¢â‚¬Â + warnings for blanks) ----------
  async function save() {
    const rows = Array.from(fixturesEl.querySelectorAll(".row")).slice(1);
    const payload = {};
    const missing = [];

    for (const r of rows) {
      const id = r.dataset.fixtureId;
      const [home, away] = r.querySelectorAll("input.score");

      const h = home.value === "" ? null : Number(home.value);
      const a = away.value === "" ? null : Number(away.value);

      home.classList.toggle("warn", home.value === "");
      away.classList.toggle("warn", away.value === "");

      if (h !== null && a !== null && !Number.isNaN(h) && !Number.isNaN(a)) {
        payload[id] = { home: h, away: a };
      } else {
        const labels = r.querySelectorAll("div");
        const homeName = labels[0]?.textContent?.trim() || "Home";
        const awayName = labels[1]?.textContent?.trim() || "Away";
        missing.push(`${homeName}Ã¢â‚¬"${awayName}`);
      }
    }

    const body = JSON.stringify({ week: WEEK, player_id: PLAYER_ID, predictions: payload });

    let ok = false;
    for (const url of postPredictionsUrls()) {
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        if (res.ok) { ok = true; break; }
      } catch {}
    }
    if (!ok) { msg("Failed to save predictions."); return; }

    const savedCount = Object.keys(payload).length;
    const total = rows.length;

    if (savedCount === total) {
      if (saveStatus) { saveStatus.classList.remove("hidden"); setTimeout(() => saveStatus.classList.add("hidden"), 1500); }
      else { msg("Saved Ã¢Å"""); setTimeout(() => msg(""), 1200); }
    } else {
      msg(`Saved ${savedCount}/${total}. Not saved: ${missing.join(", ")}.`);
      setTimeout(() => msg(""), 2500);
    }
  }

  saveBtn?.addEventListener("click", save);
  loadData().catch((e) => { console.error(e); msg("Something went wrong loading data."); });
})();
