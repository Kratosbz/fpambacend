'use strict';
const mongoose = require('mongoose');
const env = require('./env');

let _conn = null;

async function connectDB() {
  if (_conn) return _conn;

  mongoose.set('strictQuery', true);

  _conn = await mongoose.connect(env.MONGO_URI, {
    dbName: env.MONGO_DB_NAME,
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  console.log(`[MongoDB] Connected → ${env.MONGO_URI}`);

  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected — will retry');
  });

  return _conn;
}

function getDB() {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return mongoose.connection.db;
}

module.exports = { connectDB, getDB };
