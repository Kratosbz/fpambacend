'use strict';

/**
 * FPAMAS — Asset Coding v3 Migration Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Upgrades every existing v2-format code (FGN-{MDA}-{TYPE}-{BRANCH}-{YEAR}-{SEQ})
 * to v3 (FGN-{MDA}-{TYPE}-{NAME}-{BRANCH}-{YEAR}-{SEQ}), inserting a mnemonic
 * abbreviation of each asset's own name. MDA, TYPE, BRANCH, YEAR, and SEQ are
 * all preserved exactly as they were — this only inserts the new segment, it
 * does not renumber anything.
 *
 * Because a base asset's code STRING changes shape, every downstream code
 * built on top of it goes stale and has to be re-stamped from the freshly
 * upgraded parent, not just edited in place:
 *
 *   1. Base codes    — v2 → v3, inserting {NAME} for every independent asset.
 *   2. Child codes    — re-built from the (now-v3) parent's CURRENT code +
 *                       the same child seq + the child's own {NAME}. The old
 *                       child code's parent-prefix is stale the moment step 1
 *                       finishes, so this can't just insert a segment either —
 *                       it has to look the parent back up and rebuild in full.
 *   3. Inspection codes — same problem one level further down: every
 *                       Inspection.inspectionCode was built on an asset code
 *                       that no longer exists in that exact form. Re-stamped
 *                       using the asset's current code + the SAME stored
 *                       visitSeq (visit numbering itself doesn't change).
 *
 * Usage:
 *   node scripts/migrateAssetCodesV3.js
 *
 * Options:
 *   --dry-run    Print what would change without writing to the database
 *   --force      Re-upgrade codes even where a v3-shaped code already exists
 *
 * Place this file in:  scripts/migrateAssetCodesV3.js
 */

const mongoose       = require('mongoose');
const Asset          = require('../src/models/Asset');
const Inspection     = require('../src/models/Inspection');
const Mda            = require('../src/models/Mda');
const AssetCodeIndex = require('../src/utils/assetCodeIndex');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Harcourt:eckankar2757101@testcluster.hlwy0.gcp.mongodb.net/assetspatial?retryWrites=true&w=majority';

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

let _mdaList = [];

function hr() { console.log('──────────────────────────────────────────────────'); }

// A code is "already v3" if parseAssetCode reports version 3 on it (base
// codes) or if a child/inspection code's embedded asset-code segment is v3
// shaped. We only need the base-code check directly — steps 2 and 3 key off
// whether their PARENT/ASSET has already been upgraded, not their own shape.
function isV3Base(code) {
  const parsed = AssetCodeIndex.parseAssetCode(code);
  return !!parsed && parsed.version === 3;
}

async function step1_upgradeBaseCodes() {
  console.log('\n── STEP 1 — Upgrade base codes to v3 (insert {NAME}) ──\n');

  const query = {
    $and: [
      { $or: [{ parentId: null }, { parentId: { $exists: false } }, { parentId: '' }] },
      { assetCode: { $exists: true, $ne: '', $ne: null } },
    ],
  };

  const candidates = await Asset.find(query, { assetId: 1, assetCode: 1, mda: 1, type: 1, name: 1, state: 1 }).sort({ createdAt: 1 }).lean();
  const toUpgrade = FORCE ? candidates : candidates.filter(a => !isV3Base(a.assetCode));

  console.log(`Found ${toUpgrade.length} independent asset(s) needing a v3 upgrade (of ${candidates.length} with a code)\n`);
  if (toUpgrade.length === 0) return;

  const BATCH = 100;
  let processed = 0, updated = 0, errors = 0, skippedUnparseable = 0;
  const ops = [];

  let i = 0;
  for (const asset of toUpgrade) {
    i++;
    const parsed = AssetCodeIndex.parseAssetCode(asset.assetCode);
    if (!parsed) {
      console.log(`  [${String(i).padStart(4)}] ${asset.assetId} → SKIPPED — existing code "${asset.assetCode}" doesn't parse as a base code`);
      skippedUnparseable++;
      continue;
    }
    processed++;

    // Preserve mdaCode/typeCode/branchCode/year/seq exactly as they were —
    // rebuild the MDA/type from the raw code segments rather than
    // recomputing from asset.mda/asset.type, so this is a pure reshape with
    // zero risk of drifting to a different value than what's already live.
    const nameCode = AssetCodeIndex.nameToAbbr(asset.name);
    const newCode  = `FGN-${parsed.mdaCode}-${parsed.typeCode}-${nameCode}-${parsed.branchCode}-${parsed.year}-${AssetCodeIndex.formatSeq(parsed.seq)}`;

    console.log(`  [${String(i).padStart(4)}] ${asset.assetId.padEnd(12)} ${asset.assetCode.padEnd(30)} → ${newCode}`);

    if (!DRY_RUN) {
      ops.push({ updateOne: { filter: { assetId: asset.assetId }, update: { $set: { assetCode: newCode } } } });
      if (ops.length >= BATCH) {
        try { await Asset.bulkWrite(ops.splice(0, BATCH), { ordered: false }); updated += BATCH; }
        catch (e) { console.error(`  ✗ Batch write error: ${e.message}`); errors++; }
      }
    } else {
      updated++;
    }
  }
  if (!DRY_RUN && ops.length) {
    try { await Asset.bulkWrite(ops, { ordered: false }); updated += ops.length; }
    catch (e) { console.error(`  ✗ Final batch write error: ${e.message}`); errors++; }
  }

  console.log(`\nStep 1 — processed ${processed}, updated ${updated}, skipped (unparseable) ${skippedUnparseable}, errors ${errors}`);
}

async function step2_upgradeChildCodes() {
  console.log('\n── STEP 2 — Assign/re-stamp child codes for every linked asset ─\n');

  // Broadened on purpose: earlier versions of this step only looked at
  // assets whose CURRENT code was already child-shaped (had a -Cxx suffix)
  // and just re-stamped it. That silently skipped any asset that has a real
  // parentId link in the database but whose stored code was never touched
  // to reflect it — e.g. an asset that already had an independent-looking
  // code before being linked, or one linked through a path that set
  // parentId without also rebuilding assetCode. Confirmed in practice:
  // AST-1062 had parentId=AST-1060 but assetCode="FGN-FMLE-INF-001-2026-0001"
  // — a perfectly normal-looking BASE code with no -Cxx at all — and the
  // old version of this step logged it as "doesn't parse as a child code"
  // and moved on, leaving it permanently unfixed on every re-run.
  const children = await Asset.find(
    { parentId: { $nin: [null, ''] } },
    { assetId: 1, assetCode: 1, name: 1, parentId: 1 }
  ).sort({ createdAt: 1 }).lean();

  console.log(`Found ${children.length} asset(s) with a parentId link to check\n`);
  if (children.length === 0) return;

  // Highest -Cxx seq already in use PER PARENT, so newly-assigned seqs for
  // never-coded children never collide with already-child-coded siblings.
  const parentSeqCounters = {};
  const existingChildCodes = await Asset.find(
    { assetCode: { $regex: /-C\d{2,}/ } },
    { assetCode: 1 }
  ).lean();
  for (const a of existingChildCodes) {
    const parsed = AssetCodeIndex.parseChildCode(a.assetCode);
    if (!parsed) continue;
    if (!parentSeqCounters[parsed.parentCode] || parsed.seq > parentSeqCounters[parsed.parentCode]) {
      parentSeqCounters[parsed.parentCode] = parsed.seq;
    }
  }

  const BATCH = 100;
  let processed = 0, updated = 0, alreadyCurrent = 0, errors = 0, skippedNoParent = 0, freshlyAssigned = 0;
  const ops = [];

  let i = 0;
  for (const child of children) {
    i++;

    const parent = await Asset.findOne({ assetId: child.parentId }, { assetCode: 1 }).lean();
    if (!parent || !parent.assetCode) {
      console.log(`  [${String(i).padStart(4)}] ${child.assetId} → SKIPPED — parent "${child.parentId}" missing or uncoded (run step 1 first)`);
      skippedNoParent++;
      continue;
    }

    const existingParsed = child.assetCode ? AssetCodeIndex.parseChildCode(child.assetCode) : null;
    let seq, newCode, isFresh;

    if (existingParsed) {
      // Already child-shaped — preserve its seq, just re-stamp from the
      // (possibly freshly-upgraded) current parent code.
      seq = existingParsed.seq;
      isFresh = false;
    } else {
      // Real link, but the stored code never reflected it at all — assign
      // the next available seq for this parent, same rule the live link
      // endpoint uses (highest in use + 1).
      seq = (parentSeqCounters[parent.assetCode] || 0) + 1;
      parentSeqCounters[parent.assetCode] = seq;
      isFresh = true;
    }

    newCode = AssetCodeIndex.buildChildCode({ parentCode: parent.assetCode, seq, childName: child.name });
    if (newCode === child.assetCode && !FORCE) {
      alreadyCurrent++;
      continue;
    }
    processed++;
    if (isFresh) freshlyAssigned++;

    console.log(`  [${String(i).padStart(4)}] ${child.assetId.padEnd(12)} ${(child.assetCode || '(none)').padEnd(38)} → ${newCode}${isFresh ? '  [was never child-coded]' : ''}`);

    if (!DRY_RUN) {
      ops.push({ updateOne: { filter: { assetId: child.assetId }, update: { $set: { assetCode: newCode } } } });
      if (ops.length >= BATCH) {
        try { await Asset.bulkWrite(ops.splice(0, BATCH), { ordered: false }); updated += BATCH; }
        catch (e) { console.error(`  ✗ Batch write error: ${e.message}`); errors++; }
      }
    } else {
      updated++;
    }
  }
  if (!DRY_RUN && ops.length) {
    try { await Asset.bulkWrite(ops, { ordered: false }); updated += ops.length; }
    catch (e) { console.error(`  ✗ Final batch write error: ${e.message}`); errors++; }
  }

  console.log(`\nStep 2 — freshly assigned ${freshlyAssigned}, total updated ${updated}, already current ${alreadyCurrent}, skipped (no parent code) ${skippedNoParent}, errors ${errors}`);
}

async function step3_restampInspectionCodes() {
  console.log('\n── STEP 3 — Re-stamp inspection codes from upgraded assets ─\n');

  const inspections = await Inspection.find(
    { inspectionCode: { $exists: true, $ne: null } },
    { assetId: 1, inspectionCode: 1, visitSeq: 1 }
  ).lean();

  console.log(`Found ${inspections.length} coded inspection(s) to check\n`);
  if (inspections.length === 0) return;

  // Cache asset codes per assetId so a facility with many inspections only
  // costs one lookup, not one per inspection.
  const assetCodeCache = new Map();
  async function getAssetCode(assetId) {
    if (assetCodeCache.has(assetId)) return assetCodeCache.get(assetId);
    const asset = await Asset.findOne({ assetId }, { assetCode: 1 }).lean();
    const code = asset?.assetCode || null;
    assetCodeCache.set(assetId, code);
    return code;
  }

  const BATCH = 100;
  let processed = 0, updated = 0, alreadyCurrent = 0, errors = 0, skippedNoAsset = 0;
  const ops = [];

  let i = 0;
  for (const insp of inspections) {
    i++;
    const assetCode = await getAssetCode(insp.assetId);
    if (!assetCode) {
      console.log(`  [${String(i).padStart(4)}] ${insp.assetId} visit ${insp.visitSeq} → SKIPPED — asset missing or uncoded`);
      skippedNoAsset++;
      continue;
    }

    const newCode = AssetCodeIndex.buildInspectionCode({ assetCode, visitSeq: insp.visitSeq });
    if (newCode === insp.inspectionCode && !FORCE) {
      alreadyCurrent++;
      continue;
    }
    processed++;

    console.log(`  [${String(i).padStart(4)}] ${insp.assetId} visit ${insp.visitSeq} → ${newCode}`);

    if (!DRY_RUN) {
      ops.push({ updateOne: { filter: { _id: insp._id }, update: { $set: { inspectionCode: newCode } } } });
      if (ops.length >= BATCH) {
        try { await Inspection.bulkWrite(ops.splice(0, BATCH), { ordered: false }); updated += BATCH; }
        catch (e) { console.error(`  ✗ Batch write error: ${e.message}`); errors++; }
      }
    } else {
      updated++;
    }
  }
  if (!DRY_RUN && ops.length) {
    try { await Inspection.bulkWrite(ops, { ordered: false }); updated += ops.length; }
    catch (e) { console.error(`  ✗ Final batch write error: ${e.message}`); errors++; }
  }

  console.log(`\nStep 3 — processed ${processed}, updated ${updated}, already current ${alreadyCurrent}, skipped (no asset) ${skippedNoAsset}, errors ${errors}`);
}

async function run() {
  hr();
  console.log('  FPAMAS — Asset Coding v3 Migration');
  if (DRY_RUN) console.log('  MODE: DRY RUN (no writes)');
  if (FORCE)   console.log('  MODE: FORCE (re-upgrade even already-v3 codes)');
  hr();

  await mongoose.connect(MONGO_URI);
  console.log(`\n✓ Connected to MongoDB: ${MONGO_URI}`);

  _mdaList = await Mda.find({ active: true }, { name: 1, shortName: 1 }).lean();
  console.log(`✓ Loaded ${_mdaList.length} MDAs`);

  await step1_upgradeBaseCodes();
  await step2_upgradeChildCodes();
  await step3_restampInspectionCodes();

  hr();
  if (DRY_RUN) console.log('  ⚠  DRY RUN — no changes were written to the database');
  console.log('  Migration complete.');
  hr();

  await mongoose.disconnect();
  console.log('\n✓ Disconnected.\n');
}

run().catch(err => {
  console.error('\nMigration failed:', err);
  mongoose.disconnect();
  process.exit(1);
});