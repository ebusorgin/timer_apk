const LOCALES = ['ru', 'sr', 'en'];
function getLocale(req) {
  const fromQuery = req.query?.locale;
  if (LOCALES.includes(fromQuery)) return fromQuery;
  return 'ru';
}

export function registerProgramsRoutes({ app, persistence, logger }) {
  const log = logger?.child?.({ scope: 'programs' }) || logger || console;

  app.get('/api/programs', async (req, res) => {
    try {
      const { age_min, age_max, school_type, level } = req.query || {};
      const filters = { locale: getLocale(req) };
      if (age_min != null) filters.ageMin = parseInt(age_min, 10);
      if (age_max != null) filters.ageMax = parseInt(age_max, 10);
      if (school_type) filters.schoolType = String(school_type).trim();
      if (level) filters.level = String(level).trim();

      const programs = await persistence.getPrograms(filters);
      res.json({ success: true, programs });
    } catch (err) {
      log.error?.('Ошибка getPrograms', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки программ' });
    }
  });

  app.get('/api/programs/meta/popular-ids', async (req, res) => {
    try {
      const ids = await persistence.getPopularProgramIds?.(5) || [];
      res.json({ success: true, popularIds: ids });
    } catch (err) {
      log.error?.('Ошибка getPopularProgramIds', { error: err?.message });
      res.json({ success: true, popularIds: [] });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const stats = await persistence.getStats?.(getLocale(req));
      if (!stats) {
        res.json({ success: true, stats: { students: 0, enrollments: 0, programs: 0 } });
        return;
      }
      res.json({ success: true, stats: { students: stats.students, enrollments: stats.enrollments, programs: stats.programs } });
    } catch (err) {
      log.error?.('Ошибка getStats', { error: err?.message });
      res.json({ success: true, stats: { students: 0, enrollments: 0, programs: 0 } });
    }
  });

  app.get('/api/programs/meta/school-types', async (req, res) => {
    try {
      const schoolTypes = await persistence.getSchoolTypes(getLocale(req));
      res.json({ success: true, schoolTypes });
    } catch (err) {
      log.error?.('Ошибка getSchoolTypes', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки' });
    }
  });

  app.get('/api/school-types/:id', async (req, res) => {
    try {
      const locale = getLocale(req);
      const schoolType = await persistence.getSchoolTypeById(req.params.id, locale);
      if (!schoolType) {
        res.status(404).json({ success: false, error: 'Тип школы не найден' });
        return;
      }
      const programs = await persistence.getPrograms({ schoolType: req.params.id, locale });
      res.json({ success: true, schoolType, programs });
    } catch (err) {
      log.error?.('Ошибка getSchoolType', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки' });
    }
  });

  app.get('/api/programs/:id', async (req, res) => {
    try {
      const program = await persistence.getProgramById(req.params.id, getLocale(req));
      if (!program) {
        res.status(404).json({ success: false, error: 'Программа не найдена' });
        return;
      }
      res.json({ success: true, program });
    } catch (err) {
      log.error?.('Ошибка getProgram', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки' });
    }
  });

  app.get('/api/programs/:id/groups', async (req, res) => {
    try {
      const groups = await persistence.getGroupsByProgramId?.(req.params.id);
      res.json({ success: true, groups: groups || [] });
    } catch (err) {
      log.error?.('Ошибка getGroups', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки групп' });
    }
  });
}
