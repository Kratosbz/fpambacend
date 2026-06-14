'use strict';
/**
 * Migration runner — run migrations in order, track applied ones in a
 * `_migrations` collection so each runs exactly once.
 *
 * Usage:
 *   node scripts/migrate.js            # run all pending
 *   node scripts/migrate.js --dry-run  # list pending without running
 */
require('dotenv').config();
const mongoose  = require('mongoose');
const path      = require('path');
const fs        = require('fs');
const env       = require('../src/config/env');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const migrationSchema = new mongoose.Schema({
  name:      { type: String, unique: true },
  appliedAt: { type: Date, default: Date.now },
});
const Migration = mongoose.model('_Migration', migrationSchema);

async function run() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  console.log('Connected to MongoDB');

  const dryRun = process.argv.includes('--dry-run');

  // List migration files
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort();

  const applied = new Set(
    (await Migration.find({}, { name: 1 }).lean()).map((m) => m.name)
  );

  const pending = files.filter((f) => !applied.has(f));

  if (!pending.length) {
    console.log('No pending migrations.');
    process.exit(0);
  }

  console.log(`Pending migrations: ${pending.join(', ')}`);
  if (dryRun) {
    console.log('Dry run — nothing executed.');
    process.exit(0);
  }

  for (const file of pending) {
    const migration = require(path.join(MIGRATIONS_DIR, file));
    console.log(`Running ${file}…`);
    await migration.up(mongoose.connection.db);
    await Migration.create({ name: file });
    console.log(`✓ ${file} applied`);
  }

  console.log('All migrations complete.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
