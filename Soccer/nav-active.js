// nav-active.js Ã¢â‚¬" highlights the current tab in the top nav
(function () {
  try {
    // current file (fallback to index.html), ignore trailing slash
    const curFile = (location.pathname.replace(/\/+$/, '').split('/').pop() || 'index.html').toLowerCase();

    document.querySelectorAll('.nav a').forEach(a => {
      const raw = a.getAttribute('href') || '';
      // resolve href against current origin, strip query/hash
      let linkFile = '';
      try {
        const u = new URL(raw, location.origin);
        linkFile = (u.pathname.replace(/\/+$/, '').split('/').pop() || 'index.html').toLowerCase();
      } catch {
        linkFile = (raw.split('?')[0].split('#')[0] || '').toLowerCase();
      }
      if (linkFile && linkFile === curFile) a.classList.add('active');
    });
  } catch (_) {}
})();
