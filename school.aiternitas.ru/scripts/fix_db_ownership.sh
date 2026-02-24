#!/bin/bash
set -e

# Change ownership of the schema
sudo -u postgres psql -d school -c "ALTER SCHEMA school_aiternitas_ru OWNER TO school_user;" || echo "Failed to alter schema owner"

# Change ownership of all tables in the schema to school_user
sudo -u postgres psql -d school -c "
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'school_aiternitas_ru') LOOP
        EXECUTE 'ALTER TABLE school_aiternitas_ru.' || quote_ident(r.tablename) || ' OWNER TO school_user;';
    END LOOP;
END \$\$;
"

# Change ownership of all sequences in the schema to school_user
sudo -u postgres psql -d school -c "
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'school_aiternitas_ru') LOOP
        EXECUTE 'ALTER SEQUENCE school_aiternitas_ru.' || quote_ident(r.sequencename) || ' OWNER TO school_user;';
    END LOOP;
END \$\$;
"

# Restart service
systemctl restart school.service

echo "Ownership updated and service restarted."
