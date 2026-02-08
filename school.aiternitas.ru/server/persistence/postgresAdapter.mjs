import { Pool } from 'pg';

const SCHEMA = 'school_aiternitas_ru';
const schema = (table) => `${SCHEMA}.${table}`;

const normalizeId = (id) => {
  if (id == null) return null;
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
};

export async function ensureSchema(pool, logger) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema('users')} (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS users_email_idx ON ${schema('users')}(email)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS users_role_idx ON ${schema('users')}(role)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema('programs')} (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      age_min INT NOT NULL,
      age_max INT NOT NULL,
      duration_weeks INT NOT NULL,
      lessons_per_week INT DEFAULT 1,
      format TEXT,
      school_type TEXT DEFAULT 'tech',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS school_type TEXT DEFAULT 'tech'`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS price INTEGER`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS schedule TEXT`);
  await pool.query(`ALTER TABLE ${schema('programs')} ADD COLUMN IF NOT EXISTS curriculum JSONB`);
  await pool.query(`CREATE INDEX IF NOT EXISTS programs_age_idx ON ${schema('programs')}(age_min, age_max)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS programs_school_type_idx ON ${schema('programs')}(school_type)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema('enrollments')} (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES ${schema('users')}(id) ON DELETE CASCADE,
      program_id BIGINT NOT NULL REFERENCES ${schema('programs')}(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      progress INT DEFAULT 0,
      enrolled_at BIGINT NOT NULL,
      updated_at BIGINT,
      UNIQUE(user_id, program_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS enrollments_user_id_idx ON ${schema('enrollments')}(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS enrollments_program_id_idx ON ${schema('enrollments')}(program_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema('school_types')} (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      sort_order INT DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE ${schema('school_types')} ADD COLUMN IF NOT EXISTS description TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS school_types_sort_idx ON ${schema('school_types')}(sort_order)`);

  logger?.info?.('PostgreSQL schema school_aiternitas_ru ensured');
}

function userFromRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    email: row.email,
    name: row.name,
    role: row.role || 'student',
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function programFromRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: row.title,
    slug: row.slug,
    description: row.description,
    ageMin: row.age_min,
    ageMax: row.age_max,
    durationWeeks: row.duration_weeks,
    lessonsPerWeek: row.lessons_per_week ?? 1,
    format: row.format,
    schoolType: row.school_type || 'tech',
    imageUrl: row.image_url || null,
    price: row.price != null ? row.price : null,
    schedule: row.schedule || null,
    curriculum: row.curriculum || [],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function enrollmentFromRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    programId: String(row.program_id),
    status: row.status || 'active',
    progress: row.progress ?? 0,
    enrolledAt: Number(row.enrolled_at),
    updatedAt: row.updated_at ? Number(row.updated_at) : null,
  };
}

export function createPostgresAdapter(poolConfig, logger) {
  const pool = new Pool(poolConfig);
  const log = logger?.child?.({ scope: 'postgres' }) || logger || console;

  return {
    async ensureSchema() {
      return ensureSchema(pool, log);
    },

    async getUserByEmail(email) {
      const { rows } = await pool.query(
        `SELECT * FROM ${schema('users')} WHERE email = $1`,
        [email?.trim()?.toLowerCase()]
      );
      const row = rows[0];
      if (!row) return null;
      return {
        ...userFromRow(row),
        passwordHash: row.password_hash,
      };
    },

    async getUserById(id) {
      const nid = normalizeId(id);
      if (nid == null) return null;
      const { rows } = await pool.query(`SELECT * FROM ${schema('users')} WHERE id = $1`, [nid]);
      const row = rows[0];
      if (!row) return null;
      return {
        ...userFromRow(row),
        passwordHash: row.password_hash,
      };
    },

    async insertUser({ email, name, passwordHash, role = 'student' }) {
      const now = Date.now();
      const { rows } = await pool.query(
        `INSERT INTO ${schema('users')} (email, name, password_hash, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING id, email, name, role, created_at, updated_at`,
        [email?.trim()?.toLowerCase(), name?.trim(), passwordHash, role, now]
      );
      return userFromRow(rows[0]);
    },

    async getPrograms(filters = {}) {
      const { ageMin, ageMax, schoolType } = filters;
      let query = `SELECT * FROM ${schema('programs')} ORDER BY age_min, title`;
      const params = [];
      const conditions = [];

      if (ageMin != null) {
        params.push(ageMin);
        conditions.push(`age_max >= $${params.length}`);
      }
      if (ageMax != null) {
        params.push(ageMax);
        conditions.push(`age_min <= $${params.length}`);
      }
      if (schoolType) {
        params.push(schoolType);
        conditions.push(`school_type = $${params.length}`);
      }
      if (conditions.length) {
        query = `SELECT * FROM ${schema('programs')} WHERE ${conditions.join(' AND ')} ORDER BY age_min, title`;
      }

      const { rows } = await pool.query(query, params);
      return rows.map(programFromRow);
    },

    async getProgramById(id) {
      const nid = normalizeId(id);
      if (nid == null) return null;
      const { rows } = await pool.query(`SELECT * FROM ${schema('programs')} WHERE id = $1`, [nid]);
      return programFromRow(rows[0]);
    },

    async getProgramBySlug(slug) {
      const { rows } = await pool.query(`SELECT * FROM ${schema('programs')} WHERE slug = $1`, [slug]);
      return programFromRow(rows[0]);
    },

    async insertProgram(program) {
      const now = Date.now();
      const schoolType = program.schoolType ?? program.school_type ?? 'tech';
      const imageUrl = program.imageUrl ?? program.image_url ?? null;
      const price = program.price != null ? program.price : null;
      const schedule = program.schedule ?? null;
      const curriculum = program.curriculum ?? [];
      const { rows } = await pool.query(
        `INSERT INTO ${schema('programs')} (title, slug, description, age_min, age_max, duration_weeks, lessons_per_week, format, school_type, image_url, price, schedule, curriculum, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $14)
         RETURNING *`,
        [
          program.title,
          program.slug,
          program.description,
          program.ageMin ?? program.age_min,
          program.ageMax ?? program.age_max,
          program.durationWeeks ?? program.duration_weeks,
          program.lessonsPerWeek ?? program.lessons_per_week ?? 1,
          program.format || '',
          schoolType,
          imageUrl,
          price,
          schedule,
          JSON.stringify(curriculum),
          now,
        ]
      );
      return programFromRow(rows[0]);
    },

    async updateProgram(id, updates) {
      const nid = normalizeId(id);
      if (nid == null) return null;
      const now = Date.now();
      const fieldMap = {
        title: 'title', slug: 'slug', description: 'description',
        ageMin: 'age_min', age_min: 'age_min', ageMax: 'age_max', age_max: 'age_max',
        durationWeeks: 'duration_weeks', duration_weeks: 'duration_weeks',
        lessonsPerWeek: 'lessons_per_week', lessons_per_week: 'lessons_per_week',
        format: 'format', schoolType: 'school_type', school_type: 'school_type',
        imageUrl: 'image_url', image_url: 'image_url',
        price: 'price', schedule: 'schedule',
        curriculum: 'curriculum',
      };
      const setClauses = [];
      const values = [];
      let idx = 0;
      for (const [key, col] of Object.entries(fieldMap)) {
        const val = updates[key];
        if (val !== undefined) {
          idx++;
          setClauses.push(col === 'curriculum' ? `${col} = $${idx}::jsonb` : `${col} = $${idx}`);
          values.push(col === 'curriculum' ? JSON.stringify(val) : (Array.isArray(val) ? val : val));
        }
      }
      if (setClauses.length === 0) return this.getProgramById(id);
      idx++;
      setClauses.push(`updated_at = $${idx}`);
      values.push(now, nid);
      const { rows } = await pool.query(
        `UPDATE ${schema('programs')} SET ${setClauses.join(', ')} WHERE id = $${idx + 1} RETURNING *`,
        values
      );
      return programFromRow(rows[0]);
    },

    async deleteProgram(id) {
      const nid = normalizeId(id);
      if (nid == null) return false;
      const { rowCount } = await pool.query(`DELETE FROM ${schema('programs')} WHERE id = $1`, [nid]);
      return rowCount > 0;
    },

    async getEnrollmentsByUserId(userId) {
      const nid = normalizeId(userId);
      if (nid == null) return [];
      const { rows } = await pool.query(
        `SELECT e.*, p.title as program_title, p.slug as program_slug, p.school_type as program_school_type
         FROM ${schema('enrollments')} e
         JOIN ${schema('programs')} p ON p.id = e.program_id
         WHERE e.user_id = $1
         ORDER BY e.enrolled_at DESC`,
        [nid]
      );
      return rows.map((r) => ({
        ...enrollmentFromRow(r),
        programTitle: r.program_title,
        programSlug: r.program_slug,
        programSchoolType: r.program_school_type,
      }));
    },

    async enrollUser(userId, programId) {
      const uid = normalizeId(userId);
      const pid = normalizeId(programId);
      if (uid == null || pid == null) return null;
      const now = Date.now();
      try {
        const { rows } = await pool.query(
          `INSERT INTO ${schema('enrollments')} (user_id, program_id, status, enrolled_at)
           VALUES ($1, $2, 'active', $3)
           ON CONFLICT (user_id, program_id) DO UPDATE SET status = 'active', updated_at = $3
           RETURNING *`,
          [uid, pid, now]
        );
        return enrollmentFromRow(rows[0]);
      } catch (e) {
        if (e.code === '23503') return null;
        throw e;
      }
    },

    async getStudents(filters = {}) {
      const { search, limit = 100, offset = 0 } = filters;
      let query;
      let params;
      if (search) {
        query = `SELECT id, email, name, role, created_at FROM ${schema('users')}
                 WHERE role = 'student' AND (name ILIKE $1 OR email ILIKE $1)
                 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
        params = [`%${search}%`, limit, offset];
      } else {
        query = `SELECT id, email, name, role, created_at FROM ${schema('users')} WHERE role = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
        params = ['student', limit, offset];
      }
      const { rows } = await pool.query(query, params);
      return rows.map(userFromRow);
    },

    async countStudents() {
      const { rows } = await pool.query(`SELECT COUNT(*) as c FROM ${schema('users')} WHERE role = 'student'`);
      return Number(rows[0]?.c ?? 0);
    },

    async countEnrollments() {
      const { rows } = await pool.query(`SELECT COUNT(*) as c FROM ${schema('enrollments')} WHERE status = $1`, ['active']);
      return Number(rows[0]?.c ?? 0);
    },

    async getEnrollmentsByProgramId(programId) {
      const pid = normalizeId(programId);
      if (pid == null) return [];
      const { rows } = await pool.query(
        `SELECT COUNT(*) as c FROM ${schema('enrollments')} WHERE program_id = $1 AND status = $2`,
        [pid, 'active']
      );
      return Number(rows[0]?.c ?? 0);
    },

    async getStats() {
      const [students, enrollments, programs] = await Promise.all([
        this.countStudents(),
        this.countEnrollments(),
        pool.query(`SELECT COUNT(*) as c FROM ${schema('programs')}`).then((r) => Number(r.rows[0]?.c ?? 0)),
      ]);
      const { rows: PopularRows } = await pool.query(
        `SELECT p.id, p.title, p.slug, COUNT(e.id) as cnt
         FROM ${schema('programs')} p
         LEFT JOIN ${schema('enrollments')} e ON e.program_id = p.id AND e.status = 'active'
         GROUP BY p.id, p.title, p.slug
         ORDER BY cnt DESC
         LIMIT 10`
      );
      return {
        students,
        enrollments,
        programs,
        popularPrograms: PopularRows.map((r) => ({ id: String(r.id), title: r.title, slug: r.slug, count: Number(r.cnt) })),
      };
    },

    async getSchoolTypes() {
      const { rows } = await pool.query(
        `SELECT id, title, sort_order, description FROM ${schema('school_types')} ORDER BY sort_order, id`
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        sortOrder: r.sort_order ?? 0,
        description: r.description || '',
      }));
    },

    async getSchoolTypeById(id) {
      const { rows } = await pool.query(
        `SELECT id, title, sort_order, description FROM ${schema('school_types')} WHERE id = $1`,
        [id]
      );
      const r = rows[0];
      return r ? { id: r.id, title: r.title, sortOrder: r.sort_order ?? 0, description: r.description || '' } : null;
    },

    async insertSchoolType({ id, title, sortOrder = 0, description = '' }) {
      const { rows } = await pool.query(
        `INSERT INTO ${schema('school_types')} (id, title, sort_order, description) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, sort_order = EXCLUDED.sort_order, description = EXCLUDED.description
         RETURNING id, title, sort_order, description`,
        [id, title, sortOrder, description || '']
      );
      const r = rows[0];
      return r ? { id: r.id, title: r.title, sortOrder: r.sort_order ?? 0, description: r.description || '' } : null;
    },

    async updateSchoolType(id, updates) {
      const { title, sortOrder, description } = updates;
      const setClauses = [];
      const values = [];
      let idx = 0;
      if (title !== undefined) {
        idx++;
        setClauses.push(`title = $${idx}`);
        values.push(title);
      }
      if (sortOrder !== undefined) {
        idx++;
        setClauses.push(`sort_order = $${idx}`);
        values.push(sortOrder);
      }
      if (description !== undefined) {
        idx++;
        setClauses.push(`description = $${idx}`);
        values.push(description);
      }
      if (setClauses.length === 0) return this.getSchoolTypes().then((arr) => arr.find((st) => st.id === id) || null);
      idx++;
      values.push(id);
      const { rows } = await pool.query(
        `UPDATE ${schema('school_types')} SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
      const r = rows[0];
      return r ? { id: r.id, title: r.title, sortOrder: r.sort_order ?? 0, description: r.description || '' } : null;
    },

    async close() {
      await pool.end();
    },
  };
}

export default createPostgresAdapter;
