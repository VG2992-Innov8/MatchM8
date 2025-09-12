MatchM8 — PIN Wiring + CSV Exports (Ready-to-Run)
=================================================
Built: 2025-08-12T03:05:46.732169Z

What you get
------------
- Secure PIN flow (verify → HttpOnly cookie → /predictions/upsert)
- Predictions & Leaderboard CSV export endpoints
- Admin tab hide/show check via /audit (x-admin-token)
- Minimal demo pages (index.html, admin.html) to test flows

How to use on Replit (or any Node host)
---------------------------------------
1) Upload this ZIP and extract.
2) In the shell: `npm install` then `npm start`.
3) Set environment variables:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - PRED_TOKEN_SECRET  (e.g. a long random string)
   - ADMIN_TOKEN        (used as x-admin-token header for admin-only routes)
4) Open the webview: / to see the demo predictions page, /admin.html for exports.

Integrate with your existing UI
-------------------------------
- Keep `server.js` (or merge routes into your own).
- In your real predictions page, include `public/js/app.js` and call:
    savePredictionsForWeek(playerId, week, predictionsArray)
  This will auto-prompt for PIN and POST to /predictions/upsert.
- To reveal Admin Tools link in your app, call /audit with header:
    x-admin-token: <your ADMIN_TOKEN>

Notes
-----
- Leaderboard export scoring: exact = 5, correct result = 2, else 0.
- /predictions/upsert enforces kickoff lock per fixture.
- All writes are logged to audit_log if your table exists. Errors fail open (i.e., won't crash saves).

Files
-----
- server.js                 → Express app with routes
- public/index.html         → Demo predictions page + PIN modal
- public/js/app.js          → PIN flow + save wiring
- public/admin.html         → CSV export UI (requires x-admin-token)
- package.json              → start script is `node server.js`
