# MatchM8 — Runbook

## Run
```bash
npm install
npm run dev      # server (http://localhost:3000)
npm run worker   # email worker (DRY_RUN writes JSON under /outbox/sent)
# optional:
npm run cron     # reminders (uses ACTIVE_WEEK + CRON_SCHEDULE if set)
.env keys
ini
Copy
Edit
PORT=3000
SEASON=2025
ACTIVE_WEEK=1
ADMIN_TOKEN=...
CORS_ORIGIN=http://localhost:3000

MAIL_FROM="MatchM8 <no-reply@matchm8.local>"
MAIL_DRY_RUN=true
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

PIN_MAX_ATTEMPTS=5
PIN_LOCK_MS=900000
UIs
Player: /ui/summary.html?week=1

Admin: /ui/admin.html?week=1 (paste token → Use Token once; stored locally)

Login: /ui/login.html

Health: /api/health, Route list: /__routes

Admin API
POST /api/admin/fixtures/import?week=1 (JSON {fixtures:[...]} or CSV id,home,away,kickoff_iso)

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

With MAIL_DRY_RUN=true, preview JSONs go to /outbox/sent/.

yaml
Copy
Edit

---

# 5) (Optional) Tidy old files — no code edits
You can delete legacy files if you’ve fully moved over:
- `data/scores.csv`
- `data/fixtures.json`
- `data/fixtures_by_week.json`

---

## Quick finish checklist (1 min)
1) `npm run dev` (server), `npm run worker` (emails), `npm run cron` (optional).  
2) Admin → **Use Token** (only once per browser) → **Load Preview**.  
3) **Quick Seed** → **Save Results** → **Compute Scores** (CSV path shows).  
4) Summary → make all picks → **Save** → receipt sent once (DRY-RUN shows a JSON in `/outbox/sent/`).

When you’re happy, commit:

```bash
git add -A
git restore --staged .env 2>NUL || true
git commit -m "Finalize: env + CORS tighten + README; admin OK; receipts on completion"
git push