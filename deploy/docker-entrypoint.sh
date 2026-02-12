#!/bin/sh
set -e

echo "Running database schema migration..."
./node_modules/.bin/drizzle-kit push --force 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: drizzle-kit push failed. Cannot start without database schema."
  exit 1
fi

echo "Ensuring site_admin role exists..."
node -e "
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\"ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'site_admin'\")
  .then(() => { console.log('site_admin role ensured.'); pool.end(); })
  .catch(e => { console.log('site_admin check:', e.message); pool.end(); });
" 2>&1 || true

echo "Starting MeetSpace Manager..."
exec node dist/index.cjs
