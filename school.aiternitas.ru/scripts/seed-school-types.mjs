import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const SCHEMA = 'school_aiternitas_ru';

const DEFAULT_SCHOOL_TYPES = [
  { id: 'tech', title: 'Техническая школа', sort_order: 0 },
  { id: 'art', title: 'Художественная школа', sort_order: 1 },
];

const pool = new pg.Pool({ connectionString: DATABASE_URL });

for (const st of DEFAULT_SCHOOL_TYPES) {
  await pool.query(
    `INSERT INTO ${SCHEMA}.school_types (id, title, sort_order)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, sort_order = EXCLUDED.sort_order`,
    [st.id, st.title, st.sort_order]
  );
  console.log('Seeded school type:', st.title);
}

await pool.end();
console.log('School types seed done');
