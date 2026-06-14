'use strict';
require('dotenv').config();
const { connectDB } = require('../src/config/db');
const User       = require('../src/models/User');
const RoleConfig = require('../src/models/RoleConfig');
const Settings   = require('../src/models/Settings');

async function seed() {
  await connectDB();
  console.log('Connected to MongoDB');

  // ── Seed RoleConfig defaults ──────────────────────────────────────────────
  const FACTORY = RoleConfig.FACTORY_DEFAULTS;
  for (const [role, defaults] of Object.entries(FACTORY)) {
    await RoleConfig.findOneAndUpdate(
      { role },
      { $setOnInsert: { role, defaults } },
      { upsert: true }
    );
    console.log(`RoleConfig seeded: ${role}`);
  }

  // ── Seed default System Admin ─────────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@assetspatial.gov.ng';
  const adminPass  = process.env.SEED_ADMIN_PASS  || 'ChangeMe123!';

  const existing = await User.findOne({ email: adminEmail });
  if (existing) {
    console.log(`Admin already exists: ${adminEmail}`);
  } else {
    await User.create({
      name:     'System Administrator',
      email:    adminEmail,
      role:     'System Admin',
      password: adminPass,
      color:    '#DC2626',
      states:   [],
    });
    console.log(`System Admin created: ${adminEmail} / ${adminPass}`);
    console.log('IMPORTANT: Change the admin password after first login!');
  }

  // ── Seed platform settings singleton ─────────────────────────────────────
  await Settings.findOneAndUpdate(
    { _singleton: 'global' },
    { $setOnInsert: { _singleton: 'global' } },
    { upsert: true }
  );
  console.log('Settings singleton ready');

  console.log('Seed complete');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
