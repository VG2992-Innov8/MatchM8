// public/predictions.js
document.addEventListener('DOMContentLoaded', async () => {
  const playerSelect = document.getElementById('playerSelect');
  const pinPrompt = document.getElementById('pinPrompt');
  const playerPinInput = document.getElementById('playerPin');
  const verifyPinButton = document.getElementById('verifyPin');
  const predictionsForm = document.getElementById('predictionsForm');
  const matchesContainer = document.getElementById('matchesContainer');
  const savePredictionsButton = document.getElementById('savePredictions');
  const statusMessage = document.getElementById('statusMessage');

  let selectedPlayer = null;

  // Load players (adjust endpoint to whatever you have)
  async function loadPlayers() {
    const response = await fetch('/players'); // change if your endpoint differs
    const players = await response.json();
    playerSelect.innerHTML = '<option value="">-- Select Player --</option>';
    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      playerSelect.appendChild(opt);
    });
  }

  // Load matches (adjust endpoint to whatever you have)
  async function loadMatches() {
    const response = await fetch('/matches'); // change if your endpoint differs
    const matches = await response.json();
    matchesContainer.innerHTML = '';
    matches.forEach(m => {
      const div = document.createElement('div');
      div.className = 'match';
      div.innerHTML = `
        <label>${m.home_team} vs ${m.away_team}</label>
        <input type="number" min="0" placeholder="Home score" id="home-${m.id}">
        <input type="number" min="0" placeholder="Away score" id="away-${m.id}">
      `;
      matchesContainer.appendChild(div);
    });
  }

  // Handle player selection
  playerSelect.addEventListener('change', () => {
    selectedPlayer = playerSelect.value || null;
    statusMessage.textContent = '';
    if (selectedPlayer) {
      pinPrompt.style.display = 'block';
    } else {
      pinPrompt.style.display = 'none';
      predictionsForm.style.display = 'none';
    }
  });

  // Verify PIN (uses the existing /auth/pin/verify that accepts { name, pin })
  verifyPinButton.addEventListener('click', async () => {
    const pin = (playerPinInput.value || '').trim();
    if (!selectedPlayer || !pin) {
      statusMessage.textContent = 'Please select a player and enter a PIN.';
      return;
    }

    const r = await fetch('/auth/pin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: selectedPlayer, pin })
    });

    if (r.ok) {
      pinPrompt.style.display = 'none';
      predictionsForm.style.display = 'block';
      await loadMatches();
      statusMessage.textContent = '';
    } else {
      const msg = await r.text();
      statusMessage.textContent = 'Invalid PIN. ' + (msg || '');
    }
  });

  // Save predictions -> POST /predictions/save
  savePredictionsButton.addEventListener('click', async () => {
    const fields = matchesContainer.querySelectorAll('.match');
    const predictions = [];
    fields.forEach(div => {
      const firstInput = div.querySelector('input[id^="home-"]');
      if (!firstInput) return;
      const id = firstInput.id.split('home-')[1];
      const home = div.querySelector(`#home-${id}`).value;
      const away = div.querySelector(`#away-${id}`).value;
      predictions.push({
        match_id: Number(id),
        home_score: home === '' ? null : Number(home),
        away_score: away === '' ? null : Number(away),
      });
    });

    // Week could come from querystring or a field; adapt as needed
    const week = Number(new URLSearchParams(location.search).get('week')) || 1;

    const r = await fetch('/predictions/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: selectedPlayer, week, predictions })
    });

    if (r.ok) {
      statusMessage.textContent = 'Predictions saved successfully!';
    } else {
      const msg = await r.text();
      statusMessage.textContent = 'Error saving predictions. ' + (msg || '');
    }
  });

  // Initial load
  await loadPlayers();
});
