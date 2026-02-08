export function registerProgramsRoutes({ app, persistence, logger }) {
  const log = logger?.child?.({ scope: 'programs' }) || logger || console;

  app.get('/api/programs', async (req, res) => {
    try {
      const { age_min, age_max, direction, school_type } = req.query || {};
      const filters = {};
      if (age_min != null) filters.ageMin = parseInt(age_min, 10);
      if (age_max != null) filters.ageMax = parseInt(age_max, 10);
      if (direction) filters.direction = String(direction).trim();
      if (school_type) filters.schoolType = String(school_type).trim();

      const programs = await persistence.getPrograms(filters);
      res.json({ success: true, programs });
    } catch (err) {
      log.error?.('Ошибка getPrograms', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки программ' });
    }
  });

  app.get('/api/programs/meta/school-types', async (req, res) => {
    try {
      const schoolTypes = await persistence.getSchoolTypes();
      res.json({ success: true, schoolTypes });
    } catch (err) {
      log.error?.('Ошибка getSchoolTypes', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки' });
    }
  });

  app.get('/api/programs/meta/directions', async (req, res) => {
    try {
      const directions = await persistence.getDirections();
      res.json({ success: true, directions });
    } catch (err) {
      log.error?.('Ошибка getDirections', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки' });
    }
  });

  app.get('/api/programs/:id', async (req, res) => {
    try {
      const program = await persistence.getProgramById(req.params.id);
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
}
