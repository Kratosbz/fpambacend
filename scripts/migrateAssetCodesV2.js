'use strict';

/**
 * FPAMAS — Asset Coding v2 Migration Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Backfills the full v2 coding system onto EXISTING data:
 *
 *   1. Base codes   — FGN-{MDA}-{TYPE}-{BRANCH}-{YEAR}-{SEQ} on every
 *                      independent (non-child) asset that doesn't have one.
 *                      This subsumes the original migrateAssetCodes.js: that
 *                      script's writes were silently dropped before the
 *                      Asset.js schema fix (assetCode wasn't a declared
 *                      field), so almost every asset needs this regardless
 *                      of whether that script was run before.
 *
 *   2. Child codes  — {parentCode}-C{seq} on every asset that already has
 *                      parentId set (linked before this migration existed)
 *                      but whose assetCode doesn't reflect that lineage yet.
 *                      Runs AFTER step 1, so every parent is guaranteed to
 *                      have a base code to derive from.
 *
 *   3. Inspection visit codes — {assetCode}-INSP-{visitSeq} on every
 *                      Inspection document already sitting at status
 *                      'Approved' that doesn't have one yet, numbered
 *                      chronologically per asset (oldest approval = visit 1)
 *                      so historical numbering makes sense. Also brings each
 *                      asset's cached inspectionCount up to date.
 *
 * Steps run in order and are safe to re-run — anything already coded is
 * left untouched unless --force is passed.
 *
 * Usage:
 *   node scripts/migrateAssetCodesV2.js
 *
 * Options:
 *   --dry-run    Print what would change without writing to the database
 *   --force      Re-generate codes even where one already exists
 *   --skip-inspections   Only run steps 1 and 2, leave Inspection docs alone
 *
 * Place this file in:  scripts/migrateAssetCodesV2.js
 */

const mongoose       = require('mongoose');
const Asset          = require('../src/models/Asset');
const Inspection     = require('../src/models/Inspection');
const Mda            = require('../src/models/Mda');
const AssetCodeIndex = require('../src/utils/assetCodeIndex');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/assetspatial';

const DRY_RUN          = process.argv.includes('--dry-run');
const FORCE             = process.argv.includes('--force');
const SKIP_INSPECTIONS = process.argv.includes('--skip-inspections');

let _mdaList = [];

// ── Sequence counter per MDA+type+branch+year group (base codes only —
// child codes use their own per-parent counter in step 2) ────────────────────
const seqCounters = {};
function nextBaseSeq(mda, type, state, year) {
  const mdaCode  = AssetCodeIndex.mdaToCode(mda, _mdaList);
  const typeCode = AssetCodeIndex.TYPE_CODES[type] || 'UNK';
  const branch   = AssetCodeIndex.getBranchCode(state);
  const key      = `${mdaCode}-${typeCode}-${branch}-${year}`;
  seqCounters[key] = (seqCounters[key] || 0) + 1;
  return seqCounters[key];
}

function hr() { console.log('──────────────────────────────────────────────────'); }

async function step1_baseCodes() {
  console.log('\n── STEP 1 — Base codes (independent assets) ──────────\n');

  // Independent = no parentId. Children get their code in step 2, derived
  // from their parent — assigning them a base code here would be wasted
  // work immediately overwritten next step.
  const baseQuery = {
    $and: [
      { $or: [{ parentId: null }, { parentId: { $exists: false } }, { parentId: '' }] },
      FORCE ? {} : { $or: [{ assetCode: { $exists: false } }, { assetCode: '' }, { assetCode: null }] },
    ],
  };

  const total = await Asset.countDocuments(baseQuery);
  console.log(`Found ${total} independent asset(s) needing a base code\n`);
  if (total === 0) return;

  // Pre-load existing sequence counts so freshly-assigned numbers don't
  // clash with codes that are already correct. isChildCode() filters out
  // any -Cxx codes that would otherwise be misread by parseAssetCode (which
  // just takes the first 6 dash-segments and silently ignores the rest).
  if (!FORCE) {
    const existing = await Asset.find(
      { assetCode: { $exists: true, $ne: '' } },
      { assetCode: 1 }
    ).lean();
    for (const a of existing) {
      if (AssetCodeIndex.isChildCode(a.assetCode)) continue;
      const parsed = AssetCodeIndex.parseAssetCode(a.assetCode);
      if (!parsed) continue;
      const key = `${parsed.mdaCode}-${parsed.typeCode}-${parsed.branchCode}-${parsed.year}`;
      if (!seqCounters[key] || parsed.seq > seqCounters[key]) seqCounters[key] = parsed.seq;
    }
    console.log(`✓ Pre-loaded sequence counters from ${existing.length} already-coded asset(s)\n`);
  }

  const BATCH = 100;
  let processed = 0, updated = 0, errors = 0;
  const ops = [];

  const cursor = Asset.find(baseQuery).sort({ createdAt: 1 }).cursor();
  for await (const asset of cursor) {
    processed++;
    const mda   = asset.mda   || '';
    const type  = asset.type  || 'Infrastructure';
    const state = asset.state || '';
    const year  = asset.captureDate
      ? new Date(asset.captureDate).getFullYear()
      : new Date(asset.createdAt || Date.now()).getFullYear();

    const seq       = nextBaseSeq(mda, type, state, year);
    const assetCode = AssetCodeIndex.buildAssetCode({ mda, type, state, year, seq, mdaList: _mdaList });
    const isHQ      = assetCode.includes('-001-');

    console.log(`  [${String(processed).padStart(4)}] ${(asset.assetId || '').padEnd(12)} → ${assetCode.padEnd(32)} ${isHQ ? '★ HQ' : ''}`);

    if (!DRY_RUN) {
      ops.push({ updateOne: { filter: { _id: asset._id }, update: { $set: { assetCode } } } });
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

  console.log(`\nStep 1 — processed ${processed}, updated ${updated}, errors ${errors}`);
}

async function step2_childCodes() {
  console.log('\n── STEP 2 — Child codes (already-linked components) ──\n');

  const childQuery = {
    $and: [
      { parentId: { $exists: true, $ne: null, $ne: '' } },
      FORCE
        ? {}
        : { $or: [
            { assetCode: { $exists: false } }, { assetCode: '' }, { assetCode: null },
            // Also catch children whose code was never re-derived from the
            // parent — e.g. linked via the old, pre-fix relationships
            // endpoint that didn't stamp a -Cxx code at all.
          ] },
    ],
  };

  const total = await Asset.countDocuments(childQuery);
  console.log(`Found ${total} linked child asset(s) needing a child code\n`);
  if (total === 0) return;

  // Track the highest -Cxx seq already in use PER PARENT so re-runs and
  // partially-migrated data never reuse or collide on a number — same rule
  // the live link endpoint (routes/asset_extras_routes.js) follows.
  const parentSeqCounters = {}; // parentCode -> highest seq in use

  const allCurrentChildCodes = await Asset.find(
    { assetCode: { $regex: /-C\d{2,}$/ } },
    { assetCode: 1 }
  ).lean();
  for (const a of allCurrentChildCodes) {
    const parsed = AssetCodeIndex.parseChildCode(a.assetCode);
    if (!parsed) continue;
    if (!parentSeqCounters[parsed.parentCode] || parsed.seq > parentSeqCounters[parsed.parentCode]) {
      parentSeqCounters[parsed.parentCode] = parsed.seq;
    }
  }

  const BATCH = 100;
  let processed = 0, updated = 0, errors = 0, skippedNoParent = 0;
  const ops = [];

  const cursor = Asset.find(childQuery).sort({ createdAt: 1 }).cursor();
  for await (const child of cursor) {
    processed++;

    const parent = await Asset.findOne({ assetId: child.parentId }, { assetCode: 1, assetId: 1 }).lean();
    if (!parent || !parent.assetCode) {
      console.log(`  [${String(processed).padStart(4)}] ${child.assetId} → SKIPPED — parent "${child.parentId}" missing or has no base code (run step 1 first)`);
      skippedNoParent++;
      continue;
    }

    const nextSeq = (parentSeqCounters[parent.assetCode] || 0) + 1;
    parentSeqCounters[parent.assetCode] = nextSeq;
    const childCode = AssetCodeIndex.buildChildCode({ parentCode: parent.assetCode, seq: nextSeq });

    console.log(`  [${String(processed).padStart(4)}] ${(child.assetId || '').padEnd(12)} → ${childCode}`);

    if (!DRY_RUN) {
      ops.push({ updateOne: { filter: { _id: child._id }, update: { $set: { assetCode: childCode } } } });
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

  console.log(`\nStep 2 — processed ${processed}, updated ${updated}, skipped (no parent code) ${skippedNoParent}, errors ${errors}`);
}

async function step3_inspectionCodes() {
  console.log('\n── STEP 3 — Inspection visit codes (already-Approved) ─\n');

  const query = FORCE
    ? { status: 'Approved' }
    : { status: 'Approved', $or: [{ inspectionCode: { $exists: false } }, { inspectionCode: null }] };

  const total = await Inspection.countDocuments(query);
  console.log(`Found ${total} Approved inspection(s) needing a visit code\n`);
  if (total === 0) return;

  // Group by asset so each asset's visits can be numbered chronologically
  // from its own history, not global creation order.
  const all = await Inspection.find(query, { assetId: 1, reviewedAt: 1, createdAt: 1 }).lean();
  const byAsset = {};
  for (const insp of all) {
    (byAsset[insp.assetId] = byAsset[insp.assetId] || []).push(insp);
  }

  // Any ALREADY-coded approved inspections count toward the starting visit
  // number for their asset, so a partial/previous run doesn't renumber or
  // collide with codes that already exist.
  const alreadyCoded = await Inspection.find(
    { status: 'Approved', inspectionCode: { $exists: true, $ne: null } },
    { assetId: 1, visitSeq: 1 }
  ).lean();
  const startingSeq = {};
  for (const insp of alreadyCoded) {
    if (!startingSeq[insp.assetId] || (insp.visitSeq || 0) > startingSeq[insp.assetId]) {
      startingSeq[insp.assetId] = insp.visitSeq || 0;
    }
  }

  const BATCH = 100;
  let processed = 0, updated = 0, errors = 0, skippedNoAssetCode = 0;
  const ops = [];
  const assetCountBumps = {}; // assetId -> final inspectionCount

  for (const assetId of Object.keys(byAsset)) {
    const asset = await Asset.findOne({ assetId }, { assetCode: 1 }).lean();
    if (!asset || !asset.assetCode) {
      console.log(`  SKIPPED — asset "${assetId}" missing or has no base/child code yet (run steps 1–2 first)`);
      skippedNoAssetCode += byAsset[assetId].length;
      continue;
    }

    // Chronological — oldest approval first, since that's the order the
    // visits actually happened in the real world.
    const sorted = byAsset[assetId].slice().sort((a, b) =>
      new Date(a.reviewedAt || a.createdAt) - new Date(b.reviewedAt || b.createdAt));

    let seq = startingSeq[assetId] || 0;
    for (const insp of sorted) {
      processed++;
      seq += 1;
      const inspectionCode = AssetCodeIndex.buildInspectionCode({ assetCode: asset.assetCode, visitSeq: seq });
      console.log(`  [${String(processed).padStart(4)}] ${assetId} visit ${seq} → ${inspectionCode}`);

      if (!DRY_RUN) {
        ops.push({ updateOne: { filter: { _id: insp._id }, update: { $set: { visitSeq: seq, inspectionCode } } } });
      }
    }
    assetCountBumps[assetId] = seq;
  }

  if (!DRY_RUN) {
    for (let i = 0; i < ops.length; i += BATCH) {
      try { await Inspection.bulkWrite(ops.slice(i, i + BATCH), { ordered: false }); updated += Math.min(BATCH, ops.length - i); }
      catch (e) { console.error(`  ✗ Batch write error: ${e.message}`); errors++; }
    }

    // Bring each asset's cached inspectionCount in line with its real total.
    const countOps = Object.entries(assetCountBumps).map(([assetId, count]) => ({
      updateOne: { filter: { assetId }, update: { $set: { inspectionCount: count } } },
    }));
    for (let i = 0; i < countOps.length; i += BATCH) {
      try { await Asset.bulkWrite(countOps.slice(i, i + BATCH), { ordered: false }); }
      catch (e) { console.error(`  ✗ inspectionCount batch write error: ${e.message}`); errors++; }
    }
  } else {
    updated = processed;
  }

  console.log(`\nStep 3 — processed ${processed}, updated ${updated}, skipped (no asset code) ${skippedNoAssetCode}, errors ${errors}`);
}

async function run() {
  hr();
  console.log('  FPAMAS — Asset Coding v2 Migration');
  if (DRY_RUN) console.log('  MODE: DRY RUN (no writes)');
  if (FORCE)   console.log('  MODE: FORCE (re-generate existing codes)');
  if (SKIP_INSPECTIONS) console.log('  MODE: SKIP INSPECTIONS (steps 1–2 only)');
  hr();

  await mongoose.connect(MONGO_URI);
  console.log(`\n✓ Connected to MongoDB: ${MONGO_URI}`);

  _mdaList = await Mda.find({ active: true }, { name: 1, shortName: 1 }).lean();
  console.log(`✓ Loaded ${_mdaList.length} MDAs`);

  await step1_baseCodes();
  await step2_childCodes();
  if (!SKIP_INSPECTIONS) await step3_inspectionCodes();

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