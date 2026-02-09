import { createAdminAuthMiddleware } from '../middleware/adminAuth.mjs';

const LOCALES = ['ru', 'sr', 'en'];
function getLocale(req) {
  const fromQuery = req.query?.locale ?? req.body?.locale;
  if (LOCALES.includes(fromQuery)) return fromQuery;
  return 'ru';
}

export function registerAdminRoutes({ app, persistence, logger }) {
  const log = logger?.child?.({ scope: 'admin' }) || logger || console;
  const adminAuth = createAdminAuthMiddleware(persistence);

  app.get('/api/admin/enrollments', adminAuth, async (req, res) => {
    try {
      const { limit, offset, programId, userId } = req.query || {};
      const enrollments = await persistence.getAllEnrollments?.({
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
        programId: programId || undefined,
        userId: userId || undefined,
      });
      if (!enrollments) {
        res.status(501).json({ success: false, error: 'Not implemented' });
        return;
      }
      res.json({ success: true, enrollments });
    } catch (err) {
      log.error?.('Ошибка getAllEnrollments', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/admin/groups', adminAuth, async (req, res) => {
    try {
      const { programId } = req.query || {};
      const groups = await persistence.getAllGroups?.({ programId: programId || undefined });
      res.json({ success: true, groups: groups || [] });
    } catch (err) {
      log.error?.('Ошибка getGroups', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.post('/api/admin/groups', adminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const group = await persistence.createGroup?.({
        programId: body.programId,
        title: body.title || '',
        schedule: body.schedule || '',
        maxStudents: body.maxStudents ?? 10,
      });
      if (!group) {
        res.status(400).json({ success: false, error: 'Ошибка создания группы' });
        return;
      }
      res.json({ success: true, group });
    } catch (err) {
      log.error?.('Ошибка createGroup', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.put('/api/admin/groups/:id', adminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const group = await persistence.updateGroup?.(req.params.id, {
        title: body.title,
        schedule: body.schedule,
        maxStudents: body.maxStudents,
        status: body.status,
      });
      if (!group) {
        res.status(404).json({ success: false, error: 'Группа не найдена' });
        return;
      }
      res.json({ success: true, group });
    } catch (err) {
      log.error?.('Ошибка updateGroup', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.delete('/api/admin/groups/:id', adminAuth, async (req, res) => {
    try {
      const ok = await persistence.deleteGroup?.(req.params.id);
      if (!ok) {
        res.status(404).json({ success: false, error: 'Группа не найдена' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      log.error?.('Ошибка deleteGroup', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.put('/api/admin/enrollments/:id/group', adminAuth, async (req, res) => {
    try {
      const { groupId } = req.body || {};
      const enrollment = await persistence.updateEnrollmentGroup?.(req.params.id, groupId || null);
      if (!enrollment) {
        res.status(404).json({ success: false, error: 'Запись не найдена' });
        return;
      }
      res.json({ success: true, enrollment });
    } catch (err) {
      log.error?.('Ошибка updateEnrollmentGroup', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.put('/api/admin/enrollments/:id/progress', adminAuth, async (req, res) => {
    try {
      const { progress } = req.body || {};
      const enrollment = await persistence.updateEnrollmentProgress?.(req.params.id, progress);
      if (!enrollment) {
        res.status(404).json({ success: false, error: 'Запись не найдена' });
        return;
      }
      res.json({ success: true, enrollment });
    } catch (err) {
      log.error?.('Ошибка updateEnrollmentProgress', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/admin/groups/:id/homework', adminAuth, async (req, res) => {
    try {
      const homework = await persistence.getHomeworkByGroupId?.(req.params.id);
      res.json({ success: true, homework: homework || [] });
    } catch (err) {
      log.error?.('Ошибка getHomework', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.post('/api/admin/homework', adminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const hw = await persistence.createHomework?.({
        groupId: body.groupId,
        lessonN: body.lessonN ?? 1,
        title: body.title || '',
        description: body.description || '',
        dueAt: body.dueAt || null,
      });
      if (!hw) {
        res.status(400).json({ success: false, error: 'Ошибка создания ДЗ' });
        return;
      }
      res.json({ success: true, homework: hw });
    } catch (err) {
      log.error?.('Ошибка createHomework', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.post('/api/admin/announcements', adminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const ann = await persistence.createAnnouncement?.({
        groupId: body.groupId || null,
        programId: body.programId || null,
        title: body.title || '',
        body: body.body || '',
        authorId: req.userId,
      });
      if (!ann) {
        res.status(400).json({ success: false, error: 'Укажите группу или программу' });
        return;
      }
      res.json({ success: true, announcement: ann });
    } catch (err) {
      log.error?.('Ошибка createAnnouncement', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка создания' });
    }
  });

  app.delete('/api/admin/homework/:id', adminAuth, async (req, res) => {
    try {
      const ok = await persistence.deleteHomework?.(req.params.id);
      if (!ok) {
        res.status(404).json({ success: false, error: 'ДЗ не найдено' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      log.error?.('Ошибка deleteHomework', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/admin/students', adminAuth, async (req, res) => {
    try {
      const { search, limit, offset } = req.query || {};
      const students = await persistence.getStudents({
        search: search ? String(search).trim() : undefined,
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
      });
      res.json({ success: true, students });
    } catch (err) {
      log.error?.('Ошибка getStudents', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
      const stats = await persistence.getStats(getLocale(req));
      res.json({ success: true, stats });
    } catch (err) {
      log.error?.('Ошибка getStats', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/admin/programs/raw/:id', adminAuth, async (req, res) => {
    try {
      const program = await persistence.getProgramByIdRaw?.(req.params.id);
      if (!program) {
        res.status(404).json({ success: false, error: 'Программа не найдена' });
        return;
      }
      res.json({ success: true, program });
    } catch (err) {
      log.error?.('Ошибка getProgramRaw', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки' });
    }
  });

  app.get('/api/admin/programs', adminAuth, async (req, res) => {
    try {
      const programs = await persistence.getPrograms({ locale: getLocale(req) });
      res.json({ success: true, programs });
    } catch (err) {
      log.error?.('Ошибка getPrograms', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.post('/api/admin/programs', adminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const slug = body.slug || (body.titleRu ?? body.title ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-zа-яё0-9-]/gi, '');
      const program = await persistence.insertProgram({
        titleRu: body.titleRu ?? body.title ?? '',
        titleSr: body.titleSr ?? body.title_ru ?? body.title ?? '',
        titleEn: body.titleEn ?? body.title_en ?? body.title ?? '',
        slug,
        descriptionRu: body.descriptionRu ?? body.description ?? '',
        descriptionSr: body.descriptionSr ?? body.description_sr ?? body.description ?? '',
        descriptionEn: body.descriptionEn ?? body.description_en ?? body.description ?? '',
        curriculumRu: body.curriculumRu ?? body.curriculum ?? [],
        curriculumSr: body.curriculumSr ?? body.curriculum_sr ?? body.curriculum ?? [],
        curriculumEn: body.curriculumEn ?? body.curriculum_en ?? body.curriculum ?? [],
        ageMin: body.ageMin ?? body.age_min ?? 5,
        ageMax: body.ageMax ?? body.age_max ?? 18,
        durationWeeks: body.durationWeeks ?? body.duration_weeks ?? 12,
        lessonsPerWeek: body.lessonsPerWeek ?? body.lessons_per_week ?? 1,
        format: body.format || '',
        schoolType: body.schoolType ?? body.school_type ?? 'tech',
        imageUrl: body.imageUrl ?? body.image_url ?? null,
        price: body.price != null ? body.price : null,
        schedule: body.schedule ?? null,
      });
      res.json({ success: true, program });
    } catch (err) {
      log.error?.('Ошибка createProgram', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка создания' });
    }
  });

  app.put('/api/admin/programs/:id', adminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const program = await persistence.updateProgram(req.params.id, body);
      if (!program) {
        res.status(404).json({ success: false, error: 'Программа не найдена' });
        return;
      }
      res.json({ success: true, program });
    } catch (err) {
      log.error?.('Ошибка updateProgram', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка обновления' });
    }
  });

  app.delete('/api/admin/programs/:id', adminAuth, async (req, res) => {
    try {
      const ok = await persistence.deleteProgram(req.params.id);
      if (!ok) {
        res.status(404).json({ success: false, error: 'Программа не найдена' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      log.error?.('Ошибка deleteProgram', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка удаления' });
    }
  });

  app.get('/api/admin/school-types', adminAuth, async (req, res) => {
    try {
      const schoolTypes = await persistence.getSchoolTypes(getLocale(req));
      res.json({ success: true, schoolTypes });
    } catch (err) {
      log.error?.('Ошибка getSchoolTypes', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.post('/api/admin/school-types', adminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const st = await persistence.insertSchoolType({
        id: body.id,
        title: body.title ?? body.titleRu ?? body.title_ru ?? '',
        titleRu: body.titleRu ?? body.title,
        titleSr: body.titleSr ?? body.title_sr ?? body.title,
        titleEn: body.titleEn ?? body.title_en ?? body.title,
        sortOrder: body.sortOrder ?? body.sort_order ?? 0,
        description: body.description ?? body.descriptionRu ?? body.description_ru ?? '',
        descriptionRu: body.descriptionRu ?? body.description,
        descriptionSr: body.descriptionSr ?? body.description_sr ?? body.description,
        descriptionEn: body.descriptionEn ?? body.description_en ?? body.description,
      });
      res.json({ success: true, schoolType: st });
    } catch (err) {
      log.error?.('Ошибка createSchoolType', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка создания' });
    }
  });

  app.get('/api/admin/school-types/raw/:id', adminAuth, async (req, res) => {
    try {
      const st = await persistence.getSchoolTypeByIdRaw?.(req.params.id);
      if (!st) {
        res.status(404).json({ success: false, error: 'Тип школы не найден' });
        return;
      }
      res.json({ success: true, schoolType: st });
    } catch (err) {
      log.error?.('Ошибка getSchoolTypeRaw', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки' });
    }
  });

  app.put('/api/admin/school-types/:id', adminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const st = await persistence.updateSchoolType(req.params.id, {
        title: body.title ?? body.titleRu,
        titleRu: body.titleRu ?? body.title,
        titleSr: body.titleSr ?? body.title_sr,
        titleEn: body.titleEn ?? body.title_en,
        sortOrder: body.sortOrder ?? body.sort_order,
        description: body.description ?? body.descriptionRu,
        descriptionRu: body.descriptionRu ?? body.description,
        descriptionSr: body.descriptionSr ?? body.description_sr,
        descriptionEn: body.descriptionEn ?? body.description_en,
      }, getLocale(req));
      if (!st) {
        res.status(404).json({ success: false, error: 'Направление не найдено' });
        return;
      }
      res.json({ success: true, schoolType: st });
    } catch (err) {
      log.error?.('Ошибка updateSchoolType', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка обновления' });
    }
  });
}
