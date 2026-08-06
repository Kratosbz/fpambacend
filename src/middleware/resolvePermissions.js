'use strict';

const ROLE_DEFAULTS = {
  'System Admin': {
    canCreateAssets: true,  canEditAssets: true,  canDeleteAssets: true,
    canCreate: true,        canEdit: true,         canDelete: true,
    canExport: true,        canViewAll: true,
    canManageUsers: true,   canViewAudit: true,    canManageSettings: true,
    canApproveAssets: true,
    canEditInventory: true,
    canSubmitFormRequests: false, canReviewFormRequests: true,
  },
  'Supervisor': {
    canCreateAssets: true,  canEditAssets: true,  canDeleteAssets: true,
    canCreate: true,        canEdit: true,         canDelete: true,
    canExport: true,        canViewAll: true,
    canManageUsers: false,  canViewAudit: true,    canManageSettings: false,
    canApproveAssets: true,
    canEditInventory: true,
    canSubmitFormRequests: false, canReviewFormRequests: true,
  },
  'Sub-Head': {
    canCreateAssets: true,  canEditAssets: false, canDeleteAssets: false,
    canCreate: true,        canEdit: false,        canDelete: false,
    canExport: false,       canViewAll: true,
    canManageUsers: false,  canViewAudit: false,   canManageSettings: false,
    canApproveAssets: true,
    canEditInventory: true,                    // they review captures, inventory entry fits
    canSubmitFormRequests: false, canReviewFormRequests: true,
  },
  'GIS Analyst': {
    canCreateAssets: false, canEditAssets: false, canDeleteAssets: false,
    canCreate: false,       canEdit: false,        canDelete: false,
    canExport: true,        canViewAll: true,
    canManageUsers: false,  canViewAudit: true,    canManageSettings: false,
    canApproveAssets: false,
    canEditInventory: false,                   // view/export only
    canSubmitFormRequests: false, canReviewFormRequests: false,
  },
  'Field Agent': {
    canCreateAssets: true,  canEditAssets: false, canDeleteAssets: false,
    canCreate: false,       canEdit: false,        canDelete: false,
    canExport: false,       canViewAll: false,
    canManageUsers: false,  canViewAudit: false,   canManageSettings: false,
    canApproveAssets: false,
    canEditInventory: true,                    // this is the point of that change
    canSubmitFormRequests: false, canReviewFormRequests: false,
  },
  // External role, scoped to exactly one MDA (see User.js's `mda` field and
  // form_requests_routes.js's scopeQuery()). Intentionally has NO asset,
  // inventory, user-management, or review permissions — the only thing this
  // role can do anywhere in the platform is submit/view its own MDA's form
  // requests. Must be listed explicitly: without this block, the fallback
  // `ROLE_DEFAULTS[role] || ROLE_DEFAULTS['Field Agent']` below would have
  // granted an MDA Agent Field Agent's canCreateAssets:true, which is wrong.
  'MDA Agent': {
    canCreateAssets: false, canEditAssets: false, canDeleteAssets: false,
    canCreate: false,       canEdit: false,        canDelete: false,
    canExport: false,       canViewAll: false,
    canManageUsers: false,  canViewAudit: false,   canManageSettings: false,
    canApproveAssets: false,
    canEditInventory: false,
    canSubmitFormRequests: true, canReviewFormRequests: false,
  },
};
function resolvePermissions(req, res, next) {
  const user = req.user;
  if (!user) return next();

  const role = user.role || user.userRole || user.roleName || user.type || 'Field Agent';
  req.user.role = role;

  const defaults  = ROLE_DEFAULTS[role] || ROLE_DEFAULTS['Field Agent'];
  const overrides = user.permissions || {};

  req.permissions = { ...defaults, ...overrides };
  next();
}

function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.permissions) {
      return res.status(403).json({ error: 'Permissions not resolved — check middleware order' });
    }
    if (req.permissions[perm] === true) return next();
    return res.status(403).json({
      error:        `Permission denied: ${perm} required`,
      yourRole:     req.user?.role,
      requiredPerm: perm,
    });
  };
}

module.exports = { resolvePermissions, requirePerm };