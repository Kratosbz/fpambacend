'use strict';
const Asset          = require('../models/Asset');
const turf           = require('@turf/turf');
const AssetCodeIndex = require('../utils/assetCodeIndex');
const Mda            = require('../models/Mda');

// ── ID generation ─────────────────────────────────────────────────────────────
async function nextAssetId() {
  const last = await Asset.findOne({}, { assetId: 1 }).sort({ createdAt: -1 }).lean();
  if (!last?.assetId) return 'AST-1001';
  const num = parseInt(last.assetId.replace('AST-', ''), 10);
  return isNaN(num) ? 'AST-1001' : `AST-${num + 1}`;
}

// ── Asset code generation ─────────────────────────────────────────────────────
async function generateAssetCode({ mda, type, state, captureDate }) {
  // Load MDA list to resolve short codes
  const mdaList = await Mda.find({ active: true }, { name: 1, shortName: 1 }).lean().catch(() => []);

  const year   = captureDate ? new Date(captureDate).getFullYear() : new Date().getFullYear();
  const branch = AssetCodeIndex.getBranchCode(state);

  // Count existing assets with the same MDA + type + branch + year to get next seq
  const mdaCode  = AssetCodeIndex.mdaToCode(mda, mdaList);
  const typeCode = AssetCodeIndex.TYPE_CODES[type] || 'UNK';
  const prefix   = `FGN-${mdaCode}-${typeCode}-${branch}-${year}-`;

  const count = await Asset.countDocuments({
    assetCode: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` },
  });

  return AssetCodeIndex.buildAssetCode({ mda, type, state, year, seq: count + 1, mdaList });
}

// ── Spatial computation ───────────────────────────────────────────────────────
function computeSpatial(data) {
  if (data.geomType === 'Polygon' && data.geometry) {
    try {
      data.area = Math.round(turf.area(turf.polygon(data.geometry.coordinates || [data.geometry])));
    } catch (_) {}
  }
  if (data.geomType === 'Linear' && data.geometry) {
    try {
      data.area = Math.round(turf.length(turf.lineString(data.geometry.coordinates || [data.geometry]), { units: 'meters' }));
    } catch (_) {}
  }
  return data;
}

// ── Normalise file objects so frontend always gets _id ────────────────────────
// Schema stores fileId (GridFS ObjectId). We expose _id = fileId so the
// frontend's _fileId() helper (f._id || f.id || f.fileId) always finds it.
function normaliseFileRef(f) {
  if (!f) return f;
  const obj = f.toObject ? f.toObject() : { ...f };
  obj._id          = obj._id          || obj.fileId;
  obj.originalname = obj.originalname || obj.filename;
  obj.contentType  = obj.contentType  || obj.mimeType;
  obj.length       = obj.length       || obj.sizeBytes;
  obj.uploadDate   = obj.uploadDate   || obj.uploadedAt;
  return obj;
}

function normaliseAsset(asset) {
  if (!asset) return asset;
  asset.photos    = (asset.photos    || []).map(normaliseFileRef);
  asset.documents = (asset.documents || []).map(normaliseFileRef);
  // Expose xlDatasets as 'excel' so GET /assets/:id/excel responses match
  // what the frontend expects (r.files || r.excel)
  asset.excel     = (asset.xlDatasets || []).map(f => ({
    ...normaliseFileRef(f),
    _id: f._id || f.fileId,
  }));
  return asset;
}

// ── createAsset ───────────────────────────────────────────────────────────────
async function createAsset(body, userId) {
  const assetId   = await nextAssetId();
  const assetCode = await generateAssetCode({
    mda:         body.mda,
    type:        body.type,
    state:       body.state,
    captureDate: body.captureDate,
  });

  const data = computeSpatial({
    ...body,
    assetId,
    assetCode,
    capturedBy: userId,
    location: {
      type: 'Point',
      coordinates: body.coordinates,
    },
  });
  delete data.coordinates;
  const asset = await Asset.create(data);
  return normaliseAsset(asset.toObject());
}

// ── listAssets ────────────────────────────────────────────────────────────────
async function listAssets({
  type, condition, state, lga, geomType, status,
  page = 1, limit = 50,
  scopeFilter = {},
} = {}) {
  const _page  = Math.max(1, parseInt(page,  10) || 1);
  const _limit = Math.min(200, parseInt(limit, 10) || 50);
  const skip   = (_page - 1) * _limit;

  const filter = { ...scopeFilter };
  if (type)      filter.type      = type;
  if (condition) filter.condition = condition;
  if (state)     filter.state     = state;
  if (lga)       filter.lga       = lga;
  if (geomType)  filter.geomType  = geomType;
  if (status)    filter.status    = status;

  const [assets, total] = await Promise.all([
    Asset.find(filter).skip(skip).limit(_limit).sort({ createdAt: -1 }).lean(),
    Asset.countDocuments(filter),
  ]);

  return {
    assets: assets.map(normaliseAsset),
    total,
    page:   _page,
    pages:  Math.ceil(total / _limit),
  };
}

// ── getAsset ──────────────────────────────────────────────────────────────────
async function getAsset(id) {
  // Support lookup by assetId (AST-XXXX), assetCode (FGN-...), or MongoDB _id
  let query;
  if (id.startsWith('AST-'))  query = { assetId:   id };
  else if (id.startsWith('FGN-')) query = { assetCode: id };
  else                           query = { _id: id };

  const asset = await Asset.findOne(query)
    .populate('capturedBy', 'name email role')
    .lean();
  return normaliseAsset(asset);
}

// ── updateAsset ───────────────────────────────────────────────────────────────
async function updateAsset(id, body) {
  const query = id.startsWith('AST-') ? { assetId: id } : { _id: id };

  // Strip fields that must never be overwritten via $set
  const {
    previousCondition,
    conditionHistory: _ch,
    _id, __v,
    assetId:    _aid,
    capturedBy: _cb,
    photos:     _p,
    documents:  _d,
    xlDatasets: _xl,
    excel:      _ex,
    ...fields
  } = body;

  const data = computeSpatial({ ...fields });

  if (body.coordinates && Array.isArray(body.coordinates)) {
    data.location = { type: 'Point', coordinates: body.coordinates };
    delete data.coordinates;
  }

  const update = { $set: data };

  if (previousCondition && fields.condition && previousCondition !== fields.condition) {
    update.$push = {
      conditionHistory: {
        from:      previousCondition,
        to:        fields.condition,
        changedAt: new Date(),
      },
    };
  }

  const asset = await Asset.findOneAndUpdate(query, update, {
    new:           true,
    runValidators: false,
  }).lean();

  return normaliseAsset(asset);
}

// ── deleteAsset ───────────────────────────────────────────────────────────────
async function deleteAsset(id) {
  const query = id.startsWith('AST-') ? { assetId: id } : { _id: id };
  return Asset.findOneAndDelete(query).lean();
}

// ── searchAssets ──────────────────────────────────────────────────────────────
async function searchAssets(q, scopeFilter = {}) {
  // Use regex so partial matches work from the first character typed.
  // $text requires complete words; regex matches substrings instantly.
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'i');

  const assets = await Asset.find({
    ...scopeFilter,
    $or: [
      { name:      re },
      { assetId:   re },
      { assetCode: re },
      { state:     re },
      { lga:       re },
      { mda:       re },
      { type:      re },
      { address:   re },
      { notes:     re },
    ],
  })
    .limit(100)
    .sort({ createdAt: -1 })
    .lean();

  return assets.map(normaliseAsset);
}

module.exports = { createAsset, listAssets, getAsset, updateAsset, deleteAsset, searchAssets, generateAssetCode };