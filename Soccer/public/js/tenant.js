// public/js/tenant.js 
(function () {
  const TENANT_KEY = 'tenant';
  const COMP_KEY   = 'comp';

  const qs = new URLSearchParams(location.search);
  const tFromUrl = (qs.get('t') || '').trim();
  const cFromUrl = (qs.get('c') || '').trim();
  const cCameFromUrl = !!cFromUrl;

  let t = tFromUrl || localStorage.getItem(TENANT_KEY) || '';
  let c = cFromUrl || localStorage.getItem(COMP_KEY) || '';

  if (t) { try { localStorage.setItem(TENANT_KEY, t); } catch {} }
  if (c) { try { localStorage.setItem(COMP_KEY, c); } catch {} }

  // expose helpers
  window.getTenant = () => t;
  window.getComp   = () => c;

  function setComp(newComp) {
    c = String(newComp || '').trim();
    try { localStorage.setItem(COMP_KEY, c); } catch {}
    window.getComp = () => c;
  }

  function addScopeToUrl(url) {
    try {
      const u = new URL(url, location.origin);
      if (u.origin !== location.origin) return url; // only same-origin
      if (t && !u.searchParams.has('t')) u.searchParams.set('t', t);
      if (c && !u.searchParams.has('c')) u.searchParams.set('c', c);
      return u.toString();
    } catch { return url; }
  }
  window.withScope     = addScopeToUrl;
  window.navWithScope  = addScopeToUrl;
  window.navWithTenant = addScopeToUrl; // legacy alias

  // Rewrite internal <a> links
  document.addEventListener('DOMContentLoaded', () => {
    if (!t && !c) return;
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || /^https?:\/\//i.test(href)) return;   // skip external
      a.setAttribute('href', addScopeToUrl(href));
    });
  });

  // Monkey-patch fetch to auto-append t & c to same-origin requests
  const _fetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      if (input instanceof Request) {
        const scopedUrl = addScopeToUrl(input.url);
        if (scopedUrl !== input.url) {
          const cloned = new Request(scopedUrl, {
            method: input.method,
            headers: input.headers,
            body: input.body,
            mode: input.mode,
            credentials: input.credentials,
            cache: input.cache,
            redirect: input.redirect,
            referrer: input.referrer,
            referrerPolicy: input.referrerPolicy,
            integrity: input.integrity,
            keepalive: input.keepalive,
            signal: input.signal
          });
          return _fetch(cloned, init || {});
        }
        return _fetch(input, init || {});
      } else {
        return _fetch(addScopeToUrl(String(input)), init || {});
      }
    } catch {
      return _fetch(input, init);
    }
  };

  // ---------- Finals auto-switch hook ----------
  function injectFinalsBanner(newComp) {
    if (!newComp) return;
    // only once per comp per tab
    const flag = `finals_banner_${newComp}`;
    try { if (sessionStorage.getItem(flag)) return; sessionStorage.setItem(flag, '1'); } catch {}

    const style = document.createElement('style');
    style.textContent = `
      .finals-banner {
        position: sticky; top: 0; z-index: 9999;
        background: #0ea5e9; color: #002b3a;
        padding: 8px 12px; font-size: 14px;
        display: flex; gap: 8px; align-items: center;
        box-shadow: 0 1px 4px rgba(0,0,0,.1);
      }
      .finals-banner b { font-weight: 700; }
      .finals-banner a { color: #002b3a; text-decoration: underline; }
    `;
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.className = 'finals-banner';
    bar.innerHTML = `🏆 Finals have begun. Switched to <b>${newComp}</b>.
      <a href="#" data-reload>Reload</a>`;
    bar.querySelector('[data-reload]')?.addEventListener('click', (e) => {
      e.preventDefault();
      // reload current path but ensure scope params reflect new comp
      location.href = addScopeToUrl(location.pathname + location.search);
    });
    document.body.prepend(bar);
  }

  async function checkDefaultCompetitionAndMaybeSwitch() {
    // If user explicitly chose a comp via URL, don't override.
    if (cCameFromUrl) return;
    try {
      // We only need tenant-level config; /api/config already returns it for pages.
      const cfg = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).catch(()=>null);
      if (!cfg) return;
      const newDefault = String(cfg.defaultCompetition || cfg.default_competition || '').trim();
      if (!newDefault) return;
      if (newDefault && newDefault !== c) {
        setComp(newDefault);
        injectFinalsBanner(newDefault);
        // Update already-rendered links to carry the new comp
        document.querySelectorAll('a[href]').forEach(a => {
          const href = a.getAttribute('href');
          if (!href || /^https?:\/\//i.test(href)) return;
          a.setAttribute('href', addScopeToUrl(href));
        });
      }
    } catch {}
  }

  // Run after DOM is ready so banner can be injected nicely
  document.addEventListener('DOMContentLoaded', checkDefaultCompetitionAndMaybeSwitch);
})();
