// routes/admin-license-dev.js
// DEV-ONLY license bypass toggles. Requires x-admin-token AND env ALLOW_DEV_LICENSE_ROUTE=true.
// Safe for prod: if env var is not true, all endpoints return 403.

const express = require('express');
const router = express.Router();

router.use(express.json({ limit: '64kb' }));

// quick guard
const DEV_ROUTE_ENABLED = String(process.env.ALLOW_DEV_LICENSE_ROUTE || '').toLowerCase() === 'true';

// helpers
function guard(req, res, next) {
  if (!DEV_ROUTE_ENABLED) {
    return res.status(403).json({ ok: false, error: 'dev_route_disabled' });
  }
  next();
}

// GET /api/admin/license/dev-test/status
router.get('/status', guard, (_req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  const enabled = !!global.__MM8_DEV_LICENSE_BYPASS;
  res.json({ ok: true, devRoute: true, bypassEnabled: enabled });
});

// POST /api/admin/license/dev-test/enable
router.post('/enable', guard, (_req, res) => {
  global.__MM8_DEV_LICENSE_BYPASS = true;
  res.json({ ok: true, bypassEnabled: true });
});

// POST /api/admin/license/dev-test/disable
router.post('/disable', guard, (_req, res) => {
  global.__MM8_DEV_LICENSE_BYPASS = false;
  res.json({ ok: true, bypassEnabled: false });
});

module.exports = router;
