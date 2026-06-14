'use strict';

/**
 * Roles that can see all assets regardless of who captured them.
 * Field Agents can VIEW all assets — they're restricted from
 * delete/manage operations by requirePerm(), not by scope.
 */
const GLOBAL_ROLES = ['System Admin', 'Supervisor', 'GIS Analyst', 'Field Agent'];

function scopeFilter(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthenticated' });

  const role = user.role || user.userRole || user.roleName || '';

  if (GLOBAL_ROLES.includes(role)) {
    // All current roles can view all assets.
    // Write permissions (create/edit/delete) are enforced by requirePerm().
    req.scopeFilter = {};
  } else {
    // Unknown / future role — restrict to own assets as a safe default
    req.scopeFilter = {
      $or: [
        { capturedBy: user._id },
        { 'capturedBy._id': user._id },
      ],
    };
  }

  next();
}

module.exports = { scopeFilter };