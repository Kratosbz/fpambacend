/**
 * AssetSpatial — MDA (Ministries, Departments & Agencies) Model
 */
const mongoose = require('mongoose');

const mdaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  shortName: {
    type: String,
    trim: true,
    default: '',
  },
  category: {
    type: String,
    enum: ['Ministry', 'Department', 'Agency', 'Commission', 'Other'],
    default: 'Ministry',
  },
  active: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// `name` already has its own unique index via `unique: true` above — no
// need to redeclare it with schema.index(), which is what triggered
// Mongoose's "Duplicate schema index" warning.
mdaSchema.index({ active: 1 });

module.exports = mongoose.model('Mda', mdaSchema);