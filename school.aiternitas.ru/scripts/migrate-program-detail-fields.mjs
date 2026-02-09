import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const SCHEMA = 'school_aiternitas_ru';
const schema = (t) => `${SCHEMA}.${t}`;

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function migrate() {
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS level TEXT DEFAULT 'beginner'`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS skills_ru TEXT`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS skills_sr TEXT`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS skills_en TEXT`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS target_audience_ru TEXT`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS target_audience_sr TEXT`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS target_audience_en TEXT`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS faq JSONB`);
  await pool.query(`CREATE INDEX IF NOT EXISTS programs_level_idx ON ${schema('programs')}(level)`);

  console.log('Program detail fields migration done');
}

migrate()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
