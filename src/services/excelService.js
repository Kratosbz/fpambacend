'use strict';
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const { getBuckets } = require('../config/gridfs');
const { Types } = require('mongoose');

/**
 * Store raw Excel file in GridFS and parse column headers + row count.
 */
async function storeExcel(file, assetId, uploadedBy) {
  const bucket = getBuckets().excel;
  const fileId = new Types.ObjectId();
  const fname  = `${assetId}_${Date.now()}_${file.originalname}`;

  const metadata = {
    assetId,
    fileType:     'excel',
    uploadedBy,
    mimeType:     file.mimetype,
    originalName: file.originalname,
  };

  // Upload raw file
  await new Promise((resolve, reject) => {
    const stream = bucket.openUploadStreamWithId(fileId, fname, { metadata });
    Readable.from(file.buffer).pipe(stream).on('finish', resolve).on('error', reject);
  });

  // Parse headers and row count
  const { columns, rowCount } = await parseHeaders(file.buffer);

  return { fileId, filename: fname, columns, rowCount };
}

async function parseHeaders(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { columns: [], rowCount: 0 };

  const headerRow = ws.getRow(1).values.filter(Boolean);
  return { columns: headerRow.map(String), rowCount: ws.rowCount - 1 };
}

/**
 * Return first `limit` rows as JSON array.
 */
async function previewExcel(fileId, limit = 100) {
  const bucket = getBuckets().excel;
  const chunks = [];
  const stream = bucket.openDownloadStream(new Types.ObjectId(fileId));

  await new Promise((resolve, reject) => {
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  const buffer = Buffer.concat(chunks);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headers = ws.getRow(1).values.slice(1);
  const rows = [];
  ws.eachRow((row, i) => {
    if (i === 1 || rows.length >= limit) return;
    const obj = {};
    row.values.slice(1).forEach((v, idx) => { obj[headers[idx]] = v; });
    rows.push(obj);
  });
  return rows;
}

async function streamExcel(fileId, res) {
  const bucket = getBuckets().excel;
  const files = await bucket.find({ _id: new Types.ObjectId(fileId) }).toArray();
  if (!files.length) return null;
  const f = files[0];
  res.set('Content-Type', f.metadata?.mimeType || 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename="${f.metadata?.originalName || f.filename}"`);
  bucket.openDownloadStream(new Types.ObjectId(fileId)).pipe(res);
  return true;
}

async function deleteExcel(fileId) {
  await getBuckets().excel.delete(new Types.ObjectId(fileId));
}

module.exports = { storeExcel, previewExcel, streamExcel, deleteExcel };
