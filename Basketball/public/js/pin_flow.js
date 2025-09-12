// public/js/pin_flow.js
(() => {
  const $ = (id) => document.getElementById(id);
  const msg = (t) => { const el = $('msg'); if (el) el.textContent = t || ''; };

  const is4Digit = (pin) => /^\d{4}$/.test(String(pin).trim());
  const isNumberLike = (v) => /^\d+$/.test(String(v).trim());

  async function resolvePlayer(match) {
    const val = String(match ?? '').trim();
    if (!val) return null;
    // If numeric, treat as player_id; else treat as name
    if (isNumberLike(val)) return { player_id: val };
    return { name: val };
  }

  function goToPredictions({ week, player_id }) {
    // Ã¢Å"â€¦ Build URL safely; DO NOT encode the whole URL
    const url = new URL('/Part_B_Predictions.html', window.location.origin);
    url.search = new URLSearchParams({ week: String(week), player_id: String(player_id) }).toString();
    window.location.href = url.toString();
  }

  $('pinForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg('');

    try {
      const rawPlayer = $('playerInput')?.value ?? '';
      const week = String($('weekInput')?.value ?? '').trim();
      const pin = String($('pinInput')?.value ?? '').trim();

      if (!week || !isNumberLike(week)) {
        msg('Choose a valid week.');
        return;
      }
      if (!is4Digit(pin)) {
        msg('PIN must be 4 digits.');
        return;
      }

      // Resolve player (by id or name) and verify PIN server-side
      const who = await resolvePlayer(rawPlayer);
      if (!who) { msg('Enter player name or ID.'); return; }

      // POST to your existing verify endpoint
      const res = await fetch('/auth/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...who, pin })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        msg(data?.error || 'PIN verification failed.');
        return;
      }

      const player_id = data.player_id ?? who.player_id; // prefer canonical id from server
      goToPredictions({ week, player_id });
    } catch (err) {
      console.error(err);
      msg('Something went wrong. Try again.');
    }
  });
})();
