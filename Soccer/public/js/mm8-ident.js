/* public/js/mm8-ident.js
   Ensures we always attach the correct player GUID when calling /api/predictions.
   Sources: localStorage -> /api/auth/me -> players list by stored name
*/
(function () {
  const MM8 = (window.MM8 = window.MM8 || {});

  function readCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function getStoredId() {
    // accept both the newer mm8_* keys and older keys used by pages
    return (
      localStorage.getItem('mm8_player_id') ||
      localStorage.getItem('player_id') ||
      readCookie('mm8_pid') ||
      ''
    );
  }
  function getStoredName() {
    return (
      localStorage.getItem('mm8_player_name') ||
      localStorage.getItem('player_name') ||
      ''
    );
  }

  MM8.ident = {
    getStored() {
      const id = getStoredId();
      const name = getStoredName();
      return { id: String(id || ''), name: String(name || '') };
    },

    remember(user) {
      const id = String(user?.id || '');
      const name = String(user?.name || '');
      try {
        // write both key styles so all pages can read it
        localStorage.setItem('mm8_player_id', id);
        localStorage.setItem('mm8_player_name', name);
        localStorage.setItem('player_id', id);
        localStorage.setItem('player_name', name);
        document.cookie = 'mm8_pid=' + encodeURIComponent(id) + '; path=/; max-age=31536000';
      } catch {}
    },

    async ensure() {
      const s = this.getStored();
      if (s.id) return s;

      // Try me endpoint
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' });
        if (r.ok) {
          const me = await r.json();
          if (me && me.id) { this.remember(me); return me; }
        }
      } catch {}

      // Try players list by stored name
      const storedName = getStoredName();
      if (storedName) {
        try {
          const list = await (await fetch('/api/players')).json();
          const hit = list.find(
            p => String(p.name || '').toLowerCase() === storedName.toLowerCase()
          );
          if (hit) {
            const u = { id: String(hit.id), name: hit.name || '' };
            this.remember(u);
            return u;
          }
        } catch {}
      }
      throw new Error('No player identity found. Please sign in on Part_A_PIN first.');
    },

    tenantFromQuery() {
      return new URLSearchParams(location.search).get('t') || '';
    },

    // NEW: optional badge/identity mount (no-op if container missing)
    mount(selector) {
      const sel = selector || '#mm8-ident';
      const host = document.querySelector(sel);
      if (!host) return;
      const who = this.getStored();
      host.innerHTML = who.name
        ? `<span class="muted">Signed in as <strong>${who.name}</strong></span>`
        : `<span class="muted">Not signed in</span>`;
    }
  };

  MM8.predictions = {
    async submit(week, picks, opts = {}) {
      const player = opts.player || await MM8.ident.ensure();
      const tenant = opts.tenant || MM8.ident.tenantFromQuery();
      const url = tenant ? `/api/predictions?t=${encodeURIComponent(tenant)}` : '/api/predictions';

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-player-id': player.id
        },
        body: JSON.stringify({ week, predictions: picks })
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  };
})();
