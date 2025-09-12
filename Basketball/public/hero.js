// /public/hero.js — 3 header strips, centered text, stepped sizes,
// **now preserves ?t=<tenant>&c=<comp> on all nav links (incl. Admin)**

(() => {
  const host = document.getElementById('hero');
  if (!host) return;

  // ---- scope helpers (works with or without tenant.js) ----
  const qs = new URLSearchParams(location.search);
  const T = (qs.get('t') || localStorage.getItem('tenant') || '').trim();
  const C = (qs.get('c') || localStorage.getItem('comp')   || '').trim();

  const scopeHref = (href) => {
    try {
      // Prefer tenant.js helper if present
      if (typeof window.withScope === 'function') return window.withScope(href);
      const u = new URL(href, location.origin);
      if (u.origin !== location.origin) return href;
      if (T && !u.searchParams.has('t')) u.searchParams.set('t', T);
      if (C && !u.searchParams.has('c')) u.searchParams.set('c', C);
      return u.pathname + u.search;
    } catch { return href; }
  };

  // ---- labels ----
  const pageName   = (host.dataset.page   || document.title || 'Home').trim();
  const leagueName = (host.dataset.league || window.MATCHM8_LEAGUE || 'English Premier League').trim();
  const brandName  = (host.dataset.brand  || window.MATCHM8_BRAND  || 'MatchM8 Soccer').trim();

  // ---- isolated styles ----
  if (!document.getElementById('m8-header-style')) {
    const css = `
      .m8-header{margin:0 0 12px 0;}
      .m8-strip{
        margin:6px 16px; padding:12px 16px; border-radius:8px;
        background:var(--blue-900,#0d3b66); color:#fff; font-weight:800;
        display:flex; align-items:center; justify-content:center; text-align:center;
      }
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

  // ---- base nav (scoped) ----
  const links = [
    { href: scopeHref('/Part_A_PIN.html'),         label:'Home' },
    { href: scopeHref('/Part_B_Predictions.html'), label:'Predictions' },
    { href: scopeHref('/Part_E_Season.html'),      label:'Leaderboard' },
  ];
  const isActive = (href) => {
    try { return new URL(href, location.origin).pathname === location.pathname; }
    catch { return false; }
  };
  const linkHTML = (l) => `<a href="${l.href}" ${isActive(l.href) ? 'aria-current="page"' : ''}>${l.label}</a>`;

  // ---- render header + nav shell ----
  host.innerHTML = `
    <div class="m8-header">
      <div class="m8-strip brand">${brandName}</div>
      <div class="m8-strip league">${leagueName}</div>
      <div class="m8-strip page" id="m8-page-strip">${pageName}</div>
      <nav class="m8-nav" id="m8-nav">${links.map(linkHTML).join('')}<span id="m8-admin-slot"></span></nav>
    </div>
  `;

  // Safety net: rewrite any nav links to ensure scope (covers dynamic markup)
  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('nav.m8-nav a[href^="/"]').forEach(a => {
      a.setAttribute('href', scopeHref(a.getAttribute('href')));
    });
  });

  // ---------- Personalize Predictions label ----------
  function isPredictionsPage() {
    if (/^Predictions$/i.test(pageName)) return true;
    try { return new URL('/Part_B_Predictions.html', location.origin).pathname === location.pathname; }
    catch { return false; }
  }

  function getCookie(name) {
    const all = document.cookie ? document.cookie.split('; ') : [];
    for (const pair of all) {
      const i = pair.indexOf('=');
      const key = decodeURIComponent(i === -1 ? pair : pair.slice(0, i));
      if (key === name) return decodeURIComponent(i === -1 ? '' : pair.slice(i + 1));
    }
    return null;
  }
  const possessive = (name) => (!name ? null : (/s$/i.test(name) ? `${name}'` : `${name}'s`));

  async function getPlayerName() {
    for (const k of ['player_name','PLAYER_NAME','MM8_PLAYER_NAME']) {
      const v = localStorage.getItem(k); if (v) return v;
    }
    const ck = getCookie('player_name') || getCookie('mm8_player_name');
    if (ck) return ck;
    try {
      const r = await fetch('/api/auth/whoami', { credentials: 'include' });
      if (r.ok) { const j = await r.json(); if (j?.player?.name) return j.player.name; }
    } catch {}
    return null;
  }

  (async () => {
    if (!isPredictionsPage()) return;
    const el = document.getElementById('m8-page-strip'); if (!el) return;
    const name = await getPlayerName(); if (name) el.textContent = `${possessive(name)} Predictions`;
  })();
  // ---------- /personalize ----------

  // ---- Admin link appears ONLY after token is verified (scoped href) ----
  const adminSlot = document.getElementById('m8-admin-slot');
  const tok = localStorage.getItem('admin_token') || '';
  if (tok) {
    fetch('/api/admin/health', { headers: { 'x-admin-token': tok } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(() => {
        const href = scopeHref('/ui/admin.html');
        adminSlot.innerHTML = `<a href="${href}" ${isActive(href) ? 'aria-current="page"' : ''}>Admin</a>`;
      })
      .catch(() => { /* invalid token => keep hidden */ });
  }
})();

// Default the Admin week input to current_week (only on Admin-like pages)
(() => {
  const page = document.getElementById('hero')?.dataset?.page || '';
  const ADMIN_PAGES = ['Fixtures', 'Results', 'Admin', 'Locks', 'Admin Fixtures', 'Admin Results'];
  if (!ADMIN_PAGES.includes(page)) return;

  window.addEventListener('DOMContentLoaded', async () => {
    const qs = new URLSearchParams(location.search);
    if (qs.has('week')) return; // don’t override explicit week

    const inp = document.getElementById('week');
    if (!inp) return;

    try {
      const cfg = await fetch('/api/config', { cache:'no-store' }).then(r=>r.json());
      inp.value = Number(cfg.current_week || 1);
      inp.dispatchEvent(new Event('change'));
    } catch {}

    // (Preview button placeholder left as-is)
  });
})();
