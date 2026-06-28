/**
 * fix_ids.js — direct delete of string-_id docs
 * The ObjectId versions already exist from previous runs.
 * Just wipe the string-_id duplicates.
 *
 * node fix_ids.js
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME   = 'assetspatial';
const COL       = 'assets';

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const col = client.db(DB_NAME).collection(COL);

  // deleteMany where _id is a string (BSON type 2 = string)
  const result = await col.deleteMany({
    _id: { $type: 'string' }
  });

  await client.close();

  console.log(`
┌──────────────────────────────────────┐
│  Fix Complete                        │
├──────────────────────────────────────┤
│  String-_id docs deleted: ${String(result.deletedCount).padEnd(12)}│
└──────────────────────────────────────┘
Done. All remaining assets have proper ObjectId _ids.
`);
}

run().catch(console.error);