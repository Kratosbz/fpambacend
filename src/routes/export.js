'use strict';
const router = require('express').Router();
const { authenticate }       = require('../middleware/auth');
const { resolvePermissions, requirePerm } = require('../middleware/resolvePermissions');
const { scopeFilter }        = require('../middleware/scopeFilter');
const { auditLog }           = require('../middleware/auditMiddleware');
const exportSvc = require('../services/exportService');

const auth = [authenticate, resolvePermissions, scopeFilter, requirePerm('canExportData')];

// GET /api/assets/export?format=csv|json|geojson|xlsx
router.get('/', ...auth, auditLog('EXPORT', 'System'), async (req, res, next) => {
  try {
    const fmt = (req.query.format || 'json').toLowerCase();
    switch (fmt) {
      case 'csv':     return exportSvc.streamCSV(res, req.scopeFilter);
      case 'geojson': return exportSvc.streamGeoJSON(res, req.scopeFilter);
      case 'xlsx':    return exportSvc.streamXLSX(res, req.scopeFilter);
      case 'json':
      default: {
        const Asset = require('../models/Asset');
        res.set('Content-Type', 'application/json');
        res.set('Content-Disposition', 'attachment; filename="assets_export.json"');
        const assets = await Asset.find(req.scopeFilter).lean();
        return res.json({ assets });
      }
    }
  } catch (err) { next(err); }
});

// GET /api/assets/export/bulk?ids=AST-1,AST-2
router.get('/bulk', ...auth, requirePerm('canBulkExport'), auditLog('BULK_EXPORT', 'System'),
  async (req, res, next) => {
    try {
      const ids = (req.query.ids || '').split(',').filter(Boolean);
      if (!ids.length) return res.status(400).json({ error: 'ids query parameter required' });
      const fmt = (req.query.format || 'json').toLowerCase();
      const extraFilter = { assetId: { $in: ids } };
      switch (fmt) {
        case 'csv':     return exportSvc.streamCSV(res, {}, extraFilter);
        case 'geojson': return exportSvc.streamGeoJSON(res, {}, extraFilter);
        case 'xlsx':    return exportSvc.streamXLSX(res, {}, extraFilter);
        default: {
          const Asset = require('../models/Asset');
          const assets = await Asset.find({ assetId: { $in: ids } }).lean();
          return res.json({ assets });
        }
      }
    } catch (err) { next(err); }
  }
);

module.exports = router;
