'use strict';
const router = require('express').Router({ mergeParams: true });
const { Readable } = require('stream');
const { Types }    = require('mongoose');
const Asset        = require('../models/Asset');
const { getBuckets } = require('../config/gridfs');
const { authenticate }       = require('../middleware/auth');
const { resolvePermissions, requirePerm } = require('../middleware/resolvePermissions');
const { scopeFilter }        = require('../middleware/scopeFilter');
const { auditLog }           = require('../middleware/auditMiddleware');
const { documentUploader }   = require('../middleware/upload');

const auth = [authenticate, resolvePermissions, scopeFilter];

function assetQuery(id) {
  return id.startsWith('AST-') ? { assetId: id } : { _id: id };
}

// POST /api/assets/:assetId/documents
router.post('/',
  ...auth,
  requirePerm('canCreateAssets'),
  documentUploader.single('file'),
  auditLog('DOCUMENT_UPLOADED', 'Asset'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const asset = await Asset.findOne(assetQuery(req.params.assetId));
      if (!asset) return res.status(404).json({ error: 'Asset not found' });

      const bucket = getBuckets().documents;
      const fileId = new Types.ObjectId();
      const fname  = `${asset.assetId}_doc_${Date.now()}_${req.file.originalname}`;

      await new Promise((resolve, reject) => {
        const stream = bucket.openUploadStreamWithId(fileId, fname, {
          metadata: {
            assetId:      asset.assetId,
            fileType:     'document',
            uploadedBy:   req.user._id.toString(),
            mimeType:     req.file.mimetype,
            originalName: req.file.originalname,
          },
        });
        Readable.from(req.file.buffer).pipe(stream)
          .on('finish', resolve)
          .on('error', reject);
      });

      const docRef = {
        fileId,
        filename:   fname,
        mimeType:   req.file.mimetype,
        sizeBytes:  req.file.size,
        uploadedAt: new Date(),
      };
      asset.documents.push(docRef);
      await asset.save();

      res.locals.auditEntityId = asset.assetId;
      res.locals.auditDetail   = `Document ${req.file.originalname} uploaded`;
      res.status(201).json({ document: docRef });
    } catch (err) { next(err); }
  }
);

// GET /api/assets/:assetId/documents
router.get('/', ...auth, async (req, res, next) => {
  try {
    const asset = await Asset.findOne(assetQuery(req.params.assetId)).select('documents').lean();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ documents: asset.documents });
  } catch (err) { next(err); }
});

// GET /api/assets/:assetId/documents/:fileId — stream download
router.get('/:fileId', ...auth, async (req, res, next) => {
  try {
    const bucket  = getBuckets().documents;
    const oid     = new Types.ObjectId(req.params.fileId);
    const files   = await bucket.find({ _id: oid }).toArray();
    if (!files.length) return res.status(404).json({ error: 'Document not found' });

    const f = files[0];
    res.set('Content-Type', f.metadata?.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${f.metadata?.originalName || f.filename}"`);
    bucket.openDownloadStream(oid).pipe(res);
  } catch (err) { next(err); }
});

// DELETE /api/assets/:assetId/documents/:fileId
router.delete('/:fileId',
  ...auth,
  requirePerm('canEditAssets'),
  auditLog('DOCUMENT_DELETED', 'Asset'),
  async (req, res, next) => {
    try {
      const bucket = getBuckets().documents;
      await bucket.delete(new Types.ObjectId(req.params.fileId));
      await Asset.findOneAndUpdate(
        assetQuery(req.params.assetId),
        { $pull: { documents: { fileId: new Types.ObjectId(req.params.fileId) } } }
      );
      res.json({ message: 'Document deleted' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
