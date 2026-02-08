-- Выдать права на схему school_aiternitas_ru
-- Выполнить от имени postgres: psql -d school -f grant-schema-permissions.sql

-- Если подключаетесь как postgres — убедитесь, что у него есть USAGE
GRANT USAGE ON SCHEMA school_aiternitas_ru TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA school_aiternitas_ru TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA school_aiternitas_ru TO postgres;

-- Для conference_app (пользователь приложения)
GRANT USAGE ON SCHEMA school_aiternitas_ru TO conference_app;
GRANT ALL ON ALL TABLES IN SCHEMA school_aiternitas_ru TO conference_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA school_aiternitas_ru TO conference_app;

-- Для будущих таблиц
ALTER DEFAULT PRIVILEGES IN SCHEMA school_aiternitas_ru
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA school_aiternitas_ru
  GRANT ALL ON TABLES TO conference_app;
