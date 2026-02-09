import { Pool } from 'pg';

const SCHEMA = 'school_aiternitas_ru';
const schema = (table) => `${SCHEMA}.${table}`;

const normalizeId = (id) => {
  if (id == null) return null;
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
};

const LOCALES = ['ru', 'sr', 'en'];
const pickLocale = (row, locale, base) => {
  const loc = LOCALES.includes(locale) ? locale : 'ru';
  const key = `${base}_${loc}`;
  return row[key] ?? row[`${base}_ru`] ?? row[`${base}_sr`] ?? row[`${base}_en`] ?? row[base] ?? '';
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

function programFromRow(row, locale = 'ru') {
  if (!row) return null;
  const curriculum = pickLocale(row, locale, 'curriculum');
  return {
    id: String(row.id),
    title: pickLocale(row, locale, 'title'),
    slug: row.slug,
    description: pickLocale(row, locale, 'description'),
    ageMin: row.age_min,
    ageMax: row.age_max,
    durationWeeks: row.duration_weeks,
    lessonsPerWeek: row.lessons_per_week ?? 1,
    format: row.format,
    schoolType: row.school_type || 'tech',
    imageUrl: row.image_url || null,
    price: row.price != null ? row.price : null,
    schedule: row.schedule || null,
    curriculum: Array.isArray(curriculum) ? curriculum : (row.curriculum || []),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function schoolTypeFromRow(row, locale = 'ru') {
  if (!row) return null;
  return {
    id: row.id,
    title: pickLocale(row, locale, 'title'),
    sortOrder: row.sort_order ?? 0,
    description: pickLocale(row, locale, 'description'),
  };
}

function enrollmentFromRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    programId: String(row.program_id),
    groupId: row.group_id ? String(row.group_id) : null,
    status: row.status || 'active',
    progress: row.progress ?? 0,
    enrolledAt: Number(row.enrolled_at),
    updatedAt: row.updated_at ? Number(row.updated_at) : null,
  };
}

function groupFromRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    programId: String(row.program_id),
    title: row.title || '',
    schedule: row.schedule || '',
    maxStudents: row.max_students ?? 10,
    status: row.status || 'active',
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function homeworkFromRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    lessonN: row.lesson_n ?? 1,
    title: row.title || '',
    description: row.description || '',
    dueAt: row.due_at ? Number(row.due_at) : null,
    createdAt: Number(row.created_at),
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

    async updateUser(id, updates) {
      const nid = normalizeId(id);
      if (nid == null) return null;
      const name = updates?.name;
      if (name == null || typeof name !== 'string') return this.getUserById(id);
      const now = Date.now();
      const { rows } = await pool.query(
        `UPDATE ${schema('users')} SET name = $1, updated_at = $2 WHERE id = $3 RETURNING id, email, name, role, created_at, updated_at`,
        [name.trim(), now, nid]
      );
      return rows[0] ? userFromRow(rows[0]) : null;
    },

    async getPrograms(filters = {}) {
      const { ageMin, ageMax, schoolType, locale = 'ru' } = filters;
      let query = `SELECT * FROM ${schema('programs')} ORDER BY age_min, COALESCE(title_ru, title)`;
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
        query = `SELECT * FROM ${schema('programs')} WHERE ${conditions.join(' AND ')} ORDER BY age_min, COALESCE(title_ru, title)`;
      }

      const { rows } = await pool.query(query, params);
      return rows.map((r) => programFromRow(r, locale));
    },

    async getProgramById(id, locale = 'ru') {
      const nid = normalizeId(id);
      if (nid == null) return null;
      const { rows } = await pool.query(`SELECT * FROM ${schema('programs')} WHERE id = $1`, [nid]);
      return programFromRow(rows[0], locale);
    },

    async getProgramByIdRaw(id) {
      const nid = normalizeId(id);
      if (nid == null) return null;
      const { rows } = await pool.query(`SELECT * FROM ${schema('programs')} WHERE id = $1`, [nid]);
      const r = rows[0];
      if (!r) return null;
      return {
        id: String(r.id),
        slug: r.slug,
        titleRu: r.title_ru ?? r.title ?? '',
        titleSr: r.title_sr ?? r.title_ru ?? r.title ?? '',
        titleEn: r.title_en ?? r.title_ru ?? r.title ?? '',
        descriptionRu: r.description_ru ?? r.description ?? '',
        descriptionSr: r.description_sr ?? r.description_ru ?? r.description ?? '',
        descriptionEn: r.description_en ?? r.description_ru ?? r.description ?? '',
        curriculumRu: r.curriculum_ru ?? r.curriculum ?? [],
        curriculumSr: r.curriculum_sr ?? r.curriculum_ru ?? r.curriculum ?? [],
        curriculumEn: r.curriculum_en ?? r.curriculum_ru ?? r.curriculum ?? [],
        ageMin: r.age_min,
        ageMax: r.age_max,
        durationWeeks: r.duration_weeks,
        lessonsPerWeek: r.lessons_per_week ?? 1,
        format: r.format,
        schoolType: r.school_type || 'tech',
        imageUrl: r.image_url || null,
        price: r.price != null ? r.price : null,
        schedule: r.schedule || null,
      };
    },

    async getProgramBySlug(slug, locale = 'ru') {
      const { rows } = await pool.query(`SELECT * FROM ${schema('programs')} WHERE slug = $1`, [slug]);
      return programFromRow(rows[0], locale);
    },

    async insertProgram(program) {
      const now = Date.now();
      const schoolType = program.schoolType ?? program.school_type ?? 'tech';
      const imageUrl = program.imageUrl ?? program.image_url ?? null;
      const price = program.price != null ? program.price : null;
      const schedule = program.schedule ?? null;
      const titleRu = program.titleRu ?? program.title_ru ?? program.title ?? '';
      const titleSr = program.titleSr ?? program.title_sr ?? titleRu;
      const titleEn = program.titleEn ?? program.title_en ?? titleRu;
      const descRu = program.descriptionRu ?? program.description_ru ?? program.description ?? '';
      const descSr = program.descriptionSr ?? program.description_sr ?? descRu;
      const descEn = program.descriptionEn ?? program.description_en ?? descRu;
      const currRu = program.curriculumRu ?? program.curriculum_ru ?? program.curriculum ?? [];
      const currSr = program.curriculumSr ?? program.curriculum_sr ?? currRu;
      const currEn = program.curriculumEn ?? program.curriculum_en ?? currRu;
      const { rows } = await pool.query(
        `INSERT INTO ${schema('programs')} (title, title_ru, title_sr, title_en, slug, description, description_ru, description_sr, description_en, age_min, age_max, duration_weeks, lessons_per_week, format, school_type, image_url, price, schedule, curriculum, curriculum_ru, curriculum_sr, curriculum_en, created_at, updated_at)
         VALUES ($1, $1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20, $20)
         RETURNING *`,
        [
          titleRu, titleSr, titleEn,
          program.slug,
          descRu, descSr, descEn,
          program.ageMin ?? program.age_min,
          program.ageMax ?? program.age_max,
          program.durationWeeks ?? program.duration_weeks,
          program.lessonsPerWeek ?? program.lessons_per_week ?? 1,
          program.format || '',
          schoolType,
          imageUrl,
          price,
          schedule,
          JSON.stringify(currRu),
          JSON.stringify(currSr),
          JSON.stringify(currEn),
          now,
        ]
      );
      return programFromRow(rows[0], 'ru');
    },

    async updateProgram(id, updates, locale = 'ru') {
      const nid = normalizeId(id);
      if (nid == null) return null;
      const now = Date.now();
      const fieldMap = {
        title: 'title', slug: 'slug', description: 'description',
        titleRu: 'title_ru', titleSr: 'title_sr', titleEn: 'title_en',
        descriptionRu: 'description_ru', descriptionSr: 'description_sr', descriptionEn: 'description_en',
        curriculumRu: 'curriculum_ru', curriculumSr: 'curriculum_sr', curriculumEn: 'curriculum_en',
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
          const isJsonb = col.startsWith('curriculum');
          setClauses.push(isJsonb ? `${col} = $${idx}::jsonb` : `${col} = $${idx}`);
          values.push(isJsonb ? JSON.stringify(val) : (Array.isArray(val) ? val : val));
        }
      }
      if (setClauses.length === 0) return this.getProgramById(id, locale);
      const hasI18n = ['title_ru', 'title_sr', 'title_en', 'description_ru', 'description_sr', 'description_en', 'curriculum_ru', 'curriculum_sr', 'curriculum_en'].some((c) => setClauses.some((s) => s.startsWith(c)));
      if (hasI18n) {
        setClauses.push('title = COALESCE(title_ru, title)', 'description = COALESCE(description_ru, description)', 'curriculum = COALESCE(curriculum_ru, curriculum)');
      }
      idx++;
      setClauses.push(`updated_at = $${idx}`);
      values.push(now);
      idx++;
      values.push(nid);
      const { rows } = await pool.query(
        `UPDATE ${schema('programs')} SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
      if (rows.length === 0) return null;
      return programFromRow(rows[0], locale);
    },

    async deleteProgram(id) {
      const nid = normalizeId(id);
      if (nid == null) return false;
      const { rowCount } = await pool.query(`DELETE FROM ${schema('programs')} WHERE id = $1`, [nid]);
      return rowCount > 0;
    },

    async getEnrollmentsByUserId(userId, locale = 'ru') {
      const nid = normalizeId(userId);
      if (nid == null) return [];
      const { rows } = await pool.query(
        `SELECT e.*, p.title_ru, p.title_sr, p.title_en, p.slug as program_slug, p.school_type as program_school_type,
                p.curriculum_ru, p.curriculum_sr, p.curriculum_en, p.curriculum,
                g.id as group_id, g.title as group_title, g.schedule as group_schedule
         FROM ${schema('enrollments')} e
         JOIN ${schema('programs')} p ON p.id = e.program_id
         LEFT JOIN ${schema('groups')} g ON g.id = e.group_id
         WHERE e.user_id = $1
         ORDER BY e.enrolled_at DESC`,
        [nid]
      );
      return rows.map((r) => {
        const curr = pickLocale(r, locale, 'curriculum');
        const curriculum = Array.isArray(curr) ? curr : (r.curriculum || []);
        const lessonCount = curriculum.length;
        const nextLessonN = Math.min(Math.floor((r.progress ?? 0) / 100 * lessonCount) + 1, lessonCount);
        const nextLesson = curriculum[nextLessonN - 1];
        return {
          ...enrollmentFromRow(r),
          groupId: r.group_id ? String(r.group_id) : null,
          groupTitle: r.group_title || '',
          groupSchedule: r.group_schedule || '',
          programTitle: pickLocale(r, locale, 'title'),
          programSlug: r.program_slug,
          programSchoolType: r.program_school_type,
          nextLessonN: nextLessonN <= lessonCount ? nextLessonN : null,
          nextLessonTopic: nextLesson?.topic || null,
        };
      });
    },

    async enrollUser(userId, programId, groupId) {
      const uid = normalizeId(userId);
      const pid = normalizeId(programId);
      const gid = groupId != null ? normalizeId(groupId) : null;
      if (uid == null || pid == null) return null;
      const now = Date.now();
      try {
        const { rows } = await pool.query(
          `INSERT INTO ${schema('enrollments')} (user_id, program_id, group_id, status, enrolled_at)
           VALUES ($1, $2, $3, 'active', $4)
           ON CONFLICT (user_id, program_id) DO UPDATE SET status = 'active', group_id = EXCLUDED.group_id, updated_at = $4
           RETURNING *`,
          [uid, pid, gid, now]
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

    async getAllEnrollments(filters = {}) {
      const { limit = 100, offset = 0, programId, userId } = filters;
      let query = `
        SELECT e.id, e.user_id, e.program_id, e.group_id, e.status, e.progress, e.enrolled_at,
               u.name as user_name, u.email as user_email,
               p.title_ru as program_title_ru, p.title_sr as program_title_sr, p.title_en as program_title_en,
               g.title as group_title, g.schedule as group_schedule
        FROM ${schema('enrollments')} e
        JOIN ${schema('users')} u ON u.id = e.user_id
        JOIN ${schema('programs')} p ON p.id = e.program_id
        LEFT JOIN ${schema('groups')} g ON g.id = e.group_id
        WHERE 1=1`;
      const params = [];
      let idx = 1;
      if (programId) {
        query += ` AND e.program_id = $${idx}`;
        params.push(normalizeId(programId));
        idx++;
      }
      if (userId) {
        query += ` AND e.user_id = $${idx}`;
        params.push(normalizeId(userId));
        idx++;
      }
      query += ` ORDER BY e.enrolled_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
      params.push(limit, offset);
      const { rows } = await pool.query(query, params);
      return rows.map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        programId: String(r.program_id),
        groupId: r.group_id ? String(r.group_id) : null,
        groupTitle: r.group_title || '',
        groupSchedule: r.group_schedule || '',
        status: r.status || 'active',
        progress: r.progress ?? 0,
        enrolledAt: Number(r.enrolled_at),
        studentName: r.user_name || '',
        studentEmail: r.user_email || '',
        programTitle: r.program_title_ru || r.program_title_sr || r.program_title_en || '',
      }));
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

    async updateEnrollmentGroup(enrollmentId, groupId) {
      const eid = normalizeId(enrollmentId);
      const gid = groupId != null ? normalizeId(groupId) : null;
      if (eid == null) return null;
      const { rows } = await pool.query(
        `UPDATE ${schema('enrollments')} SET group_id = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
        [eid, gid, Date.now()]
      );
      return rows[0] ? enrollmentFromRow(rows[0]) : null;
    },

    async updateEnrollmentProgress(enrollmentId, progress) {
      const eid = normalizeId(enrollmentId);
      const p = Math.min(100, Math.max(0, Number(progress) || 0));
      if (eid == null) return null;
      const { rows } = await pool.query(
        `UPDATE ${schema('enrollments')} SET progress = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
        [eid, p, Date.now()]
      );
      return rows[0] ? enrollmentFromRow(rows[0]) : null;
    },

    async getGroupsByProgramId(programId) {
      const pid = normalizeId(programId);
      if (pid == null) return [];
      const { rows } = await pool.query(
        `SELECT * FROM ${schema('groups')} WHERE program_id = $1 AND status = 'active' ORDER BY id`,
        [pid]
      );
      return rows.map(groupFromRow);
    },

    async getAllGroups(filters = {}) {
      const { programId } = filters;
      let query = `SELECT g.*, p.title_ru as program_title_ru, p.title_sr as program_title_sr, p.title_en as program_title_en
        FROM ${schema('groups')} g
        JOIN ${schema('programs')} p ON p.id = g.program_id
        WHERE 1=1`;
      const params = [];
      if (programId) {
        params.push(normalizeId(programId));
        query += ` AND g.program_id = $${params.length}`;
      }
      query += ` ORDER BY g.program_id, g.id`;
      const { rows } = await pool.query(query, params);
      return rows.map((r) => ({
        ...groupFromRow(r),
        programTitle: r.program_title_ru || r.program_title_sr || r.program_title_en || '',
      }));
    },

    async getGroupById(id) {
      const nid = normalizeId(id);
      if (nid == null) return null;
      const { rows } = await pool.query(`SELECT * FROM ${schema('groups')} WHERE id = $1`, [nid]);
      return rows[0] ? groupFromRow(rows[0]) : null;
    },

    async createGroup(data) {
      const now = Date.now();
      const { rows } = await pool.query(
        `INSERT INTO ${schema('groups')} (program_id, title, schedule, max_students, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING *`,
        [
          normalizeId(data.programId),
          data.title || '',
          data.schedule || '',
          data.maxStudents ?? 10,
          data.status || 'active',
          now,
        ]
      );
      return rows[0] ? groupFromRow(rows[0]) : null;
    },

    async updateGroup(id, updates) {
      const nid = normalizeId(id);
      if (nid == null) return null;
      const sets = [];
      const vals = [];
      let idx = 1;
      if (updates.title !== undefined) { sets.push(`title = $${idx}`); vals.push(updates.title); idx++; }
      if (updates.schedule !== undefined) { sets.push(`schedule = $${idx}`); vals.push(updates.schedule); idx++; }
      if (updates.maxStudents !== undefined) { sets.push(`max_students = $${idx}`); vals.push(updates.maxStudents); idx++; }
      if (updates.status !== undefined) { sets.push(`status = $${idx}`); vals.push(updates.status); idx++; }
      if (sets.length === 0) return this.getGroupById(id);
      vals.push(Date.now(), nid);
      sets.push(`updated_at = $${idx}`);
      const { rows } = await pool.query(
        `UPDATE ${schema('groups')} SET ${sets.join(', ')} WHERE id = $${idx + 1} RETURNING *`,
        vals
      );
      return rows[0] ? groupFromRow(rows[0]) : null;
    },

    async deleteGroup(id) {
      const nid = normalizeId(id);
      if (nid == null) return false;
      const { rowCount } = await pool.query(`DELETE FROM ${schema('groups')} WHERE id = $1`, [nid]);
      return rowCount > 0;
    },

    async getHomeworkByGroupId(groupId) {
      const gid = normalizeId(groupId);
      if (gid == null) return [];
      const { rows } = await pool.query(
        `SELECT * FROM ${schema('homework')} WHERE group_id = $1 ORDER BY lesson_n, created_at DESC`,
        [gid]
      );
      return rows.map(homeworkFromRow);
    },

    async getHomeworkByUserId(userId) {
      const uid = normalizeId(userId);
      if (uid == null) return [];
      const { rows } = await pool.query(
        `SELECT h.*, g.title as group_title, g.schedule as group_schedule, p.title_ru as program_title_ru
         FROM ${schema('homework')} h
         JOIN ${schema('groups')} g ON g.id = h.group_id
         JOIN ${schema('programs')} p ON p.id = g.program_id
         JOIN ${schema('enrollments')} e ON e.program_id = p.id AND e.group_id = g.id
         WHERE e.user_id = $1 AND e.status = 'active'
         ORDER BY h.due_at ASC NULLS LAST, h.created_at DESC`,
        [uid]
      );
      return rows.map((r) => ({
        ...homeworkFromRow(r),
        groupTitle: r.group_title || '',
        groupSchedule: r.group_schedule || '',
        programTitle: r.program_title_ru || '',
      }));
    },

    async createHomework(data) {
      const now = Date.now();
      const { rows } = await pool.query(
        `INSERT INTO ${schema('homework')} (group_id, lesson_n, title, description, due_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          normalizeId(data.groupId),
          data.lessonN ?? 1,
          data.title || '',
          data.description || '',
          data.dueAt ?? null,
          now,
        ]
      );
      return rows[0] ? homeworkFromRow(rows[0]) : null;
    },

    async deleteHomework(id) {
      const nid = normalizeId(id);
      if (nid == null) return false;
      const { rowCount } = await pool.query(`DELETE FROM ${schema('homework')} WHERE id = $1`, [nid]);
      return rowCount > 0;
    },

    async getAnnouncementsByUserId(userId) {
      const uid = normalizeId(userId);
      if (uid == null) return [];
      const { rows } = await pool.query(
        `SELECT a.*, g.title as group_title, g.schedule as group_schedule, p.title_ru as program_title_ru
         FROM ${schema('announcements')} a
         LEFT JOIN ${schema('groups')} g ON g.id = a.group_id
         LEFT JOIN ${schema('programs')} p ON p.id = COALESCE(a.program_id, g.program_id)
         JOIN ${schema('enrollments')} e ON e.user_id = $1 AND e.status = 'active'
           AND ((a.group_id IS NOT NULL AND e.group_id = a.group_id) OR (a.group_id IS NULL AND a.program_id = e.program_id))
         ORDER BY a.created_at DESC
         LIMIT 50`,
        [uid]
      );
      return rows.map((r) => ({
        id: String(r.id),
        groupId: r.group_id ? String(r.group_id) : null,
        programId: r.program_id ? String(r.program_id) : null,
        title: r.title || '',
        body: r.body || '',
        groupTitle: r.group_title || '',
        groupSchedule: r.group_schedule || '',
        programTitle: r.program_title_ru || '',
        createdAt: Number(r.created_at),
      }));
    },

    async createAnnouncement(data) {
      const now = Date.now();
      const groupId = data.groupId ? normalizeId(data.groupId) : null;
      const programId = data.programId ? normalizeId(data.programId) : null;
      if (!groupId && !programId) return null;
      const { rows } = await pool.query(
        `INSERT INTO ${schema('announcements')} (group_id, program_id, title, body, author_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [groupId, programId, data.title || '', data.body || '', normalizeId(data.authorId) || null, now]
      );
      return rows[0] ? {
        id: String(rows[0].id),
        groupId: rows[0].group_id ? String(rows[0].group_id) : null,
        programId: rows[0].program_id ? String(rows[0].program_id) : null,
        title: rows[0].title || '',
        body: rows[0].body || '',
        createdAt: Number(rows[0].created_at),
      } : null;
    },

    async getStats(locale = 'ru') {
      const [students, enrollments, programs] = await Promise.all([
        this.countStudents(),
        this.countEnrollments(),
        pool.query(`SELECT COUNT(*) as c FROM ${schema('programs')}`).then((r) => Number(r.rows[0]?.c ?? 0)),
      ]);
      const { rows: PopularRows } = await pool.query(
        `SELECT p.id, p.title_ru, p.title_sr, p.title_en, p.title, p.slug, COUNT(e.id) as cnt
         FROM ${schema('programs')} p
         LEFT JOIN ${schema('enrollments')} e ON e.program_id = p.id AND e.status = 'active'
         GROUP BY p.id, p.title_ru, p.title_sr, p.title_en, p.title, p.slug
         ORDER BY cnt DESC
         LIMIT 10`
      );
      return {
        students,
        enrollments,
        programs,
        popularPrograms: PopularRows.map((r) => ({
          id: String(r.id),
          title: pickLocale(r, locale, 'title'),
          slug: r.slug,
          count: Number(r.cnt),
        })),
      };
    },

    async getSchoolTypes(locale = 'ru') {
      const { rows } = await pool.query(
        `SELECT * FROM ${schema('school_types')} ORDER BY sort_order, id`
      );
      return rows.map((r) => schoolTypeFromRow(r, locale));
    },

    async getSchoolTypeByIdRaw(id) {
      const { rows } = await pool.query(`SELECT * FROM ${schema('school_types')} WHERE id = $1`, [id]);
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        titleRu: r.title_ru ?? r.title ?? '',
        titleSr: r.title_sr ?? r.title_ru ?? r.title ?? '',
        titleEn: r.title_en ?? r.title_ru ?? r.title ?? '',
        sortOrder: r.sort_order ?? 0,
        descriptionRu: r.description_ru ?? r.description ?? '',
        descriptionSr: r.description_sr ?? r.description_ru ?? r.description ?? '',
        descriptionEn: r.description_en ?? r.description_ru ?? r.description ?? '',
      };
    },

    async getSchoolTypeById(id, locale = 'ru') {
      const { rows } = await pool.query(
        `SELECT * FROM ${schema('school_types')} WHERE id = $1`,
        [id]
      );
      return schoolTypeFromRow(rows[0], locale);
    },

    async insertSchoolType(data) {
      const id = data.id;
      const titleRu = data.titleRu ?? data.title_ru ?? data.title ?? '';
      const titleSr = data.titleSr ?? data.title_sr ?? titleRu;
      const titleEn = data.titleEn ?? data.title_en ?? titleRu;
      const descRu = data.descriptionRu ?? data.description_ru ?? data.description ?? '';
      const descSr = data.descriptionSr ?? data.description_sr ?? descRu;
      const descEn = data.descriptionEn ?? data.description_en ?? descRu;
      const sortOrder = data.sortOrder ?? data.sort_order ?? 0;
      const { rows } = await pool.query(
        `INSERT INTO ${schema('school_types')} (id, title, title_ru, title_sr, title_en, sort_order, description, description_ru, description_sr, description_en)
         VALUES ($1, $2, $2, $3, $4, $5, $6, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, title_ru = EXCLUDED.title_ru, title_sr = EXCLUDED.title_sr, title_en = EXCLUDED.title_en, sort_order = EXCLUDED.sort_order, description = EXCLUDED.description, description_ru = EXCLUDED.description_ru, description_sr = EXCLUDED.description_sr, description_en = EXCLUDED.description_en
         RETURNING *`,
        [id, titleRu, titleSr, titleEn, sortOrder, descRu, descSr, descEn]
      );
      return schoolTypeFromRow(rows[0], 'ru');
    },

    async updateSchoolType(id, updates, locale = 'ru') {
      const { titleRu, titleSr, titleEn, title, sortOrder, descriptionRu, descriptionSr, descriptionEn, description } = updates;
      const setClauses = [];
      const values = [];
      let idx = 0;
      if (titleRu !== undefined || title !== undefined) {
        idx++;
        const v = titleRu ?? title ?? '';
        setClauses.push(`title = $${idx}`, `title_ru = $${idx}`);
        values.push(v);
      }
      if (titleSr !== undefined) {
        idx++;
        setClauses.push(`title_sr = $${idx}`);
        values.push(titleSr);
      }
      if (titleEn !== undefined) {
        idx++;
        setClauses.push(`title_en = $${idx}`);
        values.push(titleEn);
      }
      if (sortOrder !== undefined) {
        idx++;
        setClauses.push(`sort_order = $${idx}`);
        values.push(sortOrder);
      }
      if (descriptionRu !== undefined || description !== undefined) {
        idx++;
        const v = descriptionRu ?? description ?? '';
        setClauses.push(`description = $${idx}`, `description_ru = $${idx}`);
        values.push(v);
      }
      if (descriptionSr !== undefined) {
        idx++;
        setClauses.push(`description_sr = $${idx}`);
        values.push(descriptionSr);
      }
      if (descriptionEn !== undefined) {
        idx++;
        setClauses.push(`description_en = $${idx}`);
        values.push(descriptionEn);
      }
      if (setClauses.length === 0) return this.getSchoolTypeById(id, locale);
      idx++;
      values.push(id);
      const { rows } = await pool.query(
        `UPDATE ${schema('school_types')} SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
      return schoolTypeFromRow(rows[0], locale);
    },

    async close() {
      await pool.end();
    },
  };
}

export default createPostgresAdapter;
