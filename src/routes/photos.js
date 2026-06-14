'use strict';
const router = require('express').Router({ mergeParams: true });
const Asset  = require('../models/Asset');
const { authenticate }     = require('../middleware/auth');
const { resolvePermissions, requirePerm } = require('../middleware/resolvePermissions');
const { scopeFilter }      = require('../middleware/scopeFilter');
const { auditLog }         = require('../middleware/auditMiddleware');
const { photoUploader }    = require('../middleware/upload');
const photoSvc = require('../services/photoService');

const auth = [authenticate, resolvePermissions, scopeFilter];

// POST /api/assets/:assetId/photos
router.post('/', ...auth, requirePerm('canCreateAssets'),
  photoUploader.single('photo'),
  auditLog('PHOTO_ATTACHED', 'Asset'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

      const query = req.params.assetId.startsWith('AST-')
        ? { assetId: req.params.assetId } : { _id: req.params.assetId };
      const asset = await Asset.findOne(query);
      if (!asset) return res.status(404).json({ error: 'Asset not found' });

      // Enforce per-user photo limit
      const maxPhotos = req.effectivePermissions?.maxPhotosPerAsset ?? 50;
      if (asset.photos.length >= maxPhotos) {
        return res.status(400).json({ error: `Photo limit (${maxPhotos}) reached for this asset` });
      }

      const result = await photoSvc.storePhoto(req.file, asset.assetId, req.user._id.toString());

      // Auto-populate GPS if not already set
      if (result.gpsCoords && asset.location?.coordinates?.every((c) => c === 0)) {
        asset.location = { type: 'Point', coordinates: result.gpsCoords };
      }

      asset.photos.push({
        fileId:    result.fileId,
        filename:  result.filename,
        sizeBytes: result.sizeBytes,
        capturedAt: new Date(),
        mimeType:  'image/jpeg',
      });
      await asset.save();

      res.locals.auditEntityId = asset.assetId;
      res.status(201).json({ photo: asset.photos[asset.photos.length - 1] });
    } catch (err) { next(err); }
  }
);

// GET /api/assets/:assetId/photos
router.get('/', ...auth, async (req, res, next) => {
  try {
    const query = req.params.assetId.startsWith('AST-')
      ? { assetId: req.params.assetId } : { _id: req.params.assetId };
    const asset = await Asset.findOne(query).select('photos').lean();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ photos: asset.photos });
  } catch (err) { next(err); }
});

// GET /api/assets/:assetId/photos/:fileId  — stream binary
router.get('/:fileId', ...auth, async (req, res, next) => {
  try {
    const found = await photoSvc.streamPhoto(req.params.fileId, res);
    if (!found) res.status(404).json({ error: 'Photo not found' });
  } catch (err) { next(err); }
});

// DELETE /api/assets/:assetId/photos/:fileId
router.delete('/:fileId', ...auth, requirePerm('canEditAssets'),
  auditLog('PHOTO_DELETED', 'Asset'),
  async (req, res, next) => {
    try {
      await photoSvc.deletePhoto(req.params.fileId);
      const query = req.params.assetId.startsWith('AST-')
        ? { assetId: req.params.assetId } : { _id: req.params.assetId };
      await Asset.findOneAndUpdate(query, {
        $pull: { photos: { fileId: req.params.fileId } },
      });
      res.json({ message: 'Photo deleted' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
