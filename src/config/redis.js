'use strict';
const env = require('./env');

let _client   = null;
let _available = false;

function getRedis() {
  if (_client) return _client;

  let Redis;
  try { Redis = require('ioredis'); } catch { return null; }

  _client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
    lazyConnect:          true,   // don't connect until .connect() is called
    retryStrategy:        () => null, // never retry — fail silently
  });

  _client.on('connect', () => { console.log('[Redis] Connected'); _available = true; });

  // Swallow ALL errors — Redis is optional
  _client.on('error', () => { _available = false; });
  _client.on('close', () => { _available = false; });
  _client.on('end',   () => { _available = false; });

  // Attempt connection once — if it fails, _available stays false and we move on
  _client.connect().catch(() => { _available = false; });

  return _client;
}

function isRedisAvailable() { return _available; }

module.exports = { getRedis, isRedisAvailable };
