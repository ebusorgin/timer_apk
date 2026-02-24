#!/bin/bash
set -e

# Grant permissions on the specific schema mentioned in the error
sudo -u postgres psql -d school -c "GRANT USAGE, CREATE ON SCHEMA school_aiternitas_ru TO school_user;" || echo "Schema might not exist yet or error granting on schema"

# Grant permissions on all tables and sequences in that schema if they exist
sudo -u postgres psql -d school -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA school_aiternitas_ru TO school_user;" || echo "No tables or error"
sudo -u postgres psql -d school -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA school_aiternitas_ru TO school_user;" || echo "No sequences or error"

# Make sure future tables are also accessible
sudo -u postgres psql -d school -c "ALTER DEFAULT PRIVILEGES IN SCHEMA school_aiternitas_ru GRANT ALL ON TABLES TO school_user;"
sudo -u postgres psql -d school -c "ALTER DEFAULT PRIVILEGES IN SCHEMA school_aiternitas_ru GRANT ALL ON SEQUENCES TO school_user;"

# Just in case, grant on public too if not already fully done
sudo -u postgres psql -d school -c "GRANT ALL ON SCHEMA public TO school_user;"

# Restart service
systemctl restart school.service

echo "Permissions updated and service restarted."
