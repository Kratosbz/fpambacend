'use strict';

/**
 * FPAMAS — One-off Bulk Link Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Links a specific list of assets as children of a specific parent, exactly
 * replicating the logic in routes/asset_extras_routes.js's POST
 * /:id/relationships/link handler (child sequence numbering, code
 * generation, parentId/childIds updates) — just applied to a known list in
 * one run instead of one click at a time through the UI.
 *
 * Written for: linking AST-1061 through AST-1066 as children of AST-1060
 * (Public Service Institute of Nigeria). Edit PARENT_ID / CHILD_IDS below to
 * reuse this for a different batch.
 *
 * Usage:
 *   node scripts/linkPsinChildren.js --dry-run   (preview only)
 *   node scripts/linkPsinChildren.js             (apply for real)
 *
 * Place this file in: scripts/linkPsinChildren.js
 */

const mongoose       = require('mongoose');
const Asset          = require('../src/models/Asset');
const AssetCodeIndex = require('../src/utils/assetCodeIndex');
const assetService   = require('../src/services/assetService');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Harcourt:eckankar2757101@testcluster.hlwy0.gcp.mongodb.net/assetspatial?retryWrites=true&w=majority';
const DRY_RUN   = process.argv.includes('--dry-run');

// ── Edit this list to reuse for a different batch ─────────────────────────────
const PARENT_ID = 'AST-1060';
const CHILD_IDS = ['AST-1061', 'AST-1062', 'AST-1063', 'AST-1064', 'AST-1065', 'AST-1066'];

function hr() { console.log('──────────────────────────────────────────────────'); }

// Self-heals two gaps: (1) parent has no code at all, (2) parent has a
// code but it's the OLDER v2 shape (no name abbreviation) because it was
// never actually run through migrateAssetCodesV3.js — blindly trusting
// "it has some code" would bake that stale shape into every child's code
// permanently. Upgrading in place first, preserving mda/type/branch/year/
// seq exactly, means this script always builds on the current format
// regardless of whether the migration has actually been applied yet.
async function ensureAssetCode(asset) {
  if (asset.assetCode) {
    const parsed = AssetCodeIndex.parseAssetCode(asset.assetCode);
    if (parsed?.version === 3) return asset.assetCode;
    if (parsed?.version === 2) {
      const nameCode = AssetCodeIndex.nameToAbbr(asset.name);
      const upgraded = `FGN-${parsed.mdaCode}-${parsed.typeCode}-${nameCode}-${parsed.branchCode}-${parsed.year}-${AssetCodeIndex.formatSeq(parsed.seq)}`;
      console.log(`  (parent code was still v2-shaped — upgrading in place: ${asset.assetCode} → ${upgraded})`);
      asset.assetCode = upgraded;
      if (!DRY_RUN) await asset.save({ validateBeforeSave: false });
      return upgraded;
    }
    return asset.assetCode;
  }
  const code = await assetService.generateAssetCode({
    mda: asset.mda, type: asset.type, name: asset.name, state: asset.state, captureDate: asset.captureDate,
  });
  asset.assetCode = code;
  if (!DRY_RUN) await asset.save({ validateBeforeSave: false });
  return code;
}

async function run() {
  hr();
  console.log('  FPAMAS — Bulk Link Script');
  console.log(`  Parent: ${PARENT_ID}`);
  console.log(`  Children: ${CHILD_IDS.join(', ')}`);
  if (DRY_RUN) console.log('  MODE: DRY RUN (no writes)');
  hr();

  await mongoose.connect(MONGO_URI);
  console.log(`\n✓ Connected to MongoDB: ${MONGO_URI}\n`);

  const parent = await Asset.findOne({ assetId: PARENT_ID });
  if (!parent) {
    console.error(`✗ Parent asset "${PARENT_ID}" not found. Aborting — nothing was changed.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (AssetCodeIndex.isChildCode(parent.assetCode)) {
    console.error(`✗ "${PARENT_ID}" is itself a child asset — one level of nesting only. Aborting.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const parentCode = await ensureAssetCode(parent);
  console.log(`Parent code: ${parentCode}\n`);

  // Seed the per-parent seq counter from any children this parent already
  // has, so this is safe to re-run without colliding or reusing a C-number.
  const existingChildren = parent.childIds?.length
    ? await Asset.find({ assetId: { $in: parent.childIds } }, { assetCode: 1 }).lean()
    : [];
  let maxSeq = existingChildren.reduce((max, s) => {
    const parsed = AssetCodeIndex.parseChildCode(s.assetCode);
    return parsed && parsed.parentCode === parentCode ? Math.max(max, parsed.seq) : max;
  }, 0);

  let linked = 0, alreadyLinked = 0, skipped = 0, errors = 0;
  const newChildIds = [];

  for (const childId of CHILD_IDS) {
    const child = await Asset.findOne({ assetId: childId });
    if (!child) {
      console.log(`  ✗ ${childId} — SKIPPED, not found in the database`);
      skipped++;
      continue;
    }
    if (childId === PARENT_ID) {
      console.log(`  ✗ ${childId} — SKIPPED, cannot link an asset to itself`);
      skipped++;
      continue;
    }
    if (child.parentId && child.parentId !== PARENT_ID) {
      console.log(`  ⚠ ${childId} — SKIPPED, already linked to a DIFFERENT parent ("${child.parentId}") — not overwriting. Unlink it first if this is intentional.`);
      skipped++;
      continue;
    }
    if (child.parentId === PARENT_ID && AssetCodeIndex.isChildCode(child.assetCode)) {
      console.log(`  · ${childId} — already correctly linked (${child.assetCode})`);
      alreadyLinked++;
      continue;
    }

    maxSeq += 1;
    const childCode = AssetCodeIndex.buildChildCode({ parentCode, seq: maxSeq, childName: child.name });

    console.log(`  ✓ ${childId.padEnd(10)} (${child.name || 'unnamed'}) → ${childCode}`);

    if (!DRY_RUN) {
      child.parentId  = parent.assetId;
      child.assetCode = childCode;
      await child.save({ validateBeforeSave: false });
    }
    newChildIds.push(childId);
    linked++;
  }

  if (!DRY_RUN && newChildIds.length) {
    for (const id of newChildIds) {
      if (!parent.childIds.includes(id)) parent.childIds.push(id);
    }
    await parent.save({ validateBeforeSave: false });
  }

  hr();
  console.log(`  Linked: ${linked}  Already linked: ${alreadyLinked}  Skipped: ${skipped}  Errors: ${errors}`);
  if (DRY_RUN) console.log('  ⚠  DRY RUN — no changes were written to the database');
  hr();

  await mongoose.disconnect();
  console.log('\n✓ Disconnected.\n');
}

run().catch(err => {
  console.error('\nScript failed:', err);
  mongoose.disconnect();
  process.exit(1);
});