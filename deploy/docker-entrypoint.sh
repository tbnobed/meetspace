#!/bin/sh
set -e

echo "============================================"
echo " MeetSpace Manager — Starting Up"
echo "============================================"

echo "[1/4] Ensuring site_admin role enum value exists..."
node -e "
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\"ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'site_admin'\")
  .then(() => { console.log('  site_admin role ensured.'); pool.end(); })
  .catch(e => { console.log('  site_admin check:', e.message); pool.end(); });
" 2>&1 || true

echo "[2/4] Running database schema migration (drizzle-kit push)..."
./node_modules/.bin/drizzle-kit push --force 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: drizzle-kit push failed. Cannot start without database schema."
  exit 1
fi

echo "[3/4] Applying data migrations..."

node -e "
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    await pool.query('ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL');
    await pool.query('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_user_id_users_id_fk');
    await pool.query('ALTER TABLE bookings ADD CONSTRAINT bookings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
    console.log('  bookings.user_id constraint updated.');
  } catch(e) { console.log('  bookings.user_id check:', e.message); }

  try {
    const res = await pool.query(
      \"UPDATE bookings SET user_id = NULL WHERE ms_graph_event_id IS NOT NULL AND user_id IS NOT NULL AND description LIKE 'Auto-synced from Outlook%'\"
    );
    if (res.rowCount > 0) console.log('  Cleared user_id on ' + res.rowCount + ' auto-synced booking(s).');
  } catch(e) { console.log('  imported bookings cleanup:', e.message); }

  pool.end();
})();
" 2>&1 || true

echo "[4/4] Starting MeetSpace Manager..."
exec node dist/index.cjs
