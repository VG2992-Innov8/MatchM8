// HORSES: convert "Add Fixtures" to a Race Card editor
(function () {
  const slug = new URLSearchParams(location.search).get("t") || "";
  if (slug.toLowerCase() !== "horses") return; // only for Horses

  function transform() {
    const strong = Array.from(document.querySelectorAll("strong"))
      .find(el => (el.textContent || "").toLowerCase().includes("add fixtures"));
    if (!strong) return false;

    const box = strong.closest("div, section, fieldset") || strong.parentElement;
    const table = box.querySelector("#addFixturesTbl");
    if (!table) return false;

    // Header: # | Course | Time | Runners (hide Date)
    const trh = table.querySelector("thead tr");
    const th = trh ? Array.from(trh.children) : [];
    if (th.length >= 5) {
      th[1].textContent = "Course";
      th[2].textContent = "Time";
      th[3].textContent = "Runners";
      th[3].style.display = "none"; // hide original Date header
    }

    // Rows (inserted by existing JS)
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    if (!rows.length) return false;

    rows.forEach((tr, i) => {
      const td = Array.from(tr.children);
      if (td.length < 5) return;

      // Course (was Home)
      const homeInput = td[1].querySelector("input,textarea");
      if (homeInput) {
        homeInput.type = "text";
        homeInput.placeholder = "e.g., Flemington";
        homeInput.classList.add("rc-course");
      }

      // Hide Date col
      td[3].style.display = "none";

      // Time → single datetime-local
      td[4].innerHTML = '<input class="rc-time" type="datetime-local">';

      // Runners (was Away) → textarea (one per line)
      const ta = document.createElement("textarea");
      ta.className = "rc-runners";
      ta.rows = 4;
      ta.placeholder = "1. Horse Name\n2. Next Horse\n3. ...";
      td[2].innerHTML = "";
      td[2].appendChild(ta);

      tr.dataset.race = String(i + 1);
    });

    // Replace button
    const old = Array.from(box.querySelectorAll("button,input[type=submit]"))
      .find(b => (b.textContent || b.value || "").toLowerCase().includes("submit fixtures"));
    if (old) old.style.display = "none";

    let save = box.querySelector("#save-racecard");
    if (!save) {
      save = document.createElement("button");
      save.id = "save-racecard";
      save.type = "button";
      save.textContent = "Save Race Card";
      save.className = "btn primary";
      save.style.marginTop = "10px";
      box.appendChild(save);
    }

    // Use Week input as Leg number
    const leg = Number(document.getElementById("week")?.value || 1);

    save.onclick = async () => {
      const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
      const races = bodyRows.map((tr, idx) => {
        const num = Number(tr.dataset.race || (idx + 1));
        const course = tr.querySelector(".rc-course")?.value?.trim() || null;
        const dt = tr.querySelector(".rc-time")?.value || "";
        const start = dt ? new Date(dt).toISOString() : null;
        const runners = (tr.querySelector(".rc-runners")?.value || "")
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(Boolean)
          .map(s => s.replace(/^\d+\s*[\.\-\)]\s*/, ""));
        return {
          num, name: `Race ${num}`,
          course, start,
          status: "scheduled",
          result: { win: null, place2: null, place3: null },
          runners
        };
      });

      const res = await fetch(`/api/horse/legs/${leg}/races?t=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leg, status: "scheduled", races })
      });
      if (!res.ok) return alert("Failed to save race card.");
      alert("Race card saved.");
    };

    // Canary to prove it ran
    strong.textContent = "Build Race Card (Leg) — HORSES";
    return true;
  }

  // Run now, and again when table rows appear
  function runWhenReady() {
    if (transform()) return;
    const tbl = document.getElementById("addFixturesTbl");
    if (!tbl) return;
    const obs = new MutationObserver(() => { if (transform()) obs.disconnect(); });
    obs.observe(tbl.tBodies[0] || tbl, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runWhenReady);
  } else {
    runWhenReady();
  }
})();
// HORSES: convert "Add Fixtures" to a Race Card editor
(function () {
  const slug = new URLSearchParams(location.search).get("t") || "";
  if (slug.toLowerCase() !== "horses") return; // only for Horses

  function transform() {
    const strong = Array.from(document.querySelectorAll("strong"))
      .find(el => (el.textContent || "").toLowerCase().includes("add fixtures"));
    if (!strong) return false;

    const box = strong.closest("div, section, fieldset") || strong.parentElement;
    const table = box.querySelector("#addFixturesTbl");
    if (!table) return false;

    // Header: # | Course | Time | Runners (hide Date)
    const trh = table.querySelector("thead tr");
    const th = trh ? Array.from(trh.children) : [];
    if (th.length >= 5) {
      th[1].textContent = "Course";
      th[2].textContent = "Time";
      th[3].textContent = "Runners";
      th[3].style.display = "none";
    }

    // Rows
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    if (!rows.length) return false;

    rows.forEach((tr, i) => {
      const td = Array.from(tr.children);
      if (td.length < 5) return;

      const homeInput = td[1].querySelector("input,textarea");
      if (homeInput) {
        homeInput.type = "text";
        homeInput.placeholder = "e.g., Flemington";
        homeInput.classList.add("rc-course");
      }

      td[3].style.display = "none";                       // hide Date
      td[4].innerHTML = '<input class="rc-time" type="datetime-local">'; // Time

      const ta = document.createElement("textarea");      // Runners
      ta.className = "rc-runners";
      ta.rows = 4;
      ta.placeholder = "1. Horse Name\n2. Next Horse\n3. ...";
      td[2].innerHTML = "";
      td[2].appendChild(ta);

      tr.dataset.race = String(i + 1);
    });

    const old = Array.from(box.querySelectorAll("button,input[type=submit]"))
      .find(b => (b.textContent || b.value || "").toLowerCase().includes("submit fixtures"));
    if (old) old.style.display = "none";

    let save = box.querySelector("#save-racecard");
    if (!save) {
      save = document.createElement("button");
      save.id = "save-racecard";
      save.type = "button";
      save.textContent = "Save Race Card";
      save.className = "btn primary";
      save.style.marginTop = "10px";
      box.appendChild(save);
    }

    const leg = Number(document.getElementById("week")?.value || 1); // use Week as Leg

    save.onclick = async () => {
      const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
      const races = bodyRows.map((tr, idx) => {
        const num = Number(tr.dataset.race || (idx + 1));
        const course = tr.querySelector(".rc-course")?.value?.trim() || null;
        const dt = tr.querySelector(".rc-time")?.value || "";
        const start = dt ? new Date(dt).toISOString() : null;
        const runners = (tr.querySelector(".rc-runners")?.value || "")
          .split(/\r?\n/).map(s => s.trim()).filter(Boolean)
          .map(s => s.replace(/^\d+\s*[\.\-\)]\s*/, ""));
        return {
          num, name: `Race ${num}`,
          course, start,
          status: "scheduled",
          result: { win: null, place2: null, place3: null },
          runners
        };
      });

      const res = await fetch(`/api/horse/legs/${leg}/races?t=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leg, status: "scheduled", races })
      });
      if (!res.ok) return alert("Failed to save race card.");
      alert("Race card saved.");
    };

    strong.textContent = "Build Race Card (Leg) — HORSES"; // canary
    return true;
  }

  function runWhenReady() {
    if (transform()) return;
    const tbl = document.getElementById("addFixturesTbl");
    if (!tbl) return;
    const obs = new MutationObserver(() => { if (transform()) obs.disconnect(); });
    obs.observe(tbl.tBodies[0] || tbl, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runWhenReady);
  } else {
    runWhenReady();
  }
})();
(function () {
  const strong = [...document.querySelectorAll("strong")]
    .find(el => (el.textContent||"").toLowerCase().includes("add fixtures"));
  if (!strong) { console.warn("Add Fixtures block not found"); return; }
  const box = strong.closest("div,section,fieldset") || strong.parentElement;
  const table = box.querySelector("#addFixturesTbl");
  if (!table) { console.warn("addFixturesTbl not found"); return; }

  // header: # | Course | Time | Runners (hide Date)
  const th = table.querySelectorAll("thead tr th");
  if (th.length >= 5) {
    th[1].textContent = "Course";
    th[2].textContent = "Time";
    th[3].textContent = "Runners";
    th[3].style.display = "none";
  }

  // rows
  const rows = table.querySelectorAll("tbody tr");
  rows.forEach((tr, i) => {
    const td = tr.querySelectorAll("td");
    if (td.length < 5) return;

    const home = td[1].querySelector("input,textarea");
    if (home) { home.type = "text"; home.placeholder = "e.g., Flemington"; home.classList.add("rc-course"); }

    td[3].style.display = "none";                       // hide Date
    td[4].innerHTML = '<input class="rc-time" type="datetime-local">'; // Time

    const ta = document.createElement("textarea");      // Runners
    ta.className = "rc-runners"; ta.rows = 4;
    ta.placeholder = "1. Horse Name\n2. Next Horse\n3. ...";
    td[2].innerHTML = ""; td[2].appendChild(ta);

    tr.dataset.race = String(i + 1);
  });

  // swap buttons
  const old = [...box.querySelectorAll("button,input[type=submit]")]
    .find(b => (b.textContent||b.value||"").toLowerCase().includes("submit fixtures"));
  if (old) old.style.display = "none";

  let save = box.querySelector("#save-racecard");
  if (!save) {
    save = document.createElement("button");
    save.id = "save-racecard";
    save.type = "button";
    save.textContent = "Save Race Card";
    save.className = "btn primary";
    save.style.marginTop = "10px";
    box.appendChild(save);
  }

  const slug = new URLSearchParams(location.search).get("t") || "Horses";
  const leg = Number(document.getElementById("week")?.value || 1);

  save.onclick = async () => {
    const bodyRows = [...table.querySelectorAll("tbody tr")];
    const races = bodyRows.map((tr, idx) => {
      const num = Number(tr.dataset.race || (idx + 1));
      const course = tr.querySelector(".rc-course")?.value?.trim() || null;
      const dt = tr.querySelector(".rc-time")?.value || "";
      const start = dt ? new Date(dt).toISOString() : null;
      const runners = (tr.querySelector(".rc-runners")?.value || "")
        .split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        .map(s => s.replace(/^\d+\s*[\.\-\)]\s*/, ""));
      return { num, name: `Race ${num}`, course, start,
               status: "scheduled",
               result: { win: null, place2: null, place3: null },
               runners };
    });
    const res = await fetch(`/api/horse/legs/${leg}/races?t=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ leg, status:"scheduled", races })
    });
    if (!res.ok) return alert("Failed to save race card.");
    alert("Race card saved.");
  };

  // canary
strong.textContent = "Build Race Card (Leg) — HORSES"; // canary
// --- Limit to 5 races for Horses ---
if (typeof bulkClear === "function" && typeof bulkAddRows === "function") {
  try {
    bulkClear();          // remove whatever init added
    bulkAddRows(5);       // show exactly 5 rows
  } catch {}
}
const addBtn = document.getElementById("btnBulkAddRows");
if (addBtn) {
  addBtn.textContent = "Add 5 Rows";
  // intercept the click before the original handler adds 10
  addBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopImmediatePropagation();   // block the old 10-rows handler
    if (typeof bulkAddRows === "function") bulkAddRows(5);
  }, true); // capture phase to beat the existing listener
}
(function () {
  const slug = new URLSearchParams(location.search).get("t") || "";
  if (slug.toLowerCase() !== "horses") return;

  function ensureRaceCard() {
    const strong = [...document.querySelectorAll("strong")]
      .find(el => (el.textContent||"").toLowerCase().includes("add fixtures"));
    const table = document.querySelector("#addFixturesTbl");
    if (!strong || !table) return false;

    // Header: # | Course | Time | Runners (hide Date)
    const th = table.querySelectorAll("thead tr th");
    if (th.length >= 5) {
      th[1].textContent = "Course";
      th[2].textContent = "Time";
      th[3].textContent = "Runners";
      th[3].style.display = "none"; // hide Date
    }

    // Transform rows
    const rows = table.querySelectorAll("tbody tr");
    rows.forEach((tr, i) => {
      const td = tr.querySelectorAll("td");
      if (td.length < 5) return;

      // Course
      const home = td[1].querySelector("input,textarea");
      if (home) { home.type = "text"; home.placeholder = "e.g., Flemington"; home.classList.add("rc-course"); }

      // Hide Date
      td[3].style.display = "none";

      // Time
      td[4].innerHTML = '<input class="rc-time" type="datetime-local">';

      // Runners
      td[2].innerHTML = '';
      const ta = document.createElement('textarea');
      ta.className = 'rc-runners'; ta.rows = 4;
      ta.placeholder = '1. Horse Name\n2. Next Horse\n3. ...';
      td[2].appendChild(ta);

      tr.dataset.race = String(i+1);
    });

    // Limit to exactly 5 rows
    const tbody = table.tBodies[0];
    if (tbody) {
      while (tbody.rows.length > 5) tbody.deleteRow(-1);
      while (tbody.rows.length < 5) {
        // trigger existing add-rows to keep styles consistent
        if (typeof window.bulkAddRows === 'function') window.bulkAddRows(1);
        else {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${tbody.rows.length+1}</td>
            <td><input class="input rc-course" type="text" placeholder="e.g., Flemington"></td>
            <td><textarea class="input rc-runners" rows="4" placeholder="1. Horse Name\n2. Next Horse"></textarea></td>
            <td style="display:none"></td>
            <td><input class="rc-time" type="datetime-local"></td>`;
          tbody.appendChild(tr);
        }
      }
    }

    // Button: Add 5 Rows (override old handler)
    const addBtn = document.getElementById('btnBulkAddRows');
    if (addBtn) {
      addBtn.textContent = 'Add 5 Rows';
      addBtn.addEventListener('click', (e) => {
        e.stopImmediatePropagation(); e.preventDefault();
        if (typeof window.bulkAddRows === 'function') window.bulkAddRows(5);
        setTimeout(ensureRaceCard, 0); // re-transform new rows
      }, true);
    }

    // Hide "Submit Fixtures"; add Save Race Card
    const box = strong.closest('div,section,fieldset') || strong.parentElement;
    const old = [...box.querySelectorAll('button,input[type=submit]')]
      .find(b => (b.textContent||b.value||'').toLowerCase().includes('submit fixtures'));
    if (old) old.style.display = 'none';

    let save = box.querySelector('#save-racecard');
    if (!save) {
      save = document.createElement('button');
      save.id = 'save-racecard'; save.type = 'button';
      save.textContent = 'Save Race Card'; save.className = 'btn primary';
      save.style.marginTop = '10px'; box.appendChild(save);
      save.onclick = async () => {
        const leg = Number(document.getElementById('week')?.value || 1);
        const bodyRows = [...table.querySelectorAll('tbody tr')].slice(0,5);
        const races = bodyRows.map((tr, idx) => {
          const num = idx+1;
          const course = tr.querySelector('.rc-course')?.value?.trim() || null;
          const dt = tr.querySelector('.rc-time')?.value || '';
          const start = dt ? new Date(dt).toISOString() : null;
          const runners = (tr.querySelector('.rc-runners')?.value || '')
            .split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
            .map(s=>s.replace(/^\d+\s*[\.\-\)]\s*/,''));
          return { num, name:`Race ${num}`, course, start,
            status:'scheduled', result:{win:null,place2:null,place3:null}, runners };
        });
        const res = await fetch(`/api/horse/legs/${leg}/races?t=${encodeURIComponent(slug)}`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ leg, status:'scheduled', races })
        });
        if (!res.ok) return alert('Failed to save race card.');
        alert('Race card saved.');
      };
    }

    // Canary
    strong.textContent = 'Build Race Card (Leg) — HORSES';
    return true;
  }

  // Reapply whenever the table changes (the app re-renders it)
  const target = document.getElementById('addFixturesTbl');
  const applyNow = () => { ensureRaceCard(); };
  const obs = new MutationObserver(() => ensureRaceCard());
  if (target) obs.observe(target, { childList: true, subtree: true });
  applyNow();
})();
})();
