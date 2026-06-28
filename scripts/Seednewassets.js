'use strict';
/**
 * seedNewAssets.js — self-contained, no project file imports.
 * Uses mongoose + GridFS directly so it works regardless of project structure.
 *
 * Usage:
 *   node scripts/seedNewAssets.js scripts/seed_photos
 */

const mongoose  = require('mongoose');
const fs        = require('fs');
const path      = require('path');
const { Readable } = require('stream');

const MONGO_URI   = process.env.MONGO_URI   || 'mongodb://localhost:27017/assetspatial';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@assetspatial.gov.ng';
const PHOTOS_DIR  = process.argv[2] || path.join(__dirname, 'seed_photos');

// ── 5 assets ──────────────────────────────────────────────────────────────────
const ASSETS = [
  {
    name: 'National Housing Programme — Edo State',
    type: 'Infrastructure', geomType: 'Point',
    state: 'Edo', lga: 'Oredo',
    address: 'Edumega / Benin City, Edo 301112',
    mda: 'Federal Ministry of Works and Housing',
    sector: 'Infrastructure & Works',
    condition: 'Fair', status: 'Under Maintenance', assessed: 'Assessed',
    coordinates: [5.751761, 6.400566],
    captureDate: new Date('2026-06-11T10:00:00+01:00'),
    notes: 'Facility management of National Housing Programme, Edo State. Cleaning and maintenance of housing units at Edumega and Benin City.',
  },
  {
    name: 'National Housing Programme — Jalingo, Taraba State',
    type: 'Infrastructure', geomType: 'Point',
    state: 'Taraba', lga: 'Jalingo',
    address: 'V7wx+x68, Jalingo, Taraba 660102',
    mda: 'Federal Ministry of Works and Housing',
    sector: 'Infrastructure & Works',
    condition: 'Fair', status: 'Under Maintenance', assessed: 'Assessed',
    coordinates: [11.298707, 8.896294],
    captureDate: new Date('2026-04-24T13:17:00+01:00'),
    notes: 'Facility management of National Housing Programme, Jalingo, Taraba State. Interior cleaning, road sweeping, and drainage clearing.',
  },
  {
    name: 'National Housing Programme — Adamawa State',
    type: 'Infrastructure', geomType: 'Point',
    state: 'Adamawa', lga: 'Yola North',
    address: 'Bulamare / Jimeta, Adamawa 640284',
    mda: 'Federal Ministry of Works and Housing',
    sector: 'Infrastructure & Works',
    condition: 'Fair', status: 'Under Maintenance', assessed: 'Assessed',
    coordinates: [12.340482, 9.289556],
    captureDate: new Date('2026-04-24T08:09:00+01:00'),
    notes: 'Facility management of National Housing Programme, Adamawa State. Drainage cleaning, compound sweeping and maintenance at Bulamare and Jimeta.',
  },
  {
    name: "National Housing Programme — Suleja, Niger State",
    type: 'Infrastructure', geomType: 'Point',
    state: 'Niger', lga: 'Suleja',
    address: "Shehu Yar'Adua Way, Suleja, Niger",
    mda: 'Federal Ministry of Works and Housing',
    sector: 'Infrastructure & Works',
    condition: 'Fair', status: 'Under Maintenance', assessed: 'Assessed',
    coordinates: [7.187708, 9.255382],
    captureDate: new Date('2026-05-12T11:50:00+01:00'),
    notes: "Facility management of National Housing Programme, Suleja, Niger State. Landscaping, compound clearing and gate forecourt sweeping.",
  },
  {
    name: 'Federal Secretariat Complex — Lafia, Nasarawa State',
    type: 'Infrastructure', geomType: 'Point',
    state: 'Nasarawa', lga: 'Lafia',
    address: 'Ggmh+cg6, Lafia 950101, Nasarawa',
    mda: 'Federal Ministry of Works and Housing',
    sector: 'Infrastructure & Works',
    condition: 'Fair', status: 'Under Maintenance', assessed: 'Assessed',
    coordinates: [8.528474, 8.534605],
    captureDate: new Date('2024-12-10T09:12:00+01:00'),
    notes: 'Facility management of Hon. Justice Sidi Bage Federal Secretariat Complex, Lafia, Nasarawa State. Electrical maintenance, toilet cleaning, window cleaning, lawn management, drainage desilting and waste collection.',
  },
];

// ── Load photos from seed_photos/asset_N/ ─────────────────────────────────────
function loadPhotos(photosDir) {
  return ASSETS.map((_, i) => {
    const dir = path.join(photosDir, `asset_${i}`);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
      .sort()
      .map(fname => ({
        buffer:       fs.readFileSync(path.join(dir, fname)),
        originalname: fname,
        mimetype:     /\.png$/i.test(fname) ? 'image/png' : 'image/jpeg',
      }));
  });
}

// ── Upload one photo buffer directly to GridFS ────────────────────────────────
function uploadToGridFS(bucket, buffer, filename, metadata) {
  return new Promise((resolve, reject) => {
    const id     = new mongoose.Types.ObjectId();
    const stream = bucket.openUploadStreamWithId(id, filename, { metadata });
    Readable.from(buffer).pipe(stream)
      .on('finish', () => resolve(id))
      .on('error', reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('[seed] Photos dir:', PHOTOS_DIR);
  const photosByAsset = loadPhotos(PHOTOS_DIR);
  photosByAsset.forEach((p, i) =>
    console.log(`  asset_${i} (${ASSETS[i].state}): ${p.length} photo(s) ready`));

  await mongoose.connect(MONGO_URI);
  console.log('\n[seed] Connected →', MONGO_URI);

  const db      = mongoose.connection.db;
  const assets  = db.collection('assets');
  const users   = db.collection('users');
  const bucket  = new mongoose.mongo.GridFSBucket(db, { bucketName: 'photos' });

  // Find admin user
  const admin = await users.findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    console.error(`[seed] Admin not found: ${ADMIN_EMAIL}`);
    await mongoose.disconnect(); process.exit(1);
  }
  console.log(`[seed] Admin: ${admin.name} (${admin._id})\n`);

  // Find max AST- sequence
  const last = await assets
    .find({ assetId: { $regex: /^AST-\d+$/ } })
    .sort({ assetId: -1 }).limit(1).toArray();
  let seq = last[0]?.assetId ? parseInt(last[0].assetId.replace('AST-', '')) : 1000;

  let inserted = 0, skipped = 0, photosTotal = 0;

  for (let i = 0; i < ASSETS.length; i++) {
    const a = ASSETS[i];

    const existing = await assets.findOne({ name: a.name });
    if (existing) {
      console.log(`[seed] SKIP (exists): ${a.name}`);
      skipped++; continue;
    }

    seq++;
    const assetId  = `AST-${seq}`;
    const now      = new Date();
    const adminId  = admin._id;
    const photoRefs = [];

    // Upload photos first so refs are ready
    for (const file of (photosByAsset[i] || [])) {
      try {
        const fname  = `${assetId}_${Date.now()}_${file.originalname}`;
        const fileId = await uploadToGridFS(bucket, file.buffer, fname, {
          assetId, fileType: 'photo', uploadedBy: adminId,
          mimeType: 'image/jpeg', originalName: file.originalname,
        });
        photoRefs.push({
          _id:          new mongoose.Types.ObjectId(),
          fileId,
          filename:     fname,
          originalname: file.originalname,
          mimeType:     'image/jpeg',
          contentType:  'image/jpeg',
          sizeBytes:    file.buffer.length,
          length:       file.buffer.length,
          capturedAt:   a.captureDate,
          uploadedAt:   now,
        });
        console.log(`    [photo] ${file.originalname} → ${fileId}`);
        photosTotal++;
      } catch (err) {
        console.warn(`    [photo] WARN: ${file.originalname} — ${err.message}`);
      }
    }

    await assets.insertOne({
      assetId,
      name:           a.name,
      type:           a.type,
      geomType:       a.geomType,
      state:          a.state,
      lga:            a.lga,
      address:        a.address,
      mda:            a.mda,
      sector:         a.sector,
      condition:      a.condition,
      status:         a.status,
      assessed:       a.assessed,
      captureDate:    a.captureDate,
      notes:          a.notes,
      capturedBy:     adminId,
      approvalStatus: 'Approved',
      reviewedBy:     adminId,
      reviewedAt:     now,
      lifecycleStage: 'Active',
      location:       { type: 'Point', coordinates: a.coordinates },
      photos:         photoRefs,
      documents:      [],
      xlDatasets:     [],
      createdAt:      now,
      updatedAt:      now,
    });

    console.log(`[seed] INSERTED: ${assetId} — ${a.name} (${photoRefs.length} photos)\n`);
    inserted++;
  }

  console.log('─'.repeat(55));
  console.log(`[seed] Assets: inserted ${inserted}, skipped ${skipped}`);
  console.log(`[seed] Photos: uploaded ${photosTotal}`);
  console.log('─'.repeat(55));

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});