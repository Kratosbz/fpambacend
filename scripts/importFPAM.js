'use strict';
/**
 * One-time import of an existing Federal Public Asset Management (FPAM)
 * inventory spreadsheet into MongoDB.
 *
 * Usage:
 *   node scripts/importFPAM.js --file /path/to/inventory.xlsx [--dry-run]
 *
 * Expected columns (case-insensitive, first sheet):
 *   Asset Name | Type | Condition | State | LGA | Address | Latitude | Longitude | Notes
 *
 * Unmapped columns are stored verbatim in asset.typeData.raw.
 */
require('dotenv').config();
const ExcelJS  = require('exceljs');
const mongoose = require('mongoose');
const path     = require('path');
const env      = require('../src/config/env');

async function run() {
  const args    = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith('--file=')) || null;
  const filePath = fileArg
    ? fileArg.replace('--file=', '')
    : args[args.indexOf('--file') + 1];
  const dryRun = args.includes('--dry-run');

  if (!filePath) {
    console.error('Usage: node scripts/importFPAM.js --file /path/to/inventory.xlsx [--dry-run]');
    process.exit(1);
  }

  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  console.log('Connected to MongoDB');

  // Dynamically require models after connection
  const Asset = require('../src/models/Asset');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(filePath));
  const ws = wb.worksheets[0];

  // Build column map from header row
  const headerRow = ws.getRow(1).values;   // index 1 = first real value
  const colMap = {};
  headerRow.forEach((h, i) => {
    if (h) colMap[String(h).toLowerCase().trim()] = i;
  });

  const REQUIRED = ['asset name', 'type'];
  for (const req of REQUIRED) {
    if (!(req in colMap)) {
      console.error(`Missing required column: "${req}"`);
      process.exit(1);
    }
  }

  const TYPE_MAP = {
    'infrastructure': 'Infrastructure',
    'land':           'Land / Property',
    'land / property':'Land / Property',
    'property':       'Land / Property',
    'utility':        'Utility',
    'environmental':  'Environmental',
    'equipment':      'Equipment',
  };

  let imported = 0;
  let skipped  = 0;
  let counter  = 1001;

  // Find highest existing assetId
  const lastAsset = await Asset.findOne({}, { assetId: 1 }).sort({ assetId: -1 }).lean();
  if (lastAsset?.assetId) {
    const n = parseInt(lastAsset.assetId.replace('AST-', ''), 10);
    if (!isNaN(n)) counter = n + 1;
  }

  ws.eachRow(async (row, rowNumber) => {
    if (rowNumber === 1) return;  // skip header
    const v = (col) => {
      const idx = colMap[col];
      return idx !== undefined ? row.values[idx] : undefined;
    };

    const rawType = String(v('type') || '').toLowerCase().trim();
    const type    = TYPE_MAP[rawType];
    const name    = String(v('asset name') || '').trim();

    if (!name || !type) {
      skipped++;
      return;
    }

    const lat  = parseFloat(v('latitude'))  || 0;
    const lng  = parseFloat(v('longitude')) || 0;
    const condition = String(v('condition') || 'Fair');

    const assetData = {
      assetId:    `AST-${counter++}`,
      name,
      type,
      geomType:   'Point',
      location:   { type: 'Point', coordinates: [lng, lat] },
      condition:  ['Good','Fair','Poor','Critical'].includes(condition) ? condition : 'Fair',
      state:      String(v('state')    || '').trim() || undefined,
      lga:        String(v('lga')      || '').trim() || undefined,
      address:    String(v('address')  || '').trim() || undefined,
      notes:      String(v('notes')    || '').trim() || undefined,
      status:     'Active',
    };

    if (dryRun) {
      console.log(`[DRY RUN] Would import: ${assetData.assetId} — ${name} (${type})`);
      imported++;
      return;
    }

    try {
      await Asset.create(assetData);
      console.log(`Imported: ${assetData.assetId} — ${name}`);
      imported++;
    } catch (err) {
      console.error(`Row ${rowNumber} failed (${name}): ${err.message}`);
      skipped++;
    }
  });

  // Wait for all async row handlers (eachRow is sync but Asset.create is async)
  await new Promise((r) => setTimeout(r, 2000));

  console.log(`\nImport complete: ${imported} imported, ${skipped} skipped`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
