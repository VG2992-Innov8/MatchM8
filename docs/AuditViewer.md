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
