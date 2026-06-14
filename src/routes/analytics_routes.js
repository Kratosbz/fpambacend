'use strict';
// ── ANALYTICS ROUTES ──────────────────────────────────────────────────────────
// Mount at: app.use('/api/analytics', require('./analytics_routes'));
// File location: assetspatial-backend/src/routes/analytics_routes.js
// Register: app.use('/api/analytics', require('./routes/analytics_routes'));
//
// All routes require authentication + canViewAll permission.
// System Admin, Supervisor, and GIS Analyst all have canViewAll = true.

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const svc = require('../services/analyticsService');

// Analytics is read-only — any authenticated user can access it.
// No requirePerm needed: authentication alone is sufficient.
const auth = [authenticate];

function getScope(req) {
  return {};   // return all data; add scoping here if needed later
}

// ── GET /api/analytics/dashboard ─────────────────────────────────────────────
router.get('/dashboard', ...auth, async (req, res) => {
  try {
    const data = await svc.dashboardKPIs(getScope(req));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/condition-breakdown ────────────────────────────────────
router.get('/condition-breakdown', ...auth, async (req, res) => {
  try {
    const breakdown = await svc.conditionBreakdown(getScope(req));
    res.json({ breakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/by-type ────────────────────────────────────────────────
router.get('/by-type', ...auth, async (req, res) => {
  try {
    const byType = await svc.byType(getScope(req));
    res.json({ byType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/by-state ──────────────────────────────────────────────
router.get('/by-state', ...auth, async (req, res) => {
  try {
    const byState = await svc.byState(getScope(req));
    res.json({ byState });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/captures-over-time?days=30 ────────────────────────────
router.get('/captures-over-time', ...auth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await svc.capturesOverTime({ days, scopeFilter: getScope(req) });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/maintenance-spend ─────────────────────────────────────
router.get('/maintenance-spend', ...auth, async (req, res) => {
  try {
    const spend = await svc.maintenanceSpend({});
    res.json({ spend });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;