document.addEventListener('DOMContentLoaded', () => {
  const host = document.getElementById('hero');
  if (!host) return;

  const league = localStorage.getItem('leagueName') || 'English Premier League';

  // prefer explicit data-page; else use <title> (strip suffix like " — MatchM8")
  let page = host.dataset.page || document.title || 'Home';
  page = page.replace(/\s*—.*$/,'').trim();

  host.outerHTML = `
    <section class="hero">
      <div class="bar"><h1>MatchM8 Soccer Predictions</h1></div>
      <div class="bar"><h2 id="leagueName">${league}</h2></div>
      <div class="bar"><h3>${page || 'Home'}</h3></div>
    </section>`;
});

