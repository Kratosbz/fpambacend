'use strict';
const router   = require('express').Router();
const AuditLog = require('../models/AuditLog');
const { authenticate }       = require('../middleware/auth');
const { resolvePermissions, requirePerm } = require('../middleware/resolvePermissions');

// GET /api/audit
router.get('/',
  authenticate, resolvePermissions, requirePerm('canViewAuditLog'),
  async (req, res, next) => {
    try {
      const { action, entityId, entityType, from, to, page = 1, limit = 50 } = req.query;
      const filter = {};
      if (action)     filter.action     = action;
      if (entityId)   filter.entityId   = entityId;
      if (entityType) filter.entityType = entityType;
      if (from || to) {
        filter.ts = {};
        if (from) filter.ts.$gte = new Date(from);
        if (to)   filter.ts.$lte = new Date(to);
      }

      const skip = (page - 1) * limit;
      const [logs, total] = await Promise.all([
        AuditLog.find(filter)
          .skip(+skip).limit(+limit)
          .sort({ ts: -1 })
          .populate('performedBy', 'name email role')
          .lean(),
        AuditLog.countDocuments(filter),
      ]);

      res.json({ logs, total, page: +page, pages: Math.ceil(total / limit) });
    } catch (err) { next(err); }
  }
);

module.exports = router;
