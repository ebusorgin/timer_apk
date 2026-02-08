import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const SCHEMA = 'school_aiternitas_ru';

const DEFAULT_SCHOOL_TYPES = [
  { id: 'art', title: 'Художественная школа', sort_order: 0, description: 'Рисование, живопись, графика, декоративно-прикладное искусство, дизайн' },
  { id: 'tech', title: 'Техническое направление', sort_order: 1, description: 'Программирование, робототехника, микроконтроллеры, нейросети, радиотехника' },
];

const pool = new pg.Pool({ connectionString: DATABASE_URL });

for (const st of DEFAULT_SCHOOL_TYPES) {
  await pool.query(
    `INSERT INTO ${SCHEMA}.school_types (id, title, sort_order, description)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, sort_order = EXCLUDED.sort_order, description = EXCLUDED.description`,
    [st.id, st.title, st.sort_order, st.description || '']
  );
  console.log('Seeded school type:', st.title);
}

await pool.end();
console.log('School types seed done');
