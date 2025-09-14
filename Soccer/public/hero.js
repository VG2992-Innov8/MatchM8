// /public/hero.js — 3 header strips, centered text, stepped sizes,
// scope-preserving nav + Admin reveal after token check
(() => {
  const host = document.getElementById('hero');
  if (!host) return;

  // ---------- scope helpers (works with or without tenant.js) ----------
  const qs = new URLSearchParams(location.search);
  const T = (qs.get('t') || localStorage.getItem('tenant') || '').trim();
  const C = (qs.get('c') || localStorage.getItem('comp')   || '').trim();
  if (T) try { localStorage.setItem('tenant', T); } catch {}
  if (C) try { localStorage.setItem('comp',   C); } catch {}

  const scopeHref = (href) => {
    try {
      if (typeof window.withScope === 'function') return window.withScope(href);
      const u = new URL(href, location.origin);
      if (u.origin !== location.origin) return href;
      if (T && !u.searchParams.has('t')) u.searchParams.set('t', T);
      if (C && !u.searchParams.has('c')) u.searchParams.set('c', C);
      return u.pathname + (u.search || '');
    } catch { return href; }
  };

  // ---------- small utils ----------
  const escapeHtml = (s) => String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const norm = (s) => String(s || '').toLowerCase();

  // ---------- fetch tenant meta (fallback to __meta) ----------
  async function readMeta() {
    const metaUrl = new URL('/api/tenant/meta', location.origin);
    if (T) metaUrl.searchParams.set('t', T);
    if (C) metaUrl.searchParams.set('c', C);

    try {
      const r = await fetch(metaUrl.toString(), { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {/* fall through */}

    // fallback
    const fallback = new URL('/api/__meta', location.origin);
    if (T) fallback.searchParams.set('t', T);
    if (C) fallback.searchParams.set('c', C);
    try {
      const r2 = await fetch(fallback.toString(), { cache: 'no-store' });
      if (r2.ok) {
        const j = await r2.json();
        // shape-align to /api/tenant/meta keys we use
        return {
          ok: true,
          appTitle: j.appTitle || 'MatchM8',
          tenant: j.tenant || T || 'default',
          competition: j.competition || C || '',
          brand_title: j.appTitle || 'MatchM8',
          brand_subtitle: j.tenant || '',
          sport: null,
        };
      }
    } catch {}
    return { ok:false };
  }

  // ---------- decide labels exactly as requested ----------
  function deriveLabels(meta) {
    const tSub = String(meta.brand_subtitle || meta.tenant || '');
    const comp = String(meta.competition || '');
    let sport = norm(meta.sport);

    // Infer sport if missing
    if (!sport) {
      const hay = `${tSub} ${comp}`.toLowerCase();
      if (hay.includes('basketball') || hay.includes('nbl')) sport = 'basketball';
      else if (hay.includes('soccer') || hay.includes('football') || hay.includes('epl') || hay.includes('premier')) sport = 'soccer';
    }
    if (sport === 'football') sport = 'soccer'; // alias

    let topStrip = 'MatchM8';
    let secondStrip = '';

    if (sport === 'basketball') {
      topStrip = 'MatchM8 Basketball';
      secondStrip = 'NBL';
    } else if (sport === 'soccer') {
      topStrip = 'MatchM8 Soccer';
      secondStrip = 'English Premier League';
    } else {
      // fallback: stay graceful if we ever have a different tenant
      topStrip = meta.brand_title || meta.appTitle || 'MatchM8';
      secondStrip = meta.brand_subtitle || comp || '';
    }

    return { topStrip, secondStrip, sport };
  }

  // ---------- styles (scoped) ----------
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
        font-size: 15px;
      }
      .m8-nav a[aria-current="page"]{ font-weight:700; box-shadow: inset 0 -2px 0 rgba(0,0,0,.25); }
    `.replace(/\s+/g,' ');
    const s = document.createElement('style'); s.id = 'm8-header-style'; s.textContent = css;
    document.head.appendChild(s);
  }

  // ---------- base nav (scoped) ----------
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

  // ---------- render ----------
  (async () => {
    const meta = await readMeta();
    const { topStrip, secondStrip, sport } = deriveLabels(meta);
    const pageName = (host.dataset.page || document.title || 'Home').trim();

    host.innerHTML = `
      <div class="m8-header">
        <div class="m8-strip brand" id="m8-strip-brand">${escapeHtml(topStrip)}</div>
        <div class="m8-strip league" id="m8-strip-league">${escapeHtml(secondStrip)}</div>
        <div class="m8-strip page" id="m8-page-strip">${escapeHtml(pageName)}</div>
        <nav class="m8-nav" id="m8-nav">${links.map(linkHTML).join('')}<span id="m8-admin-slot"></span></nav>
      </div>
    `;

    // ✅ THEME OVERRIDE (minimal change): Basketball gets red palette
    if (sport === 'basketball') {
      const brandEl  = document.getElementById('m8-strip-brand');
      const leagueEl = document.getElementById('m8-strip-league');
      const pageEl   = document.getElementById('m8-page-strip');
      if (brandEl)  { brandEl.style.background  = '#b92c44'; brandEl.style.color  = '#fff'; }
      if (leagueEl) { leagueEl.style.background = '#d43b58'; leagueEl.style.color = '#fff'; }
      if (pageEl)   { pageEl.style.background   = '#ee4b66'; pageEl.style.color   = '#fff'; }
    }
    // (Soccer remains blue via existing CSS)

    // Set a nice document title
    document.title = `${topStrip} — ${secondStrip}${pageName ? ' — ' + pageName : ''}`;

    // Safety net: rewrite nav links (preserve scope)
    document.querySelectorAll('nav.m8-nav a[href^="/"]').forEach(a => {
      a.setAttribute('href', scopeHref(a.getAttribute('href')));
    });

    // ----- Personalize Predictions header (optional nicety) -----
    function isPredictionsPage() {
      if (/^Predictions$/i.test(pageName)) return true;
      try { return new URL('/Part_B_Predictions.html', location.origin).pathname === location.pathname; }
      catch { return false; }
    }
    const getCookie = (name) => {
      const all = document.cookie ? document.cookie.split('; ') : [];
      for (const pair of all) {
        const i = pair.indexOf('=');
        const key = decodeURIComponent(i === -1 ? pair : pair.slice(0, i));
        if (key === name) return decodeURIComponent(i === -1 ? '' : pair.slice(i + 1));
      }
      return null;
    };
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
    if (isPredictionsPage()) {
      const el = document.getElementById('m8-page-strip');
      const name = await getPlayerName();
      if (el && name) el.textContent = `${possessive(name)} Predictions`;
    }

    // ----- Admin link appears ONLY after token verification -----
    const adminSlot = document.getElementById('m8-admin-slot');
    const tok = localStorage.getItem('admin_token') || '';
    if (tok) {
      try {
        const r = await fetch('/api/admin/health', { headers: { 'x-admin-token': tok } });
        if (r.ok) {
          const href = scopeHref('/ui/admin.html');
          adminSlot.innerHTML = `<a href="${href}" ${isActive(href) ? 'aria-current="page"' : ''}>Admin</a>`;
        }
      } catch {/* keep hidden on failure */}
    }
  })();
})();

// Default the Admin week input to current_week (only on Admin-like pages)
(() => {
  const page = document.getElementById('hero')?.dataset?.page || '';
  const ADMIN_PAGES = ['Fixtures', 'Results', 'Admin', 'Locks', 'Admin Fixtures', 'Admin Results'];
  if (!ADMIN_PAGES.includes(page)) return;

  window.addEventListener('DOMContentLoaded', async () => {
    const qs = new URLSearchParams(location.search);
    if (qs.has('week')) return; // don’t override explicit week
    const inp = document.getElementById('week'); if (!inp) return;
    try {
      const cfg = await fetch('/api/config', { cache:'no-store' }).then(r=>r.json());
      inp.value = Number(cfg.current_week || 1);
      inp.dispatchEvent(new Event('change'));
    } catch {}
  });
})();
