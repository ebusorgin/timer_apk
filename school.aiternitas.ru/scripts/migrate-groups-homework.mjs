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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema('groups')} (
      id BIGSERIAL PRIMARY KEY,
      program_id BIGINT NOT NULL REFERENCES ${schema('programs')}(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      schedule TEXT NOT NULL DEFAULT '',
      max_students INT DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'active',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS groups_program_id_idx ON ${schema('groups')}(program_id)`);

  await pool.query(`ALTER TABLE ${schema('enrollments')} ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES ${schema('groups')}(id) ON DELETE SET NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS enrollments_group_id_idx ON ${schema('enrollments')}(group_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema('homework')} (
      id BIGSERIAL PRIMARY KEY,
      group_id BIGINT NOT NULL REFERENCES ${schema('groups')}(id) ON DELETE CASCADE,
      lesson_n INT NOT NULL DEFAULT 1,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      due_at BIGINT,
      created_at BIGINT NOT NULL
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS homework_group_id_idx ON ${schema('homework')}(group_id)`);

  console.log('Groups and homework migration done');
}

migrate()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
