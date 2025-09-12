// public/js/predictions_url_hardener.js
(() => {
  // Fix legacy/external links that encoded "?" as "%3F" in the path.
  const p = location.pathname;
  const idx = p.indexOf("%3F");
  if (idx !== -1) {
    const base = p.slice(0, idx);
    const qsPart = p.slice(idx + 3); // everything after "%3F"
    const existing = location.search ? location.search.slice(1) : "";
    const mergedQs = [qsPart, existing].filter(Boolean).join("&");
    const repaired = `${base}${mergedQs ? "?" + mergedQs : ""}`;
    location.replace(repaired);
  }
})();
