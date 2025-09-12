function getCookie(name) {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : null;
}
function showPinModal() {
  const m = document.getElementById('pinModal');
  if (!m) return;
  m.classList.remove('hidden'); m.classList.add('flex');
  document.getElementById('pinInput')?.focus();
}
function hidePinModal() {
  const m = document.getElementById('pinModal');
  if (!m) return;
  m.classList.add('hidden'); m.classList.remove('flex');
  const e = document.getElementById('pinError'); if (e) e.classList.add('hidden');
}
async function ensurePinVerified(playerId) {
  if (getCookie('pred_edit_token')) return true;
  showPinModal();
  return new Promise((resolve) => {
    const submit = async () => {
      const pin = document.getElementById('pinInput').value.trim();
      if (!pin) return;
      const res = await fetch('/auth/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ player_id: playerId, pin })
      });
      if (res.ok) { hidePinModal(); resolve(true); }
      else { document.getElementById('pinError').classList.remove('hidden'); }
    };
    const sBtn = document.getElementById('pinSubmit');
    const cBtn = document.getElementById('pinCancel');
    if (sBtn) sBtn.onclick = submit;
    if (cBtn) cBtn.onclick = () => { hidePinModal(); resolve(false); };
    const input = document.getElementById('pinInput');
    if (input) input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  });
}
async function savePredictionsForWeek(playerId, week, predictions) {
  const ok = await ensurePinVerified(playerId);
  if (!ok) return;
  const res = await fetch('/predictions/upsert', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ player_id: playerId, week, predictions })
  });
  if (res.ok) {
    alert('Predictions saved Ã¢Å"â€¦');
  } else if (res.status === 401) {
    document.cookie = "pred_edit_token=; Max-Age=0; path=/";
    const retried = await ensurePinVerified(playerId);
    if (retried) return savePredictionsForWeek(playerId, week, predictions);
    alert('Save cancelled.');
  } else {
    alert('Save failed: ' + await res.text());
  }
}
