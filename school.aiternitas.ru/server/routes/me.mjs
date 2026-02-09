import { createJwtAuthMiddleware, createRoleAuthMiddleware } from '../middleware/jwtAuth.mjs';

const LOCALES = ['ru', 'sr', 'en'];
function getLocale(req) {
  const fromQuery = req.query?.locale;
  if (LOCALES.includes(fromQuery)) return fromQuery;
  return 'ru';
}

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

  app.put('/api/me/profile', auth, async (req, res) => {
    try {
      const { name } = req.body || {};
      if (!name || typeof name !== 'string') {
        res.status(400).json({ success: false, error: 'Имя обязательно' });
        return;
      }
      const updated = await persistence.updateUser?.(req.userId, { name });
      if (!updated) {
        res.status(404).json({ success: false, error: 'Пользователь не найден' });
        return;
      }
      res.json({ success: true, user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role } });
    } catch (err) {
      log.error?.('Ошибка updateProfile', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка сохранения' });
    }
  });

  app.get('/api/me/enrollments', auth, async (req, res) => {
    try {
      const enrollments = await persistence.getEnrollmentsByUserId(req.userId, getLocale(req));
      res.json({ success: true, enrollments });
    } catch (err) {
      log.error?.('Ошибка getEnrollments', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки записей' });
    }
  });

  app.get('/api/me/announcements', auth, async (req, res) => {
    try {
      const announcements = await persistence.getAnnouncementsByUserId?.(req.userId);
      res.json({ success: true, announcements: announcements || [] });
    } catch (err) {
      log.error?.('Ошибка getAnnouncements', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки' });
    }
  });

  app.get('/api/me/homework', auth, async (req, res) => {
    try {
      const homework = await persistence.getHomeworkByUserId?.(req.userId);
      res.json({ success: true, homework: homework || [] });
    } catch (err) {
      log.error?.('Ошибка getHomework', { error: err?.message });
      res.status(500).json({ success: false, error: 'Ошибка загрузки' });
    }
  });

  app.post('/api/me/enrollments', auth, async (req, res) => {
    try {
      const { programId, groupId } = req.body || {};
      const user = await persistence.getUserById(req.userId);
      if (user?.role !== 'student') {
        res.status(403).json({ success: false, error: 'Только ученики могут записываться' });
        return;
      }
      const enrollment = await persistence.enrollUser(req.userId, programId, groupId);
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
