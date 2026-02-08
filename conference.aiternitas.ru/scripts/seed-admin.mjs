#!/usr/bin/env node
/**
 * Создаёт админа в БД (subscriber с role=admin).
 * Запуск: node scripts/seed-admin.mjs
 * Или: ADMIN_LOGIN=admin ADMIN_PASSWORD=xxx node scripts/seed-admin.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

// Загружаем .env из корня проекта (как делает systemd для сервера)
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const envPath = resolve(projectRoot, '.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  });
}
import createConfig from '../server/config.mjs';
import createPersistence from '../server/persistence/index.mjs';

const DEFAULT_LOGIN = 'admin';
const DEFAULT_PASSWORD = 'SevAdmin2026!';
const SALT_ROUNDS = 10;

async function main() {
  const login = process.env.ADMIN_LOGIN || DEFAULT_LOGIN;
  const password = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const config = createConfig();
  const persistenceConfig = {
    driver: process.env.PERSISTENCE_DRIVER || config.persistence?.driver || 'file',
    connectionString: process.env.DATABASE_URL || config.persistence?.connectionString || '',
    backupDir: config.paths?.backupDir,
    enableBackups: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
  const persistence = createPersistence(config.paths || {}, persistenceConfig);

  const subscribersPath = config.paths?.subscribersFile || '(unknown)';
  console.log('Persistence:', persistenceConfig.driver, '| Data:', subscribersPath);

  const existing = await persistence.getSubscriberByLogin(login);
  if (existing) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await persistence.upsertSubscriber({
      id: existing.id,
      login,
      name: existing.name || 'Admin',
      passwordHash,
      role: 'admin',
    });
    console.log('✅ Админ обновлён.');
  } else {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await persistence.insertSubscriber({
      login,
      name: 'Admin',
      passwordHash,
      role: 'admin',
    });
    console.log('✅ Админ создан.');
  }
  console.log('   Логин:', login);
  console.log('   Пароль:', password);

  if (persistence.adapter?.close) {
    await persistence.adapter.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Ошибка:', err.message);
  process.exit(1);
});
