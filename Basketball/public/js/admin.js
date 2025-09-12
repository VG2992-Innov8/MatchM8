// public/js/admin.js
document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('btnSaveResults');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    const params = new URLSearchParams(window.location.search);
    const week = params.get('week') || '';
    const token = localStorage.getItem('admin_token') || '';

    const results = {};
    document.querySelectorAll('input[data-id]').forEach((input) => {
      const id = input.getAttribute('data-id');
      const side = input.getAttribute('data-side');
      const val = input.value === '' ? null : Number(input.value);
      if (!results[id]) results[id] = { homeGoals: null, awayGoals: null };
      if (side === 'home') results[id].homeGoals = val;
      if (side === 'away') results[id].awayGoals = val;
    });

    if (!token) {
      alert('Admin token not set. Open the Admin page and click "Use Token" first.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/results`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify({ week: Number(week) || 1, results }),
      });

      const data = await res.json();
      if (!res.ok || (data && data.ok === false)) {
        throw new Error((data && data.error) || 'Failed to save results.');
      }

      alert('Results saved successfully!');
    } catch (err) {
      console.error('Error saving results:', err);
      alert('Failed to save results.');
    }
  });
});
