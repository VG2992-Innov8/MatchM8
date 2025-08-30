// public/js/admin.js

document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('saveResults');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    const params = new URLSearchParams(window.location.search);
    const week = params.get('week') || '';
    const token = localStorage.getItem('admin_token') || '';

    const results = {};
    document.querySelectorAll('input[data-team]').forEach((input) => {
      const team = input.dataset.team;
      const score = parseInt(input.value, 10);
      if (!isNaN(score)) results[team] = score;
    });

    if (!token) {
      alert('Admin token not set. Open the Admin page and click "Use Token" first.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/save-results?week=${encodeURIComponent(week)}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify({ results }),
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
