#!/bin/sh
set -e

echo "============================================"
echo " MeetSpace Manager — Starting Up"
echo "============================================"

echo "[1/5] Ensuring site_admin role enum value exists..."
node -e "
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\"ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'site_admin'\")
  .then(() => { console.log('  site_admin role ensured.'); pool.end(); })
  .catch(e => { console.log('  site_admin check:', e.message); pool.end(); });
" 2>&1 || true

echo "[2/5] Running database schema migration (drizzle-kit push)..."
./node_modules/.bin/drizzle-kit push --force 2>&1 || echo "WARNING: drizzle-kit push encountered issues, will attempt manual table creation..."

echo "[3/5] Ensuring all required tables and columns exist..."
node -e "
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    await pool.query(\`
      CREATE TABLE IF NOT EXISTS security_groups (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    \`);
    console.log('  security_groups table ensured.');
  } catch(e) { console.log('  security_groups:', e.message); }

  try {
    await pool.query(\`
      CREATE TABLE IF NOT EXISTS security_group_members (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id VARCHAR NOT NULL REFERENCES security_groups(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE
      )
    \`);
    console.log('  security_group_members table ensured.');
  } catch(e) { console.log('  security_group_members:', e.message); }

  try {
    await pool.query(\`
      CREATE TABLE IF NOT EXISTS security_group_rooms (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id VARCHAR NOT NULL REFERENCES security_groups(id) ON DELETE CASCADE,
        room_id VARCHAR NOT NULL REFERENCES rooms(id) ON DELETE CASCADE
      )
    \`);
    console.log('  security_group_rooms table ensured.');
  } catch(e) { console.log('  security_group_rooms:', e.message); }

  try {
    await pool.query(\`
      CREATE TABLE IF NOT EXISTS graph_subscriptions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id VARCHAR NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        room_email VARCHAR NOT NULL,
        subscription_id VARCHAR NOT NULL,
        expiration_date_time TIMESTAMPTZ NOT NULL,
        client_state VARCHAR NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'active',
        last_notification_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    \`);
    console.log('  graph_subscriptions table ensured.');
  } catch(e) { console.log('  graph_subscriptions:', e.message); }

  try {
    await pool.query(\`
      CREATE TABLE IF NOT EXISTS room_tablets (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id VARCHAR NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        username VARCHAR NOT NULL UNIQUE,
        password VARCHAR NOT NULL,
        display_name VARCHAR NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true
      )
    \`);
    console.log('  room_tablets table ensured.');
  } catch(e) { console.log('  room_tablets:', e.message); }

  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false');
    console.log('  users.approved column ensured.');
  } catch(e) { console.log('  users.approved:', e.message); }

  try {
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ms_graph_event_id VARCHAR');
    console.log('  bookings.ms_graph_event_id column ensured.');
  } catch(e) { console.log('  bookings.ms_graph_event_id:', e.message); }

  try {
    await pool.query('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ms_graph_room_email VARCHAR');
    console.log('  rooms.ms_graph_room_email column ensured.');
  } catch(e) { console.log('  rooms.ms_graph_room_email:', e.message); }

  try {
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booked_for_name VARCHAR');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booked_for_email VARCHAR');
    console.log('  bookings booked_for columns ensured.');
  } catch(e) { console.log('  bookings booked_for:', e.message); }

  pool.end();
})();
" 2>&1 || true

echo "[4/5] Applying data migrations..."
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

echo "[5/5] Starting MeetSpace Manager..."
exec node dist/index.cjs
