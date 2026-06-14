'use strict';
const multer = require('multer');
const env = require('../config/env');

// Use memory storage — services handle the actual GridFS write
// This avoids multer-gridfs-storage compatibility issues with MongoDB 6+

const MB = 1024 * 1024;

function createUploader(maxSizeMB, allowedMimes) {
  return multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: maxSizeMB * MB },
    fileFilter: (_req, file, cb) => {
      if (!allowedMimes || allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} not allowed`), false);
      }
    },
  });
}

const photoUploader = createUploader(env.MAX_PHOTO_SIZE_MB, [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/tiff',
]);

const documentUploader = createUploader(env.MAX_DOCUMENT_SIZE_MB, [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const excelUploader = createUploader(env.MAX_EXCEL_SIZE_MB, [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]);

const ocrUploader = createUploader(env.MAX_PHOTO_SIZE_MB, [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/tiff',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

module.exports = { photoUploader, documentUploader, excelUploader, ocrUploader };
