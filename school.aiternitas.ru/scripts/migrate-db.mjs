import 'dotenv/config';
import pg from 'pg';
import { ensureSchema } from '../server/persistence/postgresAdapter.mjs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
await ensureSchema(pool, console);
console.log('Migration done');
await pool.end();
