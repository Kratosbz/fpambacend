'use strict';
const router   = require('express').Router();
const Settings = require('../models/Settings');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditMiddleware');

// GET /api/settings
router.get('/', authenticate, async (req, res, next) => {
  try {
    let settings = await Settings.findOne({ _singleton: 'global' }).lean();
    if (!settings) settings = await Settings.create({});
    res.json({ settings });
  } catch (err) { next(err); }
});

// PUT /api/settings
router.put('/',
  authenticate, requireRole('System Admin'),
  auditLog('SETTINGS_CHANGED', 'System'),
  async (req, res, next) => {
    try {
      const settings = await Settings.findOneAndUpdate(
        { _singleton: 'global' },
        { $set: { ...req.body, updatedBy: req.user._id } },
        { new: true, upsert: true }
      ).lean();
      res.json({ settings });
    } catch (err) { next(err); }
  }
);

module.exports = router;
