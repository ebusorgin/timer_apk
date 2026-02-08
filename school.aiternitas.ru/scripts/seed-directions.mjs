import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const SCHEMA = 'school_aiternitas_ru';

const DEFAULT_DIRECTIONS = [
  'программирование', 'математика', 'логика', 'творчество', 'робототехника',
  'микроконтроллеры', 'нейросети', 'радиотехника', 'алгоритмы',
  'рисование', 'живопись', 'графика', 'декоративно-прикладное искусство', 'дизайн',
];

const pool = new pg.Pool({ connectionString: DATABASE_URL });

for (let i = 0; i < DEFAULT_DIRECTIONS.length; i++) {
  await pool.query(
    `INSERT INTO ${SCHEMA}.directions (name, sort_order) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
    [DEFAULT_DIRECTIONS[i], i]
  );
  console.log('Seeded direction:', DEFAULT_DIRECTIONS[i]);
}

await pool.end();
console.log('Directions seed done');
