// public/js/tenant.js
(function () {
  const TENANT_KEY = 'tenant';
  const COMP_KEY   = 'comp';

  const qs = new URLSearchParams(location.search);
  const tFromUrl = (qs.get('t') || '').trim();
  const cFromUrl = (qs.get('c') || '').trim();

  let t = tFromUrl || localStorage.getItem(TENANT_KEY) || '';
  let c = cFromUrl || localStorage.getItem(COMP_KEY) || '';

  if (t) { try { localStorage.setItem(TENANT_KEY, t); } catch {} }
  if (c) { try { localStorage.setItem(COMP_KEY, c); } catch {} }

  // expose helpers
  window.getTenant = () => t;
  window.getComp   = () => c;

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
})();