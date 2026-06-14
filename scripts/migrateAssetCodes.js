'use strict';

/**
 * AssetSpatial — Asset Code Migration Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Run ONCE to backfill the assetCode field on all existing assets that don't
 * have one yet.
 *
 * Usage:
 *   node scripts/migrateAssetCodes.js
 *
 * Options:
 *   --dry-run    Print what would be updated without writing to DB
 *   --force      Re-generate codes even on assets that already have one
 *
 * Place this file in:  scripts/migrateAssetCodes.js
 */

const mongoose       = require('mongoose');
const Asset          = require('../src/models/Asset');
const Mda            = require('../src/models/Mda');
const AssetCodeIndex = require('../src/utils/assetCodeIndex');

// ── Read your MongoDB URI from env or hardcode for local dev ──────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/assetspatial';

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

// ── Sequence counter per MDA+type+branch+year group ───────────────────────────
// Tracks how many codes have been assigned in each group during this run
// so sequential numbers don't clash within the batch.
const seqCounters = {};

function nextSeq(mda, type, state, year) {
  const mdaCode  = AssetCodeIndex.mdaToCode(mda, _mdaList);
  const typeCode = AssetCodeIndex.TYPE_CODES[type] || 'UNK';
  const branch   = AssetCodeIndex.getBranchCode(state);
  const key      = `${mdaCode}-${typeCode}-${branch}-${year}`;
  seqCounters[key] = (seqCounters[key] || 0) + 1;
  return seqCounters[key];
}

let _mdaList = [];

async function run() {
  console.log('\n──────────────────────────────────────────────────');
  console.log('  AssetSpatial — Asset Code Migration');
  if (DRY_RUN) console.log('  MODE: DRY RUN (no writes)');
  if (FORCE)   console.log('  MODE: FORCE (re-generate existing codes)');
  console.log('──────────────────────────────────────────────────\n');

  // Connect
  await mongoose.connect(MONGO_URI);
  console.log(`✓ Connected to MongoDB: ${MONGO_URI}\n`);

  // Load MDA list for short code resolution
  _mdaList = await Mda.find({ active: true }, { name: 1, shortName: 1 }).lean();
  console.log(`✓ Loaded ${_mdaList.length} MDAs\n`);

  // Find assets to migrate
  const query = FORCE ? {} : { $or: [{ assetCode: { $exists: false } }, { assetCode: '' }, { assetCode: null }] };
  const total = await Asset.countDocuments(query);
  console.log(`Found ${total} asset(s) to migrate\n`);

  if (total === 0) {
    console.log('Nothing to do. All assets already have codes.');
    await mongoose.disconnect();
    return;
  }

  // Pre-load existing sequence counts from DB so we don't clash with
  // assets that already have codes
  if (!FORCE) {
    const existing = await Asset.find(
      { assetCode: { $exists: true, $ne: '' } },
      { assetCode: 1 }
    ).lean();

    for (const a of existing) {
      const parsed = AssetCodeIndex.parseAssetCode(a.assetCode);
      if (!parsed) continue;
      const key = `${parsed.mdaCode}-${parsed.typeCode}-${parsed.branchCode}-${parsed.year}`;
      if (!seqCounters[key] || parsed.seq > seqCounters[key]) {
        seqCounters[key] = parsed.seq;
      }
    }
    console.log(`✓ Pre-loaded sequence counters from ${existing.length} already-coded asset(s)\n`);
  }

  // Stream through assets in batches
  const BATCH = 100;
  let processed = 0;
  let updated   = 0;
  let skipped   = 0;
  let errors    = 0;

  const cursor = Asset.find(query)
    .sort({ createdAt: 1 })  // oldest first so seq numbers are chronological
    .cursor();

  const ops = [];

  for await (const asset of cursor) {
    processed++;

    const mda   = asset.mda   || '';
    const type  = asset.type  || 'Infrastructure';
    const state = asset.state || '';
    const year  = asset.captureDate
      ? new Date(asset.captureDate).getFullYear()
      : new Date(asset.createdAt || Date.now()).getFullYear();

    const seq       = nextSeq(mda, type, state, year);
    const assetCode = AssetCodeIndex.buildAssetCode({ mda, type, state, year, seq, mdaList: _mdaList });
    const isHQ      = assetCode.includes('-001-');

    const line = [
      `  [${String(processed).padStart(4)}]`,
      asset.assetId.padEnd(12),
      '→',
      assetCode.padEnd(32),
      isHQ ? '★ HQ' : '',
    ].join(' ');
    console.log(line);

    if (!DRY_RUN) {
      ops.push({
        updateOne: {
          filter: { _id: asset._id },
          update: { $set: { assetCode } },
        },
      });

      // Flush batch
      if (ops.length >= BATCH) {
        try {
          await Asset.bulkWrite(ops.splice(0, BATCH), { ordered: false });
          updated += BATCH;
        } catch (e) {
          console.error(`  ✗ Batch write error: ${e.message}`);
          errors++;
        }
      }
    } else {
      updated++;
    }
  }

  // Flush remaining ops
  if (!DRY_RUN && ops.length) {
    try {
      await Asset.bulkWrite(ops, { ordered: false });
      updated += ops.length;
    } catch (e) {
      console.error(`  ✗ Final batch write error: ${e.message}`);
      errors++;
    }
  }

  console.log('\n──────────────────────────────────────────────────');
  console.log(`  Processed : ${processed}`);
  console.log(`  Updated   : ${updated}`);
  console.log(`  Skipped   : ${skipped}`);
  console.log(`  Errors    : ${errors}`);
  if (DRY_RUN) console.log('\n  ⚠  DRY RUN — no changes written to database');
  console.log('──────────────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('✓ Disconnected. Migration complete.\n');
}

run().catch(err => {
  console.error('Migration failed:', err);
  mongoose.disconnect();
  process.exit(1);
});