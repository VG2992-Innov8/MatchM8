MatchM8 Step 1 bundle
======================

Files:
- public/index.html              → simple login form (player id/name, week, pin)
- public/js/pin_flow.js          → verifies with /auth/pin/verify and redirects
- public/Part_B_Predictions.html → reads session/URL (ready for Step 2)

How to use:
1) Drop the 'public' folder into your project root (replace or merge).
2) Ensure your server serves /public and that /auth/pin/verify is working.
3) Open / (home), enter player (id or name), week, and PIN.
4) On success, you’ll be redirected to Part_B_Predictions.html with session set.
