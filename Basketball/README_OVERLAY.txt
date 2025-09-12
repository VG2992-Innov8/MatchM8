MatchM8 Overlay — PIN + CSV + Unified /audit (Option 2 ready)
=============================================================
Built: 2025-08-12T03:21:37.139885Z

What this is
------------
A *non-destructive* overlay that adds:
  - Player PIN endpoints (/auth/pin/set, /auth/pin/verify)
  - Secure predictions save (PUT /predictions/upsert)
  - CSV exports (/predictions/export.csv, /leaderboard/export.csv)
  - Unified /audit route used for admin visibility checks

It **does not** replace your existing pages. You keep your UI.

How to install
--------------
1) Unzip into your project root (it creates /overlay and /public/js/pin_flow.js).
2) Add these imports at the top of your server file (server.js or app.js):

   import express from 'express';
   import cookieParser from 'cookie-parser';
   import matchm8Overlay from './overlay/matchm8_overlay.js';

   // ensure these middlewares are enabled before installing the overlay
   app.use(express.json());
   app.use(cookieParser());

   // install overlay routes
   matchm8Overlay(app);

3) Ensure env vars are set:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - PRED_TOKEN_SECRET
   - ADMIN_TOKEN

4) (Frontend) Optional: include /public/js/pin_flow.js and call:
   - ensurePinVerified(playerId)
   - savePredictionsForWeek(playerId, week, predictionsArray)
   You can also reuse your own modal; pin_flow.js is just a helper.

Option 2 — Remove legacy audit
-------------------------------
- Delete legacy audit route(s) (see CLEANUP_OPTION2.txt).
- Keep *only* the unified GET /audit route provided by the overlay.
- If your Admin Tools had a second "Audit" section, remove that UI block.

Notes
-----
- Routes are namespaced to existing paths so your client code changes are minimal.
- Exports are admin-guarded via 'x-admin-token' header (uses ADMIN_TOKEN).
- /predictions/upsert enforces kickoff lock and writes to audit_log.
