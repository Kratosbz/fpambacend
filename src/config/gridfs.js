'use strict';
const { GridFSBucket } = require('mongodb');
const { getDB } = require('./db');
const env = require('./env');

let buckets = null;

function getBuckets() {
  if (buckets) return buckets;
  const db = getDB();
  buckets = {
    photos:    new GridFSBucket(db, { bucketName: env.GRIDFS_BUCKET_PHOTOS }),
    documents: new GridFSBucket(db, { bucketName: env.GRIDFS_BUCKET_DOCUMENTS }),
    excel:     new GridFSBucket(db, { bucketName: env.GRIDFS_BUCKET_EXCEL }),
  };
  return buckets;
}

module.exports = { getBuckets };
