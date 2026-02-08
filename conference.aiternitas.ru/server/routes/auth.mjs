import bcrypt from 'bcryptjs';
import { createRequestValidator, stringField } from '../middleware/validation.mjs';
import { createToken } from '../middleware/jwtAuth.mjs';

const SALT_ROUNDS = 10;

function assertPersistence(persistence) {
  if (!persistence) throw new Error('registerAuthRoutes: persistence is required');
  const required = ['getSubscriberByLogin', 'getSubscriberById', 'insertSubscriber', 'upsertSubscriber', 'getJwtTtlSeconds'];
  const missing = required.filter((m) => typeof persistence[m] !== 'function');
  if (missing.length) throw new Error(`registerAuthRoutes: persistence missing: ${missing.join(', ')}`);
}

export function registerAuthRoutes({ app, persistence, logger }) {
  if (!app) throw new Error('registerAuthRoutes: app is required');
  assertPersistence(persistence);

  const log = logger?.child?.({ scope: 'routes:auth' }) || logger || console;

  const validateRegister = createRequestValidator({
    body: {
      login: stringField({ required: true, maxLength: 64, label: 'login' }),
      name: stringField({ required: true, maxLength: 64, label: 'name' }),
      password: stringField({ required: true, minLength: 4, maxLength: 128, label: 'password' }),
    },
  });

  const validateLogin = createRequestValidator({
    body: {
      login: stringField({ required: true, maxLength: 128, label: 'login' }),
      password: stringField({ required: true, maxLength: 128, label: 'password' }),
    },
  });

  // POST /api/auth/register
  app.post('/api/auth/register', validateRegister, async (req, res) => {
    try {
      const login = (req.validated?.body?.login || '').trim();
      const name = (req.validated?.body?.name || '').trim();
      const password = req.validated?.body?.password || '';

      const existing = await persistence.getSubscriberByLogin(login);
      if (existing) {
        res.status(409).json({ success: false, error: 'Пользователь с таким логином уже существует.' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const subscriber = await persistence.insertSubscriber({ login, name, passwordHash });

      log.info('Регистрация пользователя', { login, id: subscriber.id });

      const ttl = await persistence.getJwtTtlSeconds();
      const token = createToken(subscriber.id, ttl);

      res.json({
        success: true,
        token,
        subscriber: {
          id: subscriber.id,
          login: subscriber.login || login,
          name: subscriber.name,
          avatarUrl: subscriber.avatarUrl || null,
        },
      });
    } catch (error) {
      log.error?.('Ошибка регистрации', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось зарегистрироваться' });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', validateLogin, async (req, res) => {
    try {
      const login = (req.validated?.body?.login || '').trim();
      const password = req.validated?.body?.password || '';

      const subscriber = await persistence.getSubscriberByLogin(login);
      if (!subscriber) {
        res.status(401).json({ success: false, error: 'Неверный логин или пароль.' });
        return;
      }

      if (!subscriber.passwordHash) {
        res.status(401).json({ success: false, error: 'Неверный логин или пароль.' });
        return;
      }

      const valid = await bcrypt.compare(password, subscriber.passwordHash);
      if (!valid) {
        res.status(401).json({ success: false, error: 'Неверный логин или пароль.' });
        return;
      }

      const ttl = await persistence.getJwtTtlSeconds();
      const token = createToken(subscriber.id, ttl);

      res.json({
        success: true,
        token,
        subscriber: {
          id: subscriber.id,
          login: subscriber.login || login,
          name: subscriber.name,
          avatarUrl: subscriber.avatarUrl || null,
        },
      });
    } catch (error) {
      log.error?.('Ошибка входа', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось войти' });
    }
  });
}

export default registerAuthRoutes;
