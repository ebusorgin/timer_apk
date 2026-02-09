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
    CREATE TABLE IF NOT EXISTS ${schema('announcements')} (
      id BIGSERIAL PRIMARY KEY,
      group_id BIGINT REFERENCES ${schema('groups')}(id) ON DELETE CASCADE,
      program_id BIGINT REFERENCES ${schema('programs')}(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      author_id BIGINT REFERENCES ${schema('users')}(id) ON DELETE SET NULL,
      created_at BIGINT NOT NULL
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS announcements_group_id_idx ON ${schema('announcements')}(group_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS announcements_program_id_idx ON ${schema('announcements')}(program_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS announcements_created_at_idx ON ${schema('announcements')}(created_at DESC)`);

  console.log('Announcements migration done');
}

migrate()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
