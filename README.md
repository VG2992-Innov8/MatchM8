# MatchM8 — Phase B + Audit Viewer (Drop‑in Bundle)

This is a **runnable Express server** with the Phase B features:
- Player PINs (set/verify) with hashed storage
- Short‑lived prediction edit token (cookie)
- Audit Log hooks for predictions, fixtures, results
- Player Registration endpoint
- Admin Audit Log viewer UI (React via CDN) + CSV export
- Admin Sidebar + blue card styling

## Quick Start (Replit or local)

1) Upload/extract this ZIP into a Node.js Replit (or clone locally).
2) Create a `.env` from `.env.example` and set values:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_TOKEN` (for Admin requests)
   - `PRED_TOKEN_SECRET` (random long string)
3) In the Replit shell (or local terminal):
   ```bash
   npm install
   npm start
   ```
4) Open the web view: `http://localhost:3000/` (Admin UI link on the page).

## Endpoints
- `POST /auth/pin/set` — set/change PIN
- `POST /auth/pin/verify` — verify PIN and mint session cookie
- `GET  /auth/check` — returns OK if cookie valid
- `PUT  /predictions/upsert` — upsert prediction (requires PIN/cookie)
- `POST /players/register` — public player registration
- `POST /fixtures` (admin) — create fixture
- `PUT  /fixtures/:id` (admin) — update fixture
- `DELETE /fixtures/:id` (admin) — delete fixture
- `POST /fixtures/copy-week` (admin) — copy fixtures from a week to another
- `PUT  /results/upsert` (admin) — upsert result
- `GET  /audit` (admin) — list audit log with filters & pagination
- `GET  /audit/actions` (admin) — distinct actions for filters
- `GET  /audit/export` (admin) — CSV export

> All **admin** endpoints require `x-admin-token: <ADMIN_TOKEN>` header.

## Notes
- The server serves `/public` as static. The Admin UI is at `/admin.html`.
- This bundle assumes your database has the Phase A migration applied:
  - `players.pin_hash`, `players.email`, `players.created_at`
  - `audit_log` table
  - `predictions (player_id, match_id)` unique constraint

