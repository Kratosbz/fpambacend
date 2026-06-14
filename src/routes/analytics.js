'use strict';
const router = require('express').Router();
const { authenticate }       = require('../middleware/auth');
const { resolvePermissions, requirePerm } = require('../middleware/resolvePermissions');
const { scopeFilter }        = require('../middleware/scopeFilter');
const analyticsSvc = require('../services/analyticsService');

const auth = [authenticate, resolvePermissions, scopeFilter, requirePerm('canViewAnalytics')];

router.get('/dashboard',            ...auth, async (req, res, next) => {
  try { res.json(await analyticsSvc.dashboardKPIs(req.scopeFilter)); } catch (e) { next(e); }
});

router.get('/condition-breakdown',  ...auth, async (req, res, next) => {
  try { res.json(await analyticsSvc.conditionBreakdown(req.scopeFilter)); } catch (e) { next(e); }
});

router.get('/by-type',              ...auth, async (req, res, next) => {
  try { res.json(await analyticsSvc.byType(req.scopeFilter)); } catch (e) { next(e); }
});

router.get('/by-state',             ...auth, async (req, res, next) => {
  try { res.json(await analyticsSvc.byState(req.scopeFilter)); } catch (e) { next(e); }
});

router.get('/captures-over-time',   ...auth, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    res.json(await analyticsSvc.capturesOverTime({ days, scopeFilter: req.scopeFilter }));
  } catch (e) { next(e); }
});

router.get('/maintenance-spend',    ...auth, async (req, res, next) => {
  try {
    res.json(await analyticsSvc.maintenanceSpend({ assetId: req.query.assetId }));
  } catch (e) { next(e); }
});

module.exports = router;
