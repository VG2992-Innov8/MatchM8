# MatchM8 — Runbook

## Run
```bash
npm install
npm run dev      # server (http://localhost:3000)
npm run worker   # email worker
# optional:
npm run cron     # reminders (CRON_SCHEDULE or daily 9am)
.env keys
ini
Copy
Edit
PORT=3000
COOKIE_SECRET=your-random-secret
SEASON=2025
ACTIVE_WEEK=1
ADMIN_TOKEN=changeme   # set to enable admin auth (header: x-admin-token)

# Email
MAIL_FROM="MatchM8 <no-reply@matchm8.local>"
MAIL_DRY_RUN=true      # false with SMTP below
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
Routes & UIs
Player UI: /ui/summary.html?week=1

Admin UI: /ui/admin.html?week=1 (send x-admin-token if ADMIN_TOKEN is set)

Login UI: /ui/login.html

Health: /api/health, Routes list: /__routes

Admin API
POST /api/admin/fixtures/import?week=1 (JSON {fixtures:[...]} or CSV)

POST /api/admin/results?week=1 (JSON {results:{id:{homeGoals,awayGoals}}})

POST /api/admin/scores/compute?week=1 → writes data/season_scores.csv

Scoring
Exact score = 5

Correct result (H/D/A) = 2

Else = 0

Data layout
pgsql
Copy
Edit
data/
  players.json
  fixtures/season-2025/week-1.json
  predictions/week-1.json
  results/week-1.json
  season_totals.json
  season_scores.csv
outbox/ (email worker)
Email receipts
Sent once when a player completes all picks for the week.

DRY_RUN mode logs JSON to outbox/sent/.

yaml
Copy
Edit

---

# 6) Add/append to `.env` (one edit)
Add:
ADMIN_TOKEN=changeme
CRON_SCHEDULE=*/5 * * * * # (optional) every 5 minutes in dev

yaml
Copy
Edit

---

## Final step
1) Paste/replace the files above.
2) Restart:
npm run dev
npm run worker
npm run cron # optional

perl
Copy
Edit
3) Visit:
- `/ui/login.html` → sign in (cookie set) → redirects to `/ui/summary.html?week=1`
- `/ui/admin.html?week=1` → if `ADMIN_TOKEN` set, send header `x-admin-token: changeme` (DevTools → Network → Headers, or use a REST client)

This wraps the remaining “ship it” items with minimal edits. If anything hiccups, tell me which request fails and the response JSON, and I’ll pinpoint it fast.