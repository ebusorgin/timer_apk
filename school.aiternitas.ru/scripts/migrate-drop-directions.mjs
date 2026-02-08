#!/usr/bin/env node
/**
 * Migration: remove directions - hierarchy is School Type -> Programs only
 * Drops directions table and direction/directions columns from programs
 */
import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const SCHEMA = 'school_aiternitas_ru';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

try {
  await pool.query(`DROP TABLE IF EXISTS ${SCHEMA}.directions`);
  for (const col of ['direction', 'directions']) {
    try {
      await pool.query(`ALTER TABLE ${SCHEMA}.programs DROP COLUMN ${col}`);
    } catch (e) {
      if (e.code !== '42703') throw e; // 42703 = undefined_column
    }
  }
  console.log('Dropped directions table and direction/directions columns from programs');
} catch (err) {
  console.error('Migration error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
