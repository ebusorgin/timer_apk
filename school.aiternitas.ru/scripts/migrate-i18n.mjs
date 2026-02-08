#!/usr/bin/env node
/**
 * Migration: add i18n columns (ru/sr/en) for programs and school_types
 * Copies existing title/description/curriculum to *_ru (and *_sr, *_en as fallback)
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
  // programs: add i18n columns
  for (const col of ['title_ru', 'title_sr', 'title_en', 'description_ru', 'description_sr', 'description_en']) {
    await pool.query(`ALTER TABLE ${SCHEMA}.programs ADD COLUMN IF NOT EXISTS ${col} TEXT`);
  }
  for (const col of ['curriculum_ru', 'curriculum_sr', 'curriculum_en']) {
    await pool.query(`ALTER TABLE ${SCHEMA}.programs ADD COLUMN IF NOT EXISTS ${col} JSONB`);
  }
  // Migrate existing data: title -> title_ru/sr/en, etc.
  await pool.query(`
    UPDATE ${SCHEMA}.programs SET
      title_ru = COALESCE(title_ru, title),
      title_sr = COALESCE(title_sr, title),
      title_en = COALESCE(title_en, title),
      description_ru = COALESCE(description_ru, description),
      description_sr = COALESCE(description_sr, description),
      description_en = COALESCE(description_en, description),
      curriculum_ru = COALESCE(curriculum_ru, curriculum),
      curriculum_sr = COALESCE(curriculum_sr, curriculum),
      curriculum_en = COALESCE(curriculum_en, curriculum)
    WHERE title_ru IS NULL OR description_ru IS NULL
  `);

  // school_types: add i18n columns
  for (const col of ['title_ru', 'title_sr', 'title_en', 'description_ru', 'description_sr', 'description_en']) {
    await pool.query(`ALTER TABLE ${SCHEMA}.school_types ADD COLUMN IF NOT EXISTS ${col} TEXT`);
  }
  await pool.query(`
    UPDATE ${SCHEMA}.school_types SET
      title_ru = COALESCE(title_ru, title),
      title_sr = COALESCE(title_sr, title),
      title_en = COALESCE(title_en, title),
      description_ru = COALESCE(description_ru, description),
      description_sr = COALESCE(description_sr, description),
      description_en = COALESCE(description_en, description)
    WHERE title_ru IS NULL
  `);

  console.log('i18n migration done');
} catch (err) {
  console.error('Migration error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
