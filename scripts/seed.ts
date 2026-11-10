#!/usr/bin/env tsx
/**
 * scripts/seed.ts
 *
 * Seeds the database with baseline data for local development and testing:
 * - Admin user
 * - Sample problem setter user
 * - 3 sample problems with test cases uploaded to MinIO
 *
 * Usage: npx tsx scripts/seed.ts
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

console.log('[seed] Seeding local development database...');
console.log('[seed] DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'));

async function seed() {
  console.log('[seed] Seed data:');
  console.log('  → Admin user:   admin@judge.local / admin1234');
  console.log('  → Setter user:  setter@judge.local / setter1234');
  console.log('  → 3 sample problems with test cases\n');

  // This script will be expanded once pg/drizzle client is integrated.
  // For now, it validates the environment and scaffolds the structure.
  console.log('[seed] ✅ Seed scaffold ready. Connect DB client to execute.');
}

seed().catch((err) => {
  console.error('[seed] ❌ Seed failed:', err);
  process.exit(1);
});
