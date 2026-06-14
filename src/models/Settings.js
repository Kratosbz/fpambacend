'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

const settingsSchema = new Schema({
  _singleton:      { type: String, default: 'global', unique: true },
  platformName:    { type: String, default: 'AssetSpatial' },
  organisation:    { type: String, default: 'Federal Government of Nigeria' },
  coordinateSystem: { type: String, default: 'WGS84' },
  defaultMapCenter: {
    lat: { type: Number, default: 9.0765 },   // Abuja
    lng: { type: Number, default: 7.3986 },
  },
  defaultZoom:     { type: Number, default: 7 },
  featureToggles: {
    ocrEnabled:      { type: Boolean, default: true },
    excelEnabled:    { type: Boolean, default: true },
    realtimeEnabled: { type: Boolean, default: true },
    offlineMode:     { type: Boolean, default: false },
  },
  exportFormats:   { type: [String], default: ['csv', 'json', 'geojson', 'xlsx'] },
  updatedBy:       { type: mongoose.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Settings', settingsSchema);
