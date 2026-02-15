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

echo "Ensuring bookings.user_id is nullable with ON DELETE SET NULL..."
node -e "
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    await pool.query('ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL');
    await pool.query('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_user_id_users_id_fk');
    await pool.query('ALTER TABLE bookings ADD CONSTRAINT bookings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
    console.log('bookings.user_id constraint updated.');
  } catch(e) { console.log('bookings.user_id check:', e.message); }
  pool.end();
})();
" 2>&1 || true

echo "Clearing orphaned user assignments on auto-synced bookings..."
node -e "
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    const res = await pool.query(
      \"UPDATE bookings SET user_id = NULL WHERE ms_graph_event_id IS NOT NULL AND user_id IS NOT NULL AND description LIKE 'Auto-synced from Outlook%'\"
    );
    console.log('Cleared user_id on ' + res.rowCount + ' auto-synced booking(s).');
  } catch(e) { console.log('imported bookings cleanup:', e.message); }
  pool.end();
})();
" 2>&1 || true

echo "Starting MeetSpace Manager..."
exec node dist/index.cjs
