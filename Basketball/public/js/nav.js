// public/js/nav.js
(function () {
  const css = `
    .site-nav{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #eee}
    .site-title{font-weight:700}
    .btn{padding:6px 10px;border-radius:8px;border:1px solid #1e40af;background:#2563eb;color:#fff;text-decoration:none}
    .hidden{display:none}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'site-nav';
  bar.innerHTML = `
    <span class="site-title">MatchM8</span>
    <span style="flex:1"></span>
    <a class="btn hidden" id="adminLink" href="/admin.html">Admin</a>
  `;
  document.body.prepend(bar);

  // Unhide Admin if token is valid
  (async function checkAdmin() {
    const token = localStorage.getItem('adminToken') || '';
    if (!token) return;
    try {
      const res = await fetch('/audit', { headers: { 'x-admin-token': token } });
      if (res.ok) document.getElementById('adminLink')?.classList.remove('hidden');
    } catch {}
  })();
})();
