import { createJwtAuthMiddleware, createRoleAuthMiddleware } from '../middleware/jwtAuth.mjs';

export function registerMeRoutes({ app, persistence, logger }) {
  const log = logger?.child?.({ scope: 'me' }) || logger || console;
  const auth = createRoleAuthMiddleware(persistence, ['student', 'admin']);

  app.get('/api/me', auth, async (req, res) => {
    try {
      const user = await persistence.getUserById(req.userId);
      if (!user) {
        res.status(404).json({ success: false, error: 'Пользователь не найден' });
        return;
      }
      res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (err) {
      log.error?.('Ошибка getMe', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/me/enrollments', auth, async (req, res) => {
    try {
      const enrollments = await persistence.getEnrollmentsByUserId(req.userId);
      res.json({ success: true, enrollments });
    } catch (err) {
      log.error?.('Ошибка getEnrollments', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки записей' });
    }
  });

  app.post('/api/me/enrollments', auth, async (req, res) => {
    try {
      const { programId } = req.body || {};
      const user = await persistence.getUserById(req.userId);
      if (user?.role !== 'student') {
        res.status(403).json({ success: false, error: 'Только ученики могут записываться' });
        return;
      }
      const enrollment = await persistence.enrollUser(req.userId, programId);
      if (!enrollment) {
        res.status(400).json({ success: false, error: 'Программа не найдена или уже записан' });
        return;
      }
      res.json({ success: true, enrollment });
    } catch (err) {
      log.error?.('Ошибка enroll', { error: err?.message });
      res.status(500).json({ success: false, error: 'Не удалось записаться' });
    }
  });
}
