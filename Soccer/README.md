# MatchM8

Season-long soccer tipping app. Organizer sets weekly fixtures, players submit score predictions, admin enters results, and the system auto-scores with a season leaderboard.

## Current Features
- Player login via **Name + PIN** (set/verify)
- Weekly predictions (PIN → Predictions flow)
- Admin enters actual scores
- Scoring: **Exact = 5**, **Correct result = 2**, **Wrong = 0**
- Weekly totals + cumulative **season leaderboard**
- Season rollup stored to `data/season_scores.csv`
- Routes mounted at both `/api/*` and root (e.g. `/api/scores` + `/scores`)
- Week summary: `/summary?week={n}`

## Tech
Node.js + Express  
Deps: `express`, `dotenv`, `cors`, `cookie-parser`, `bcryptjs`, `jsonwebtoken`, `node-fetch`, `@supabase/supabase-js`

## Scripts
```bash
npm run dev   # nodemon: cls && node index.js
npm start     # node index.js
Run locally
npm install
npm run dev
# open http://localhost:3000


Create .env from .env.example (not committed):

PORT=3000
JWT_SECRET=change-me
SUPABASE_URL=
SUPABASE_ANON_KEY=

Useful Endpoints

POST /auth/pin/set (by name or player_id)

POST /auth/pin/verify

/predictions (player UI)

/scores and /api/scores

/summary?week={n}

/api/__routes (sanity check mounts)

Structure
routes/     # express routers
public/     # static assets
ui/         # simple HTML/JS pages
data/       # fixtures, predictions, players, season scores

Roadmap

Email reminders (24h pre-deadline)

Prediction lock at kickoff

Simple admin auth page


---

### (Optional) Normalize line endings
Add a new file **`.gitattributes`** at repo root with:


text=auto
*.js text eol=lf
*.css text eol=lf
*.html text eol=lf


### Sync to your machine
Back in GitHub Desktop: **Fetch origin → Pull** to get the updated README/docs locally.

Shout if you want me to prep a quick `docs/` index or a CONTRIBUTING blurb next.
