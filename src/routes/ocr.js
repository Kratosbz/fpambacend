'use strict';
const router = require('express').Router();
const { authenticate }       = require('../middleware/auth');
const { resolvePermissions, requirePerm } = require('../middleware/resolvePermissions');
const { auditLog }           = require('../middleware/auditMiddleware');
const { ocrUploader }        = require('../middleware/upload');
const ocrQueue = require('../queues/ocrQueue');

const auth = [authenticate, resolvePermissions];

// POST /api/ocr/scan  — enqueue image OCR job
router.post('/scan',
  ...auth, requirePerm('canRunOCR'),
  ocrUploader.single('file'),
  auditLog('OCR_SCAN', 'System'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const jobId = await ocrQueue.enqueueOCR(req.file.buffer, req.file.mimetype);
      res.status(202).json({ jobId, message: 'OCR job queued' });
    } catch (err) { next(err); }
  }
);

// GET /api/ocr/jobs/:jobId  — poll status
router.get('/jobs/:jobId', ...auth, async (req, res, next) => {
  try {
    const status = await ocrQueue.getJobStatus(req.params.jobId);
    if (!status) return res.status(404).json({ error: 'Job not found' });
    res.json(status);
  } catch (err) { next(err); }
});

module.exports = router;
