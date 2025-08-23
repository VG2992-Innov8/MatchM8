// /public/hero.js — 3 header strips, centered text, stepped sizes, Admin only when verified
(() => {
  const host = document.getElementById('hero');
  if (!host) return;

  // Labels
  const pageName   = (host.dataset.page || document.title || 'Home').trim();
  const leagueName = (host.dataset.league || window.MATCHM8_LEAGUE || 'English Premier League').trim();
  const brandName  = (host.dataset.brand  || window.MATCHM8_BRAND  || 'MatchM8 Soccer').trim();

  // Isolated styles (namespaced)
  if (!document.getElementById('m8-header-style')) {
    const css = `
      .m8-header{margin:0 0 12px 0;}
      .m8-strip{
        margin:6px 16px; padding:12px 16px; border-radius:8px;
        background:var(--blue-900,#0d3b66); color:#fff; font-weight:800;
        display:flex; align-items:center; justify-content:center; text-align:center;
      }
      /* Stepped sizes: all bigger than buttons */
      .m8-strip.brand  { font-size: clamp(26px, 3.2vw, 34px); font-weight:900; }
      .m8-strip.league { font-size: clamp(20px, 2.6vw, 28px); font-weight:800; background:var(--blue-800,#114a82); }
      .m8-strip.page   { font-size: clamp(18px, 2.2vw, 24px); font-weight:700; background:var(--blue-700,#19599d); }

      .m8-nav{
        display:flex; gap:8px; flex-wrap:wrap; align-items:center;
        margin:8px 16px 0 16px; justify-content:center;
      }
      .m8-nav a{
        text-decoration:none; padding:6px 10px; border-radius:8px;
        border:1px solid var(--border,#1f2937);
        background:rgba(255,255,255,.6); color:inherit; font-weight:600;
        font-size: 15px; /* keep smaller than header strips */
      }
      .m8-nav a[aria-current="page"]{ font-weight:700; box-shadow: inset 0 -2px 0 rgba(0,0,0,.25); }
    `.replace(/\s+/g, ' ');
    const s = document.createElement('style'); s.id = 'm8-header-style'; s.textContent = css;
    document.head.appendChild(s);
  }

  // Build base nav (without Admin yet)
  const links = [
    { href:'/Part_A_PIN.html',         label:'Home' },
    { href:'/Part_B_Predictions.html', label:'Predictions' },
    { href:'/Part_E_Season.html',      label:'Leaderboard' },
  ];
  const isActive = (href) => {
    try { return new URL(href, location.origin).pathname === location.pathname; }
    catch { return false; }
  };
  const linkHTML = (l) => `<a href="${l.href}" ${isActive(l.href) ? 'aria-current="page"' : ''}>${l.label}</a>`;

  // Render header + nav shell
  host.innerHTML = `
    <div class="m8-header">
      <div class="m8-strip brand">${brandName}</div>
      <div class="m8-strip league">${leagueName}</div>
      <div class="m8-strip page" id="m8-page-strip">${pageName}</div>
      <nav class="m8-nav" id="m8-nav">${links.map(linkHTML).join('')}<span id="m8-admin-slot"></span></nav>
    </div>
  `;

  // ---------- Personalize Predictions label ----------
  function isPredictionsPage() {
    if (/^Predictions$/i.test(pageName)) return true;
    try { return new URL('/Part_B_Predictions.html', location.origin).pathname === location.pathname; }
    catch { return false; }
  }

  // Simple, safe cookie reader (no regex)
  function getCookie(name) {
    const all = document.cookie ? document.cookie.split('; ') : [];
    for (const pair of all) {
      const i = pair.indexOf('=');
      const key = decodeURIComponent(i === -1 ? pair : pair.slice(0, i));
      if (key === name) return decodeURIComponent(i === -1 ? '' : pair.slice(i + 1));
    }
    return null;
  }

  function possessive(name) {
    if (!name) return null;
    return /s$/i.test(name) ? `${name}'` : `${name}'s`;
  }

  async function getPlayerName() {
    // 1) localStorage (common in PIN flows)
    const keys = ['player_name','PLAYER_NAME','MM8_PLAYER_NAME'];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v) return v;
    }
    // 2) cookies (if you set them on login)
    const ck = getCookie('player_name') || getCookie('mm8_player_name');
    if (ck) return ck;

    // 3) optional server probe (safe if absent)
    try {
      const r = await fetch('/api/auth/whoami', { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        if (j && j.player && j.player.name) return j.player.name;
      }
    } catch {}
    return null;
  }

  (async () => {
    if (!isPredictionsPage()) return;
    const el = document.getElementById('m8-page-strip');
    if (!el) return;
    const name = await getPlayerName();
    if (name) el.textContent = `${possessive(name)} Predictions`;
  })();
  // ---------- /personalize ----------

  // Admin link appears ONLY after token is verified
  const adminSlot = document.getElementById('m8-admin-slot');
  const tok = localStorage.getItem('admin_token') || '';
  if (tok) {
    fetch('/api/admin/health', { headers: { 'x-admin-token': tok } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(() => {
        adminSlot.innerHTML = `<a href="/ui/admin.html" ${isActive('/ui/admin.html') ? 'aria-current="page"' : ''}>Admin</a>`;
      })
      .catch(() => { /* invalid token => keep hidden */ });
  }
})();
