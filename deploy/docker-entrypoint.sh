#!/usr/bin/env sh
set -e

echo "Running database schema migration..."
npx drizzle-kit push --force 2>&1 || {
  echo "WARNING: drizzle-kit push failed — schema may need manual migration."
}

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
