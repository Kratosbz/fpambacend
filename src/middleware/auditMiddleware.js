'use strict';
const AuditLog = require('../models/AuditLog');

/**
 * Factory — wrap a route with automatic audit logging.
 * Usage: router.post('/assets', auth, auditLog('ASSET_CREATED', 'Asset'), handler)
 *
 * Route handlers set res.locals.auditEntityId and res.locals.auditDetail for enrichment.
 */
function auditLog(action, entityType) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;  // only log successful mutations

      const entityId = res.locals.auditEntityId
        || req.params.id
        || req.params.assetId
        || null;

      AuditLog.create({
        action,
        entityType,
        entityId,
        performedBy: req.user?._id || req.user?.id || null,
        detail:      res.locals.auditDetail || '',
        ipAddress:   req.ip,
        userAgent:   req.get('user-agent'),
        metadata:    res.locals.auditMetadata || undefined,
      }).catch((err) => console.error('[Audit] Failed to write log:', err));
    });
    next();
  };
}

module.exports = { auditLog };
