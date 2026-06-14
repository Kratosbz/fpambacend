'use strict';
const sharp = require('sharp');
const exifr = require('exifr');
const { Readable } = require('stream');
const { getBuckets } = require('../config/gridfs');
const { Types } = require('mongoose');

const THUMB_SIZE = 300;
const MAX_DIM    = 2048;

/**
 * Process and store a photo in GridFS.
 * Returns { fileId, thumbFileId, filename, sizeBytes, gpsCoords }
 */
async function storePhoto(file, assetId, uploadedBy) {
  const buckets = getBuckets();
  const bucket  = buckets.photos;

  // Extract GPS before stripping EXIF
  let gpsCoords = null;
  try {
    const gps = await exifr.gps(file.buffer);
    if (gps && gps.longitude && gps.latitude) {
      gpsCoords = [gps.longitude, gps.latitude];  // GeoJSON order
    }
  } catch (_) { /* no GPS data */ }

  // Resize + convert to JPEG
  const processed = await sharp(file.buffer)
    .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const thumbnail = await sharp(file.buffer)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
    .jpeg({ quality: 70 })
    .toBuffer();

  const fileId  = new Types.ObjectId();
  const thumbId = new Types.ObjectId();
  const fname   = `${assetId}_${Date.now()}.jpg`;

  const metadata = { assetId, fileType: 'photo', uploadedBy, mimeType: 'image/jpeg', originalName: file.originalname };

  await uploadBuffer(bucket, fileId,  fname,              processed,  metadata);
  await uploadBuffer(bucket, thumbId, `thumb_${fname}`,   thumbnail,  { ...metadata, fileType: 'photo_thumb' });

  return {
    fileId,
    thumbFileId: thumbId,
    filename:    fname,
    sizeBytes:   processed.length,
    gpsCoords,
  };
}

function uploadBuffer(bucket, id, filename, buffer, metadata) {
  return new Promise((resolve, reject) => {
    const stream = bucket.openUploadStreamWithId(id, filename, { metadata });
    Readable.from(buffer).pipe(stream)
      .on('finish', resolve)
      .on('error', reject);
  });
}

async function streamPhoto(fileId, res) {
  const bucket = getBuckets().photos;
  const files = await bucket.find({ _id: new Types.ObjectId(fileId) }).toArray();
  if (!files.length) return null;

  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  bucket.openDownloadStream(new Types.ObjectId(fileId)).pipe(res);
  return true;
}

async function deletePhoto(fileId) {
  const bucket = getBuckets().photos;
  await bucket.delete(new Types.ObjectId(fileId));
}

module.exports = { storePhoto, streamPhoto, deletePhoto };
