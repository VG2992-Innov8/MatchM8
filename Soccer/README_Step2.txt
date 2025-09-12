MatchM8 Step 2 bundle — Fixtures & Predictions
================================================

Adds:
- Backend routes:
  • routes/fixtures.js
      - GET /fixtures/_version
      - GET /fixtures/week/:week
  • routes/predictions.js
      - GET /predictions/_version
      - GET /predictions/:week/:player_id
      - POST /predictions/save

- Data files:
  • data/fixtures.json      (seeded week 1: 10 matches)
  • data/predictions.json

- Frontend:
  • public/Part_B_Predictions.html
  • public/js/predictions_flow.js

Install:
1) Upload ZIP and unzip:
   unzip -o matchm8_step2_bundle.zip -d .

2) Ensure server mounts routers:
   import fixturesRouter from './routes/fixtures.js';
   import predictionsRouter from './routes/predictions.js';
   app.use('/fixtures', fixturesRouter);
   app.use('/predictions', predictionsRouter);

3) Restart:
   pkill -f node
   npm start

4) Test:
   fetch('/fixtures/week/1').then(r=>r.json()).then(console.log);
   fetch('/predictions/1/1').then(r=>r.json()).then(console.log);

Open Part_B_Predictions.html to use.
