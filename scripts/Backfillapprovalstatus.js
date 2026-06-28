'use strict';
/**
 * backfillApprovalStatus.js
 * ─────────────────────────────────────────────────────────────────────────
 * One-time migration: explicitly sets approvalStatus = 'Approved' on every
 * existing asset that doesn't already have the field set.
 *
 * This isn't strictly required for correctness — assetService.listAssets()
 * already treats "missing approvalStatus" the same as "Approved" via an
 * $nin filter — but stamping it explicitly keeps the data self-describing
 * going forward (e.g. for anyone running ad-hoc queries directly against
 * Mongo) and avoids relying on that fallback indefinitely.
 *
 * Run once, after deploying the updated Asset model:
 *   node scripts/backfillApprovalStatus.js
 *
 * Safe to re-run — it only ever touches documents where approvalStatus
 * does not exist yet, so running it twice is a no-op the second time.
 */

const mongoose = require('mongoose');

// Adjust to match how your app already connects (e.g. require('../config/database')).
// Left explicit here so this script has zero dependencies on files this
// migration wasn't given access to.
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/assetspatial';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('[backfill] Connected to', MONGO_URI);

  const Asset = mongoose.connection.collection('assets');

  const result = await Asset.updateMany(
    { approvalStatus: { $exists: false } },
    { $set: { approvalStatus: 'Approved' } }
  );

  console.log(`[backfill] Matched ${result.matchedCount}, modified ${result.modifiedCount} asset(s).`);

  await mongoose.disconnect();
  console.log('[backfill] Done.');
}

run().catch(err => {
  console.error('[backfill] Failed:', err);
  process.exit(1);
});