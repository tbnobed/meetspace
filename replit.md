# MeetSpace Manager - Multi-Facility Conference Room Booking System

## Overview
Conference room management system for a multi-facility organization with ~20 conference rooms across 4 facilities in different timezones. Supports room booking with conflict detection, real-time availability dashboard, and admin management.

## Architecture
- **Frontend**: React + TypeScript with Vite, Shadcn UI, Tailwind CSS, wouter routing, TanStack Query
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Session-based with bcryptjs password hashing and PostgreSQL session store (connect-pg-simple)

## Authentication
- Login/register at `/auth` page with session-based auth
- Passwords hashed with bcryptjs (10 rounds)
- Sessions stored in PostgreSQL via connect-pg-simple
- `/book` page is public (guest booking with name/email)
- All other pages require authentication
- Admin pages require `role: "admin"`
- Demo accounts: admin/admin123, jdoe/password, jsmith/password

## Key Pages
- `/auth` - Login and registration page
- `/` - Dashboard with stat cards and calendar view (day/week/month modes) (requires auth)
- `/meetings` - All Meetings with real-time room availability cards by facility (requires auth)
- `/book` - Book a conference room (public, supports guest booking)
- `/bookings` - View and manage personal bookings (requires auth)
- `/admin/rooms` - Room CRUD management (admin only)
- `/admin/facilities` - Facility CRUD management (admin only)
- `/admin/users` - User CRUD management (admin only)
- `/admin/audit` - Audit log viewer (admin only)

## Data Model
- **Facilities**: 4 locations (Tustin/PST, Nashville/CST, Plex-Dallas/CST, Heritage-Dallas/CST)
- **Rooms**: ~20 rooms with capacity, floor, equipment info
- **Bookings**: Time-slot bookings with conflict detection, meeting type (Teams/Zoom/None)
- **Users**: Admin and regular user roles, bcrypt-hashed passwords
- **Audit Logs**: Track all system changes

## Running
- `npm run dev` starts Express + Vite dev server on port 5000
- Database schema auto-pushed and seeded on startup
- Seed auto-rehashes any plaintext passwords on startup

## API Routes
All routes prefixed with `/api/`:

### Public
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/register` - Register new user
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `GET /api/facilities` - List facilities
- `GET /api/rooms` - List rooms
- `POST /api/bookings` - Create booking (supports guest with guestName/guestEmail)

### Authenticated
- `GET /api/bookings` - List all bookings
- `GET /api/bookings/range?start=ISO&end=ISO` - Date range query
- `GET /api/bookings/today` - Today's bookings
- `PATCH /api/bookings/:id/cancel` - Cancel booking

### Admin Only
- `POST /api/facilities`, `PATCH /api/facilities/:id`
- `POST /api/rooms`, `PATCH /api/rooms/:id`
- `GET /api/users`
- `GET /api/audit-logs`
