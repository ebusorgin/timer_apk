import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@school.aiternitas.ru';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Администратор';

if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const SCHEMA = 'school_aiternitas_ru';
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

await pool.query(
  `INSERT INTO ${SCHEMA}.users (email, name, password_hash, role, created_at, updated_at)
   VALUES ($1, $2, $3, 'admin', $4, $4)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'`,
  [ADMIN_EMAIL.toLowerCase(), ADMIN_NAME, hash, Date.now()]
);

console.log('Admin created:', ADMIN_EMAIL);
await pool.end();
