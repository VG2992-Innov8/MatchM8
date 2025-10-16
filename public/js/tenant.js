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
