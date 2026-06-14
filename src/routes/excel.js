'use strict';
const router = require('express').Router({ mergeParams: true });
const Asset  = require('../models/Asset');
const { authenticate }     = require('../middleware/auth');
const { resolvePermissions } = require('../middleware/resolvePermissions');
const { scopeFilter }      = require('../middleware/scopeFilter');
const { auditLog }         = require('../middleware/auditMiddleware');
const { excelUploader }    = require('../middleware/upload');
const excelSvc = require('../services/excelService');

const auth = [authenticate, resolvePermissions, scopeFilter];

// POST /api/assets/:assetId/excel
router.post('/', ...auth, excelUploader.single('file'),
  auditLog('EXCEL_ATTACHED', 'Asset'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const query = req.params.assetId.startsWith('AST-')
        ? { assetId: req.params.assetId } : { _id: req.params.assetId };
      const asset = await Asset.findOne(query);
      if (!asset) return res.status(404).json({ error: 'Asset not found' });

      const result = await excelSvc.storeExcel(req.file, asset.assetId, req.user._id.toString());
      asset.xlDatasets.push(result);
      await asset.save();
      res.locals.auditEntityId = asset.assetId;
      res.status(201).json({ dataset: asset.xlDatasets[asset.xlDatasets.length - 1] });
    } catch (err) { next(err); }
  }
);

// GET /api/assets/:assetId/excel
router.get('/', ...auth, async (req, res, next) => {
  try {
    const query = req.params.assetId.startsWith('AST-')
      ? { assetId: req.params.assetId } : { _id: req.params.assetId };
    const asset = await Asset.findOne(query).select('xlDatasets').lean();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ datasets: asset.xlDatasets });
  } catch (err) { next(err); }
});

// GET /api/assets/:assetId/excel/:fileId?preview=true
router.get('/:fileId', ...auth, async (req, res, next) => {
  try {
    if (req.query.preview) {
      const rows = await excelSvc.previewExcel(req.params.fileId, 100);
      return res.json({ rows });
    }
    const found = await excelSvc.streamExcel(req.params.fileId, res);
    if (!found) res.status(404).json({ error: 'Excel file not found' });
  } catch (err) { next(err); }
});

// DELETE /api/assets/:assetId/excel/:fileId
router.delete('/:fileId', ...auth, auditLog('EXCEL_DETACHED', 'Asset'), async (req, res, next) => {
  try {
    await excelSvc.deleteExcel(req.params.fileId);
    const query = req.params.assetId.startsWith('AST-')
      ? { assetId: req.params.assetId } : { _id: req.params.assetId };
    await Asset.findOneAndUpdate(query, {
      $pull: { xlDatasets: { fileId: req.params.fileId } },
    });
    res.json({ message: 'Excel dataset removed' });
  } catch (err) { next(err); }
});

module.exports = router;
