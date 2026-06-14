'use strict';
const Asset = require('../models/Asset');

async function nearbyAssets({ lat, lng, radiusKm = 5, scopeFilter = {} }) {
  return Asset.find({
    location: {
      $near: {
        $geometry:    { type: 'Point', coordinates: [+lng, +lat] },
        $maxDistance: radiusKm * 1000,
      },
    },
    ...scopeFilter,
  }).limit(200).lean();
}

async function assetsWithinPolygon(geoJsonPolygon, scopeFilter = {}) {
  return Asset.find({
    location: {
      $geoWithin: { $geometry: geoJsonPolygon },
    },
    ...scopeFilter,
  }).limit(500).lean();
}

async function assetsInBbox({ minLat, minLng, maxLat, maxLng }, scopeFilter = {}) {
  return Asset.find({
    location: {
      $geoWithin: {
        $box: [
          [+minLng, +minLat],
          [+maxLng, +maxLat],
        ],
      },
    },
    ...scopeFilter,
  }).limit(500).lean();
}

module.exports = { nearbyAssets, assetsWithinPolygon, assetsInBbox };
