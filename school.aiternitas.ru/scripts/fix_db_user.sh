#!/bin/bash
set -e

# Create user or alter password if exists
sudo -u postgres psql -c "CREATE USER school_user WITH PASSWORD 'SecureSchoolPass2026';" || sudo -u postgres psql -c "ALTER USER school_user WITH PASSWORD 'SecureSchoolPass2026';"

# Grant permissions
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE school TO school_user;"
sudo -u postgres psql -d school -c "GRANT ALL ON SCHEMA public TO school_user;"

# Update .env
# We use | as delimiter to avoid issues with / in the URL
sed -i 's|DATABASE_URL=.*|DATABASE_URL=postgresql://school_user:SecureSchoolPass2026@localhost:5432/school|' /opt/school/.env

# Restart service
systemctl restart school.service

echo "User created, permissions granted, .env updated, and service restarted."
