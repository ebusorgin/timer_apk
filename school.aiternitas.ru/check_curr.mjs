import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query("SELECT id, title, curriculum, curriculum_ru FROM school_aiternitas_ru.programs WHERE id = 13");
console.log(JSON.stringify(rows[0], null, 2));
await pool.end();
