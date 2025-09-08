// public/js/tenant.js
(function () {
  const KEY = 'tenant';
  const fromUrl = new URLSearchParams(location.search).get('t');
  let t = (fromUrl && fromUrl.trim()) || localStorage.getItem(KEY) || '';
  if (t) localStorage.setItem(KEY, t);

  // expose helper if you need it elsewhere
  window.getTenant = () => t;

  // Rewrite internal links to carry ?t=...
  document.addEventListener('DOMContentLoaded', () => {
    if (!t) return;

    // anchor tags
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return;           // external link
      if (!url.searchParams.get('t')) {
        url.searchParams.set('t', t);
        a.setAttribute('href', url.pathname + '?' + url.searchParams.toString() + (url.hash || ''));
      }
    });

    // GET forms — add hidden ?t
    document.querySelectorAll('form').forEach(form => {
      const method = (form.getAttribute('method') || 'GET').toUpperCase();
      if (method === 'GET' && !form.querySelector('input[name="t"]')) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 't';
        input.value = t;
        form.appendChild(input);
      }
    });
  });

  // Patch fetch so same-origin requests also carry ?t=... (if missing)
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      let url = input instanceof Request ? input.url : String(input);
      const u = new URL(url, location.origin);
      if (u.origin === location.origin && t && !u.searchParams.get('t')) {
        u.searchParams.set('t', t);
        url = u.toString();
      }
      return _fetch.call(this, url, init);
    } catch {
      return _fetch.call(this, input, init);
    }
  };
})();
