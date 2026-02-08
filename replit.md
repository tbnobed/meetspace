# MeetSpace Manager - Multi-Facility Conference Room Booking System

## Overview
Conference room management system for a multi-facility organization with ~20 conference rooms across 4 facilities in different timezones. Supports room booking with conflict detection, real-time availability dashboard, and admin management.

## Architecture
- **Frontend**: React + TypeScript with Vite, Shadcn UI, Tailwind CSS, wouter routing, TanStack Query
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Session-based (simplified for MVP)

## Key Pages
- `/` - Dashboard with real-time room availability across all facilities
- `/book` - Book a conference room with date/time selection
- `/bookings` - View and manage personal bookings
- `/admin/rooms` - Room CRUD management
- `/admin/facilities` - Facility CRUD management
- `/admin/users` - User listing
- `/admin/audit` - Audit log viewer

## Data Model
- **Facilities**: 4 locations (Tustin/PST, Nashville/CST, Plex-Dallas/CST, Heritage-Dallas/CST)
- **Rooms**: ~20 rooms with capacity, floor, equipment info
- **Bookings**: Time-slot bookings with conflict detection, meeting type (Teams/Zoom/None)
- **Users**: Admin and regular user roles
- **Audit Logs**: Track all system changes

## Running
- `npm run dev` starts Express + Vite dev server on port 5000
- Database schema auto-pushed and seeded on startup

## API Routes
All routes prefixed with `/api/`:
- `GET/POST /api/facilities`, `PATCH /api/facilities/:id`
- `GET/POST /api/rooms`, `PATCH /api/rooms/:id`
- `GET/POST /api/bookings`, `PATCH /api/bookings/:id/cancel`
- `GET /api/bookings/today`
- `GET /api/users`
- `GET /api/audit-logs`
