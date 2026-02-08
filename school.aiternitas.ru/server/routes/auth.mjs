import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

function assertPersistence(persistence) {
  if (!persistence) throw new Error('auth: persistence required');
}

export function registerAuthRoutes({ app, persistence, logger }) {
  assertPersistence(persistence);
  const log = logger?.child?.({ scope: 'auth' }) || logger || console;

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, name, password } = req.body || {};
      const e = String(email || '').trim().toLowerCase();
      const n = String(name || '').trim();
      const p = String(password || '');

      if (!e || !n || !p) {
        res.status(400).json({ success: false, error: 'Заполните все поля.' });
        return;
      }
      if (p.length < 4) {
        res.status(400).json({ success: false, error: 'Пароль минимум 4 символа.' });
        return;
      }

      const existing = await persistence.getUserByEmail(e);
      if (existing) {
        res.status(409).json({ success: false, error: 'Пользователь с таким email уже существует.' });
        return;
      }

      const passwordHash = await bcrypt.hash(p, SALT_ROUNDS);
      const user = await persistence.insertUser({ email: e, name: n, passwordHash, role: 'student' });

      const { createToken } = await import('../middleware/jwtAuth.mjs');
      const token = createToken(user.id);

      log.info('Регистрация', { email: e, id: user.id });

      res.json({
        success: true,
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err) {
      log.error?.('Ошибка регистрации', { error: err?.message });
      res.status(500).json({ success: false, error: 'Не удалось зарегистрироваться' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const e = String(email || '').trim().toLowerCase();
      const p = String(password || '');

      if (!e || !p) {
        res.status(400).json({ success: false, error: 'Введите email и пароль.' });
        return;
      }

      const user = await persistence.getUserByEmail(e);
      if (!user?.passwordHash) {
        res.status(401).json({ success: false, error: 'Неверный email или пароль.' });
        return;
      }

      const valid = await bcrypt.compare(p, user.passwordHash);
      if (!valid) {
        res.status(401).json({ success: false, error: 'Неверный email или пароль.' });
        return;
      }

      const { createToken } = await import('../middleware/jwtAuth.mjs');
      const token = createToken(user.id);

      res.json({
        success: true,
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err) {
      log.error?.('Ошибка входа', { error: err?.message });
      res.status(500).json({ success: false, error: 'Не удалось войти' });
    }
  });
}
