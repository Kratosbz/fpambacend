'use strict';
const router = require('express').Router();
const { authenticate }       = require('../middleware/auth');
const { resolvePermissions } = require('../middleware/resolvePermissions');
const { scopeFilter }        = require('../middleware/scopeFilter');
const spatialSvc = require('../services/spatialService');

const auth = [authenticate, resolvePermissions, scopeFilter];

// GET /api/assets/spatial/near?lat=&lng=&radiusKm=
router.get('/near', ...auth, async (req, res, next) => {
  try {
    const { lat, lng, radiusKm } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });
    const assets = await spatialSvc.nearbyAssets({ lat, lng, radiusKm, scopeFilter: req.scopeFilter });
    res.json({ assets });
  } catch (err) { next(err); }
});

// POST /api/assets/spatial/within  — body: { polygon: GeoJSON Polygon }
router.post('/within', ...auth, async (req, res, next) => {
  try {
    const { polygon } = req.body;
    if (!polygon) return res.status(400).json({ error: 'polygon GeoJSON object is required' });
    const assets = await spatialSvc.assetsWithinPolygon(polygon, req.scopeFilter);
    res.json({ assets });
  } catch (err) { next(err); }
});

// GET /api/assets/spatial/bbox?minLat=&minLng=&maxLat=&maxLng=
router.get('/bbox', ...auth, async (req, res, next) => {
  try {
    const { minLat, minLng, maxLat, maxLng } = req.query;
    if (!minLat || !minLng || !maxLat || !maxLng) {
      return res.status(400).json({ error: 'minLat, minLng, maxLat, maxLng are required' });
    }
    const assets = await spatialSvc.assetsInBbox(req.query, req.scopeFilter);
    res.json({ assets });
  } catch (err) { next(err); }
});

module.exports = router;
