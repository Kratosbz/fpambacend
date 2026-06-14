'use strict';
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const historySchema = new Schema({
  status: String,
  at:     { type: Date, default: Date.now },
  by:     String,
  note:   String,
}, { _id: false });

const inspectionSchema = new Schema({
  inspectionId:  { type: String, required: true, unique: true, index: true },
  assetId:       { type: String, required: true, index: true },
  assetName:     String,
  type: {
    type:    String,
    enum:    ['Routine', 'Condition Assessment', 'Post-Maintenance', 'Emergency', 'Annual'],
    default: 'Routine',
  },
  scheduledDate: { type: Date, required: true, index: true },
  assignedTo:    String,   // agent name (or user ID if you want to ref)
  assignedById:  { type: Types.ObjectId, ref: 'User' },
  notes:         String,

  status: {
    type:    String,
    enum:    ['Scheduled', 'Assigned', 'In Progress', 'Submitted', 'Approved', 'Rejected'],
    default: 'Scheduled',
    index:   true,
  },

  // Filled when agent submits
  report: {
    condition:       String,
    date:            Date,
    findings:        String,
    recommendations: String,
    submittedAt:     Date,
    submittedBy:     String,
  },

  // Filled on approval/rejection
  reviewedAt:      Date,
  reviewedBy:      String,
  rejectionReason: String,

  history: [historySchema],
  createdBy: String,
}, {
  timestamps: true,
});

// Auto-generate inspectionId
inspectionSchema.pre('save', async function (next) {
  if (!this.inspectionId) {
    const last = await mongoose.model('Inspection').findOne({}, { inspectionId: 1 }).sort({ createdAt: -1 }).lean();
    const num = last?.inspectionId ? parseInt(last.inspectionId.replace('INS-', ''), 36) + 1 : 1000;
    this.inspectionId = 'INS-' + num.toString(36).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Inspection', inspectionSchema);