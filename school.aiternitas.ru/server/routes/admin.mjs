import { createAdminAuthMiddleware } from '../middleware/adminAuth.mjs';

export function registerAdminRoutes({ app, persistence, logger }) {
  const log = logger?.child?.({ scope: 'admin' }) || logger || console;
  const adminAuth = createAdminAuthMiddleware(persistence);

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
      const stats = await persistence.getStats();
      res.json({ success: true, stats });
    } catch (err) {
      log.error?.('Ошибка getStats', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/admin/programs', adminAuth, async (req, res) => {
    try {
      const programs = await persistence.getPrograms({});
      res.json({ success: true, programs });
    } catch (err) {
      log.error?.('Ошибка getPrograms', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.post('/api/admin/programs', adminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const dirs = body.directions || (body.direction ? [body.direction] : ['программирование']);
      const program = await persistence.insertProgram({
        title: body.title,
        slug: body.slug || body.title?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zа-яё0-9-]/gi, ''),
        description: body.description || '',
        ageMin: body.ageMin ?? body.age_min ?? 5,
        ageMax: body.ageMax ?? body.age_max ?? 18,
        direction: dirs[0] || 'программирование',
        directions: dirs,
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
      const schoolTypes = await persistence.getSchoolTypes();
      res.json({ success: true, schoolTypes });
    } catch (err) {
      log.error?.('Ошибка getSchoolTypes', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.post('/api/admin/school-types', adminAuth, async (req, res) => {
    try {
      const st = await persistence.insertSchoolType(req.body || {});
      res.json({ success: true, schoolType: st });
    } catch (err) {
      log.error?.('Ошибка createSchoolType', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка создания' });
    }
  });

  app.put('/api/admin/school-types/:id', adminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const st = await persistence.updateSchoolType(req.params.id, {
        title: body.title,
        sortOrder: body.sortOrder ?? body.sort_order,
        description: body.description,
      });
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

  app.get('/api/admin/directions', adminAuth, async (req, res) => {
    try {
      const directions = await persistence.getDirectionsAdmin();
      res.json({ success: true, directions });
    } catch (err) {
      log.error?.('Ошибка getDirections', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.post('/api/admin/directions', adminAuth, async (req, res) => {
    try {
      const d = await persistence.insertDirection(req.body || {});
      res.json({ success: true, direction: d });
    } catch (err) {
      log.error?.('Ошибка createDirection', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка создания' });
    }
  });

  app.put('/api/admin/directions/:id', adminAuth, async (req, res) => {
    try {
      const d = await persistence.updateDirection(req.params.id, req.body || {});
      if (!d) {
        res.status(404).json({ success: false, error: 'Направление не найдено' });
        return;
      }
      res.json({ success: true, direction: d });
    } catch (err) {
      log.error?.('Ошибка updateDirection', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка обновления' });
    }
  });

  app.delete('/api/admin/directions/:id', adminAuth, async (req, res) => {
    try {
      const result = await persistence.deleteDirection(req.params.id);
      if (!result.ok) {
        res.status(400).json({ success: false, error: result.error || 'Направление не найдено' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      log.error?.('Ошибка deleteDirection', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка удаления' });
    }
  });
}
