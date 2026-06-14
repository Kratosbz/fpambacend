'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema, Types } = mongoose;

const permissionsSchema = new Schema({
  canCreateAssets:   { type: Boolean },
  canEditAssets:     { type: Boolean },
  canDeleteAssets:   { type: Boolean },
  canApproveAssets:  { type: Boolean },
  canExportData:     { type: Boolean },
  canRunOCR:         { type: Boolean },
  canManageUsers:    { type: Boolean },
  canViewAnalytics:  { type: Boolean },
  canViewAuditLog:   { type: Boolean },
  canChangeSettings: { type: Boolean },
  canBulkDelete:     { type: Boolean },
  canBulkExport:     { type: Boolean },
  maxPhotosPerAsset: { type: Number },
  maxAssetsPerDay:   { type: Number },
}, { _id: false });

const userSchema = new Schema({
  userId: { type: String, unique: true },  // "USR-4821" — auto-generated
  name:   { type: String, required: true, trim: true },
  email:  { type: String, required: true, unique: true, lowercase: true, trim: true },
  role: {
    type: String,
    required: true,
    enum: ['Field Agent', 'Supervisor', 'GIS Analyst', 'System Admin'],
  },
  password: { type: String, required: true, select: false },

  color: { type: String, default: '#3B82F6' },  // avatar hex

  // Geographic scope
  zone:   String,
  states: [String],
  lgas:   [String],

  // Per-user permission overrides (merged with RoleConfig defaults)
  permissions: { type: permissionsSchema, default: {} },

  stats: {
    assetsCreated: { type: Number, default: 0 },
    lastActiveAt:  Date,
    totalActions:  { type: Number, default: 0 },
  },

  isActive:  { type: Boolean, default: true },
  createdBy: { type: Types.ObjectId, ref: 'User' },

  // One-time password reset token
  resetToken:        { type: String, select: false },
  resetTokenExpires: { type: Date,   select: false },
}, {
  timestamps: true,
});

// ── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// ── Pre-save: hash password ──────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Auto-generate userId ─────────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (this.userId) return next();
  const count = await mongoose.model('User').countDocuments();
  this.userId = `USR-${(count + 1000).toString().padStart(4, '0')}`;
  next();
});

// ── Instance method: compare password ────────────────────────────────────────
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── Instance method: safe JSON (no password) ─────────────────────────────────
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetToken;
  delete obj.resetTokenExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
