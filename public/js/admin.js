// public/js/admin.js

document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("saveResults");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", async () => {
    const week = new URLSearchParams(window.location.search).get("week");
    const results = {};

    // Collect scores from inputs
    document.querySelectorAll("input[data-team]").forEach((input) => {
      const team = input.dataset.team;
      const score = parseInt(input.value, 10);
      if (!isNaN(score)) {
        results[team] = score;
      }
    });

    try {
      const token = localStorage.getItem("admin_token");

      const response = await fetch(`/api/admin/save-results?week=${week}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ results }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save results.");
      }

      alert("Ã¢Å"â€¦ Results saved successfully!");
    } catch (err) {
      console.error("Ã¢ÂÅ' Error saving results:", err);
      alert("Ã¢ÂÅ' Failed to save results.");
    }
  });
});
