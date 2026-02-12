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
- `/admin/audit` - Audit log viewer (admin only)

## Data Model
- **Facilities**: 4 locations (Tustin/PST, Nashville/CST, Plex-Dallas/CST, Heritage-Dallas/CST)
- **Rooms**: ~20 rooms with capacity, floor, equipment info
- **Bookings**: Time-slot bookings with conflict detection, meeting type (Teams/Zoom/None), optional bookedForName/bookedForEmail for site admin bookings
- **Users**: Admin, user, and site_admin roles, bcrypt-hashed passwords, `approved` boolean (default false for self-registration, true for admin-created/guest users)
- **User Facility Assignments**: Junction table mapping site_admin users to their assigned facilities (many-to-many)
- **Audit Logs**: Track all system changes

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
- **API routes** (admin only):
  - `GET /api/graph/status` - Check if Graph credentials are configured
  - `POST /api/graph/test` - Test connection to Microsoft Graph
  - `GET /api/graph/rooms` - List room resources from Microsoft 365
  - `POST /api/graph/sync-rooms` - Import/update rooms from M365 into a facility
  - `POST /api/graph/import-events` - Import calendar events from M365 room calendars as bookings
