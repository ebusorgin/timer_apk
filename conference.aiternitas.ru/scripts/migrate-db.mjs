#!/usr/bin/env node
/**
 * Миграция: users (все зарегистрированные, первая запись = админ), app_settings (jwt_ttl и т.д.)
 */
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

async function main() {
  if (!connectionString) {
    console.error('Укажите DATABASE_URL');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    console.log('Удаление старых таблиц...');
    await pool.query(`
      DROP TABLE IF EXISTS contact_requests CASCADE;
      DROP TABLE IF EXISTS chat_messages CASCADE;
      DROP TABLE IF EXISTS contacts CASCADE;
      DROP TABLE IF EXISTS calls CASCADE;
      DROP TABLE IF EXISTS admins CASCADE;
      DROP TABLE IF EXISTS subscribers CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS app_settings CASCADE;
    `);

    console.log('Создание новой схемы...');

    await pool.query(`
      CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,
        login TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_url TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO app_settings (key, value) VALUES ('jwt_ttl_seconds', '86400');
    `);

    await pool.query(`
      CREATE TABLE contacts (
        id BIGSERIAL PRIMARY KEY,
        owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        UNIQUE(owner_id, contact_id)
      );
      CREATE INDEX IF NOT EXISTS contacts_owner_id_idx ON contacts(owner_id);
    `);

    await pool.query(`
      CREATE TABLE calls (
        id BIGSERIAL PRIMARY KEY,
        from_id BIGINT NOT NULL REFERENCES users(id),
        from_name TEXT NOT NULL,
        to_id BIGINT NOT NULL REFERENCES users(id),
        to_name TEXT NOT NULL,
        call_type TEXT NOT NULL DEFAULT 'audio',
        status TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS calls_to_id_idx ON calls(to_id);
      CREATE INDEX IF NOT EXISTS calls_status_idx ON calls(status);
      CREATE INDEX IF NOT EXISTS calls_created_at_idx ON calls(created_at);
    `);

    await pool.query(`
      CREATE TABLE chat_messages (
        id BIGSERIAL PRIMARY KEY,
        from_id BIGINT NOT NULL REFERENCES users(id),
        to_id BIGINT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_messages_from_to_idx ON chat_messages(from_id, to_id);
      CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages(created_at);
    `);

    await pool.query(`
      CREATE TABLE contact_requests (
        id BIGSERIAL PRIMARY KEY,
        from_id BIGINT NOT NULL REFERENCES users(id),
        from_name TEXT NOT NULL,
        to_id BIGINT NOT NULL REFERENCES users(id),
        to_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at BIGINT NOT NULL,
        updated_at BIGINT
      );
      CREATE INDEX IF NOT EXISTS contact_requests_to_id_idx ON contact_requests(to_id);
      CREATE INDEX IF NOT EXISTS contact_requests_from_id_idx ON contact_requests(from_id);
      CREATE INDEX IF NOT EXISTS contact_requests_status_idx ON contact_requests(status);
    `);

    console.log('Миграция выполнена.');
  } catch (err) {
    console.error('Ошибка:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
