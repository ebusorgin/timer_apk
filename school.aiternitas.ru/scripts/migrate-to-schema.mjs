import 'dotenv/config';
import pg from 'pg';
import { ensureSchema } from '../server/persistence/postgresAdapter.mjs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const SCHEMA = 'school_aiternitas_ru';

async function migrate() {
  await ensureSchema(pool, console);

  const client = await pool.connect();
  try {
    const count = await client.query(`SELECT COUNT(*) as c FROM ${SCHEMA}.users`);
    if (Number(count.rows[0]?.c ?? 0) > 0) {
      console.log('Schema already has data, skip migrate from public');
      return;
    }

    for (const table of ['users', 'programs', 'enrollments']) {
      try {
        const { rows } = await client.query(`SELECT COUNT(*) as c FROM public.${table}`);
        if (Number(rows[0]?.c ?? 0) === 0) continue;

        const { rows: cols } = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [table]);
        const colList = cols.map(r => r.column_name).join(', ');

        await client.query(`INSERT INTO ${SCHEMA}.${table} (${colList}) SELECT ${colList} FROM public.${table} ON CONFLICT DO NOTHING`);
        console.log(`Migrated public.${table} -> ${SCHEMA}.${table}`);
      } catch (e) {
        if (e.code === '42P01') continue;
        console.warn(e.message);
      }
    }
    console.log('Migration done');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
