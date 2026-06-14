'use strict';
const router     = require('express').Router();
const crypto     = require('crypto');
const User       = require('../models/User');
const RoleConfig = require('../models/RoleConfig');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditMiddleware');
const { validateBody, schemas } = require('../middleware/validate');

const adminOnly = [authenticate, requireRole('System Admin')];

// ─────────────────────────────────────────────────────────────────────────────
// User management
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/users
router.get('/', ...adminOnly, async (req, res, next) => {
  try {
    const { role, state, active, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (role)               filter.role     = role;
    if (state)              filter.states   = state;
    if (active !== undefined) filter.isActive = active === 'true';

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(filter).skip(+skip).limit(+limit).sort({ createdAt: -1 }).select('-password').lean(),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// POST /api/users
router.post('/',
  ...adminOnly,
  validateBody(schemas.createUser),
  auditLog('USER_CREATED', 'User'),
  async (req, res, next) => {
    try {
      const user = await User.create({ ...req.body, createdBy: req.user._id });
      res.locals.auditEntityId = user.userId;
      res.locals.auditDetail   = `${user.name} (${user.role}) created`;
      res.status(201).json({ user: user.toSafeObject() });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'Email already in use' });
      next(err);
    }
  }
);

// GET /api/users/:id
router.get('/:id', ...adminOnly, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Attach effective permissions
    let effectivePermissions = { all: true };
    if (user.role !== 'System Admin') {
      const roleConfig = await RoleConfig.findOne({ role: user.role }).lean();
      effectivePermissions = { ...(roleConfig?.defaults || {}), ...(user.permissions || {}) };
    }

    res.json({ user, effectivePermissions });
  } catch (err) { next(err); }
});

// PUT /api/users/:id
router.put('/:id',
  ...adminOnly,
  validateBody(schemas.updateUser),
  auditLog('USER_UPDATED', 'User'),
  async (req, res, next) => {
    try {
      // Prevent System Admin from downgrading themselves
      if (req.params.id === req.user._id.toString() && req.body.role && req.body.role !== 'System Admin') {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }
      const user = await User.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).select('-password').lean();
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.locals.auditEntityId = user.userId;
      res.locals.auditDetail   = `${user.name} updated`;
      res.json({ user });
    } catch (err) { next(err); }
  }
);

// PUT /api/users/:id/permissions
router.put('/:id/permissions',
  ...adminOnly,
  validateBody(schemas.permissions),
  auditLog('USER_UPDATED', 'User'),
  async (req, res, next) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: { permissions: req.body } },
        { new: true }
      ).select('-password').lean();
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.locals.auditDetail = `Permissions updated for ${user.name}`;
      res.json({ user });
    } catch (err) { next(err); }
  }
);

// DELETE /api/users/:id  — soft delete
router.delete('/:id',
  ...adminOnly,
  auditLog('USER_REMOVED', 'User'),
  async (req, res, next) => {
    try {
      if (req.params.id === req.user._id.toString()) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
      }
      const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }).lean();
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.locals.auditEntityId = user.userId;
      res.locals.auditDetail   = `${user.name} deactivated`;
      res.json({ message: 'User deactivated' });
    } catch (err) { next(err); }
  }
);

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', ...adminOnly, async (req, res, next) => {
  try {
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.password = tempPassword;
    await user.save();  // triggers bcrypt pre-save hook
    res.json({ tempPassword, message: 'Password reset. Share securely with the user.' });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Role configuration
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/role-config
router.get('/role-config', ...adminOnly, async (req, res, next) => {
  try {
    const configs = await RoleConfig.find().lean();
    res.json({ configs });
  } catch (err) { next(err); }
});

// PUT /api/role-config/:role
router.put('/role-config/:role',
  ...adminOnly,
  auditLog('ROLE_CONFIG_CHANGED', 'RoleConfig'),
  async (req, res, next) => {
    try {
      const { role } = req.params;
      if (role === 'System Admin') {
        return res.status(400).json({ error: 'System Admin permissions cannot be changed' });
      }
      const config = await RoleConfig.findOneAndUpdate(
        { role },
        { $set: { defaults: req.body, updatedBy: req.user._id } },
        { new: true, upsert: true }
      ).lean();
      res.locals.auditDetail = `${role} defaults updated`;
      res.json({ config });
    } catch (err) { next(err); }
  }
);

// POST /api/role-config/reset
router.post('/role-config/reset',
  ...adminOnly,
  auditLog('ROLE_CONFIG_CHANGED', 'RoleConfig'),
  async (req, res, next) => {
    try {
      const DEFAULTS = RoleConfig.FACTORY_DEFAULTS;
      await Promise.all(
        Object.entries(DEFAULTS).map(([role, defaults]) =>
          RoleConfig.findOneAndUpdate(
            { role },
            { $set: { defaults, updatedBy: req.user._id } },
            { upsert: true, new: true }
          )
        )
      );
      res.locals.auditDetail = 'All role configs reset to factory defaults';
      res.json({ message: 'Role configs reset to factory defaults' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
