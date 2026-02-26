# MeetSpace Manager - Multi-Facility Conference Room Booking System

## Overview
Conference room management system for a multi-facility organization with ~20 conference rooms across 4 facilities in different timezones. Supports room booking with conflict detection, real-time availability dashboard, and admin management.

## Architecture
- **Frontend**: React + TypeScript with Vite, Shadcn UI, Tailwind CSS, wouter routing, TanStack Query
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Session-based with bcryptjs password hashing and PostgreSQL session store (connect-pg-simple)
- **Email**: SendGrid integration via @sendgrid/mail for transactional emails
- **Real-time**: Socket.io for live updates — server emits events on data mutations, client hook invalidates TanStack Query caches

## Real-time Updates (Socket.io)
- Server: Socket.io server initialized in `server/routes.ts` alongside Express
- Client: `useSocket` hook in `client/src/hooks/use-socket.ts` listens for events and invalidates relevant query caches
- Events: `bookings:updated`, `facilities:updated`, `rooms:updated`, `users:updated`
- Hook is mounted in `AuthenticatedLayout` in App.tsx so all authenticated pages auto-refresh

## Authentication
- Login/register at `/auth` page with session-based auth
- Passwords hashed with bcryptjs (10 rounds)
- Sessions stored in PostgreSQL via connect-pg-simple
- `/book` page is public (guest booking with name/email)
- All other pages require authentication
- Admin pages require `role: "admin"`
- **Registration approval**: New user registrations require admin approval before access is granted. Users see a "pending approval" message after registration and cannot log in until approved.
- Admin-created users and guest booking users are auto-approved
- Demo accounts: admin/admin123, jdoe/password, jsmith/password, lgarcia/password (site admin)

## User Roles
- **admin**: Full access to all pages including admin management (rooms, facilities, users, audit logs)
- **user**: Standard access to dashboard, meetings, booking, and personal bookings
- **site_admin**: Front desk / reception users who can book rooms on behalf of others (executives, VPs, etc.). Can have multiple facilities assigned and can only book rooms at their assigned facilities. Do NOT have access to admin pages.

## Key Pages
- `/auth` - Login and registration page
- `/` - Dashboard with stat cards and calendar view (day/week/month modes) (requires auth)
- `/meetings` - All Meetings with real-time room availability cards by facility (requires auth)
- `/book` - Book a conference room (public, supports guest booking; site admins see "Book on Behalf Of" fields)
- `/bookings` - View and manage personal bookings (requires auth)
- `/admin/rooms` - Room CRUD management (admin only)
- `/admin/facilities` - Facility CRUD management (admin only)
- `/admin/users` - User CRUD management (admin only)
- `/admin/security-groups` - Security group management for room access control (admin only)
- `/admin/webhooks` - Calendar webhook subscription management (admin only)
- `/admin/tablets` - Tablet kiosk credential management (admin only)
- `/admin/audit` - Audit log viewer (admin only)
- `/tablet` - Tablet kiosk login page (public)
- `/kiosk` - Tablet kiosk room status display (requires tablet auth)

## Data Model
- **Facilities**: 4 locations (Tustin/PST, Nashville/CST, Plex-Dallas/CST, Heritage-Dallas/CST)
- **Rooms**: ~20 rooms with capacity, floor, equipment info
- **Bookings**: Time-slot bookings with conflict detection, meeting type (Teams/Zoom/None), optional bookedForName/bookedForEmail for site admin bookings
- **Users**: Admin, user, and site_admin roles, bcrypt-hashed passwords, `approved` boolean (default false for self-registration, true for admin-created/guest users)
- **User Facility Assignments**: Junction table mapping site_admin users to their assigned facilities (many-to-many)
- **Security Groups**: Named groups of users with room access assignments
- **Security Group Members**: Junction table mapping users to security groups (many-to-many)
- **Security Group Rooms**: Junction table mapping rooms to security groups (many-to-many). If a room has no groups assigned, it's open to everyone. If a room has at least one group, only members of those groups (+ admins) can book it.
- **Room Tablets**: Tablet kiosk credentials per room (username, password, displayName, isActive)
- **Audit Logs**: Track all system changes

## PWA (Progressive Web App)
- Tablet kiosk is installable as an app on iPad (iOS) and Android tablets
- Web app manifest at `client/public/manifest.json` with standalone display, landscape orientation
- Service worker at `client/public/sw.js` with network-first caching strategy
- PWA icons at `client/public/icons/` (192x192 and 512x512)
- Install prompt/banner shown on tablet login page (`/tablet`) for both Android (native prompt) and iOS (Safari share hint)
- Meta tags: apple-mobile-web-app-capable, theme-color, mobile-web-app-capable
- When installed, the app launches in full-screen standalone mode starting at `/tablet`

## Running
- `npm run dev` starts Express + Vite dev server on port 5000
- Database schema auto-pushed and seeded on startup
- Seed auto-rehashes any plaintext passwords on startup
- On startup, `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'site_admin'` ensures the enum value exists before drizzle-kit push

## API Routes
All routes prefixed with `/api/`:

### Public
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/register` - Register new user
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user (includes assignedFacilityIds for site_admin)
- `GET /api/facilities` - List facilities
- `GET /api/rooms` - List rooms
- `POST /api/bookings` - Create booking (supports guest with guestName/guestEmail, site_admin with bookedForName/bookedForEmail)

### Authenticated
- `GET /api/bookings` - List all bookings
- `GET /api/bookings/range?start=ISO&end=ISO` - Date range query
- `GET /api/bookings/today` - Today's bookings
- `PATCH /api/bookings/:id` - Update booking (title, time, attendees, meeting type; owner or admin only)
- `PATCH /api/bookings/:id/cancel` - Cancel booking
- `GET /api/bookings/:id/room-status` - Check room acceptance status from Microsoft 365 (returns accepted/declined/tentativelyAccepted/none)

### Admin Only
- `POST /api/facilities`, `PATCH /api/facilities/:id`
- `POST /api/rooms`, `PATCH /api/rooms/:id`
- `GET /api/users` - List users (includes assignedFacilityIds for site_admin users)
- `POST /api/users` - Create user (supports assignedFacilityIds for site_admin)
- `POST /api/users/invite` - Invite user via email (creates account with temp password, sends invite email)
- `PATCH /api/users/:id` - Update user (supports assignedFacilityIds)
- `DELETE /api/users/:id` - Delete user
- `GET /api/users/:id/facility-assignments` - Get user facility assignments
- `PUT /api/users/:id/facility-assignments` - Set user facility assignments
- `GET /api/audit-logs`
- `GET /api/security-groups` - List security groups with member/room counts
- `GET /api/security-groups/:id` - Get group detail with memberIds and roomIds
- `POST /api/security-groups` - Create security group
- `PATCH /api/security-groups/:id` - Update security group
- `DELETE /api/security-groups/:id` - Delete security group
- `PUT /api/security-groups/:id/members` - Set group members (userIds array)
- `PUT /api/security-groups/:id/rooms` - Set group rooms (roomIds array)
- `GET /api/rooms/accessible` - Get rooms current user can book (based on security group membership)

## Email Notifications (SendGrid)
- **SENDGRID_API_KEY**: Required secret for sending emails
- **SENDGRID_FROM_EMAIL**: Environment variable for sender address (default: noreply@meetspace.io)
- **Booking confirmation**: Sent to booker (and bookedFor person) when a room is booked
- **Booking cancellation**: Sent to the booker when a booking is cancelled
- **Registration alert**: Sent to all admin users when a new user registers and needs approval
- **Approval notification**: Sent to user when their account is approved
- **User invite**: Sent when admin invites a user via email with temporary credentials
- Email sending is fire-and-forget (errors logged but don't block operations)
- Email service module: `server/email.ts`

## Microsoft Graph API Integration
- **Secrets**: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID (Azure App Registration)
- **Service module**: `server/graph.ts` using @azure/msal-node for client credentials auth
- **Room sync**: Admin can sync conference rooms from Microsoft 365 directory into MeetSpace, assigning to facilities
- **Calendar events**: Bookings automatically create Outlook calendar events on the room's mailbox calendar
  - Teams meetings: Created via Graph API with `isOnlineMeeting: true`
  - Zoom/Google Meet: Links embedded in event body HTML
- **Event cancellation**: Cancelling a booking also cancels the corresponding Outlook calendar event
- **Schema fields**: `msGraphRoomEmail` on rooms table, `msGraphEventId` on bookings table
- **Admin UI**: "Sync from Microsoft 365" button on Room Management page when Graph is configured
- **Event import**: Admin can pull existing Outlook calendar events into the app from M365 room calendars
  - Deduplication: Events already imported (by msGraphEventId) are skipped
  - Conflict detection: Events conflicting with existing bookings are skipped
  - Organizer info stored in bookedForName/bookedForEmail
  - Configurable time range (7-90 days ahead) and optional facility filter
- **Webhook subscriptions (automatic sync)**: Real-time calendar sync via Microsoft Graph change notifications
  - On server startup, auto-subscribes to calendar changes for all rooms with msGraphRoomEmail
  - Microsoft sends POST notifications to `/api/graph/webhook` when room calendar events change
  - Handles created/updated/deleted events: auto-creates bookings, updates existing, cancels deleted
  - Subscriptions expire after ~3 days; hourly renewal scheduler auto-renews expiring subscriptions
  - Deduplication by msGraphEventId prevents duplicate bookings
  - New bookings created by webhook use first admin user as owner
  - **Environment variable**: `WEBHOOK_BASE_URL` - public HTTPS URL for webhook endpoint (falls back to REPLIT_DEV_DOMAIN)
  - **Service module**: `server/webhooks.ts` - subscription lifecycle, notification processing, renewal scheduler
  - **Database table**: `graph_subscriptions` - tracks subscription ID, room, expiration, status, errors
  - **Admin UI**: `/admin/webhooks` page shows subscription status, allows subscribe all/remove/refresh
- **Self-hosted Ubuntu deployment** (see `deploy/` directory):
  - Docker-based: `deploy/install.sh` installs Docker, Nginx, Certbot, builds and starts everything
  - `deploy/docker-compose.yml` runs PostgreSQL 16 + app containers
  - `deploy/.env.example` — copy to `.env` and configure before first run
  - `deploy/update.sh` — pulls latest code, rebuilds, restarts
  - `deploy/nginx.conf` — Nginx reverse proxy config with SSL and WebSocket support
  - Production seed (`server/seed-production.ts`) creates only admin account (no demo data)
  - ADMIN_PASSWORD is required (no default) for production security
  - Set `WEBHOOK_BASE_URL` to the public HTTPS URL (e.g., `https://meetspace.yourcompany.com`)
  - Webhook endpoint must be accessible at `{WEBHOOK_BASE_URL}/api/graph/webhook`
  - Subscriptions auto-recover if server restarts (re-subscribes on startup)
- **API routes** (admin only):
  - `GET /api/graph/status` - Check if Graph credentials are configured
  - `POST /api/graph/test` - Test connection to Microsoft Graph
  - `GET /api/graph/rooms` - List room resources from Microsoft 365
  - `POST /api/graph/sync-rooms` - Import/update rooms from M365 into a facility
  - `POST /api/graph/import-events` - Import calendar events from M365 room calendars as bookings
  - `GET /api/graph/subscriptions` - List webhook subscriptions with room details
  - `POST /api/graph/subscriptions/subscribe-all` - Subscribe all M365 rooms to webhooks
  - `POST /api/graph/subscriptions/subscribe-room` - Subscribe single room
  - `DELETE /api/graph/subscriptions/:id` - Remove single subscription
  - `DELETE /api/graph/subscriptions` - Remove all subscriptions
  - `POST /api/graph/webhook` - Webhook endpoint (public, called by Microsoft Graph)
