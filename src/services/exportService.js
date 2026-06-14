'use strict';
const ExcelJS = require('exceljs');
const Asset   = require('../models/Asset');

const ASSET_FIELDS = ['assetId','name','type','geomType','condition','material','state','lga','address','status','captureDate','createdAt'];

/**
 * Stream CSV directly to response. Handles 100k+ assets.
 */
async function streamCSV(res, scopeFilter = {}, extraFilter = {}) {
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="assets_export.csv"');

  const headers = [...ASSET_FIELDS, 'lat', 'lng', 'notes', 'valuation_NGN'];
  res.write(headers.join(',') + '\n');

  const cursor = Asset.find({ ...scopeFilter, ...extraFilter }).cursor();
  for await (const asset of cursor) {
    const [lng, lat] = asset.location?.coordinates || [null, null];
    const row = [
      ...ASSET_FIELDS.map((f) => csvCell(asset[f])),
      lat, lng,
      csvCell(asset.notes),
      asset.valuation?.amount || '',
    ];
    res.write(row.join(',') + '\n');
  }
  res.end();
}

/**
 * Stream GeoJSON FeatureCollection. Compatible with QGIS / ArcGIS.
 */
async function streamGeoJSON(res, scopeFilter = {}, extraFilter = {}) {
  res.set('Content-Type', 'application/geo+json');
  res.set('Content-Disposition', 'attachment; filename="assets_export.geojson"');

  res.write('{"type":"FeatureCollection","features":[\n');
  let first = true;
  const cursor = Asset.find({ ...scopeFilter, ...extraFilter }).cursor();
  for await (const asset of cursor) {
    const feature = {
      type: 'Feature',
      geometry: asset.geometry || {
        type: 'Point',
        coordinates: asset.location?.coordinates || [0, 0],
      },
      properties: {
        assetId:   asset.assetId,
        name:      asset.name,
        type:      asset.type,
        condition: asset.condition,
        state:     asset.state,
        lga:       asset.lga,
        status:    asset.status,
      },
    };
    res.write((first ? '' : ',\n') + JSON.stringify(feature));
    first = false;
  }
  res.write('\n]}');
  res.end();
}

/**
 * Stream XLSX — one sheet per asset type.
 */
async function streamXLSX(res, scopeFilter = {}, extraFilter = {}) {
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', 'attachment; filename="assets_export.xlsx"');

  const wb      = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
  const types   = ['Infrastructure', 'Land / Property', 'Utility', 'Environmental', 'Equipment'];

  for (const type of types) {
    const ws = wb.addWorksheet(type);
    ws.columns = [
      { header: 'Asset ID', key: 'assetId', width: 12 },
      { header: 'Name',     key: 'name',    width: 30 },
      { header: 'Condition',key: 'condition',width: 12 },
      { header: 'State',    key: 'state',   width: 14 },
      { header: 'LGA',      key: 'lga',     width: 14 },
      { header: 'Status',   key: 'status',  width: 16 },
      { header: 'Latitude', key: 'lat',     width: 12 },
      { header: 'Longitude',key: 'lng',     width: 12 },
    ];

    const cursor = Asset.find({ ...scopeFilter, ...extraFilter, type }).cursor();
    for await (const asset of cursor) {
      const [lng, lat] = asset.location?.coordinates || [null, null];
      ws.addRow({ assetId: asset.assetId, name: asset.name, condition: asset.condition,
        state: asset.state, lga: asset.lga, status: asset.status, lat, lng }).commit();
    }
    await ws.commit();
  }

  await wb.commit();
}

function csvCell(val) {
  if (val == null) return '';
  const str = String(val instanceof Date ? val.toISOString() : val);
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

module.exports = { streamCSV, streamGeoJSON, streamXLSX };
