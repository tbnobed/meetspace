# MeetSpace Manager - User Guide

**Version 1.0 | Conference Room Booking System**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Getting Started](#2-getting-started)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Dashboard](#4-dashboard)
5. [Viewing Room Availability](#5-viewing-room-availability)
6. [Booking a Conference Room](#6-booking-a-conference-room)
7. [Managing Your Bookings](#7-managing-your-bookings)
8. [Guest Booking (No Account Required)](#8-guest-booking-no-account-required)
9. [Site Admin - Booking on Behalf of Others](#9-site-admin---booking-on-behalf-of-others)
10. [Administration](#10-administration)
11. [Microsoft 365 Integration](#11-microsoft-365-integration)
12. [Email Notifications](#12-email-notifications)
13. [Self-Hosted Deployment](#13-self-hosted-deployment)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Overview

MeetSpace Manager is a multi-facility conference room booking system designed for organizations with office locations across different timezones. It provides:

- Real-time room availability across all facilities
- Conflict-free booking with automatic overlap detection
- Support for Microsoft Teams and Zoom virtual meetings
- Guest booking without requiring an account
- Microsoft 365 calendar integration with automatic event sync
- Admin controls for managing facilities, rooms, and users
- Email notifications for booking confirmations, cancellations, and account management
- Self-hosted deployment option via Docker on Ubuntu servers

---

## 2. Getting Started

### Logging In

1. Navigate to the application URL in your browser.
2. You will see the login page. Enter your **username** and **password**.
3. Click **Log In** to access the system.

### Registering a New Account

1. On the login page, click the **Register** tab.
2. Fill in the required fields:
   - **Username** (minimum 3 characters)
   - **Password** (minimum 6 characters)
   - **Display Name**
   - **Email Address**
   - **Primary Facility** (optional)
3. Click **Register**.
4. After registration, your account must be **approved by an administrator** before you can log in. You will see a "pending approval" message. An admin will be notified of your registration.

### Navigation

After logging in, you will see a sidebar on the left with the following pages:

| Page | Description |
|------|-------------|
| **Dashboard** | Overview with booking stats and calendar view |
| **Rooms** | Real-time availability of all conference rooms |
| **Book a Room** | Create a new room booking |
| **My Bookings** | View and manage your personal bookings |

Administrators will see an additional **Administration** section with access to manage Rooms, Facilities, Users, Webhooks, and Audit Logs.

---

## 3. User Roles & Permissions

MeetSpace Manager has three user roles:

### Standard User (`user`)
- View the dashboard, room availability, and personal bookings
- Book conference rooms
- Cancel their own bookings
- Cannot access admin pages

### Site Admin (`site_admin`)
- Front desk or reception staff who manage bookings on behalf of others (e.g., executives, VPs)
- Can book rooms **on behalf of other people** by specifying a name and email
- Can only view and book rooms at their **assigned facilities**
- Cannot access the Administration section

### Administrator (`admin`)
- Full access to all features
- Manage facilities, rooms, and users
- Approve new user registrations
- Invite users via email
- View audit logs
- Configure Microsoft 365 integration and webhook subscriptions
- Delete facilities, rooms, and users

---

## 4. Dashboard

The Dashboard provides an at-a-glance overview of your organization's room usage:

- **Stat Cards** showing key metrics (total bookings, rooms in use, etc.)
- **Calendar View** with three display modes:
  - **Day View** - See all bookings for a single day
  - **Week View** - See bookings across the current week
  - **Month View** - See bookings across the current month
- Click on any booking in the calendar to view its details.

---

## 5. Viewing Room Availability

Navigate to the **Rooms** page to see real-time availability of all conference rooms.

### Features
- **Facility Tabs** - Filter rooms by facility using tabs at the top. Each facility tab shows its timezone abbreviation (e.g., PST, CST).
- **Room Cards** - Each room displays:
  - Room name and facility
  - Seating capacity
  - Available equipment
  - Current availability status:
    - **Available** (green) - Room is free. Shows when the next booking starts, if any.
    - **Occupied** (red) - Room is in use. Shows the current meeting title and when it ends.
- **Quick Book** - Click "Book Now" on any available room to open a quick booking form directly from this page.

### Real-Time Updates
Room availability updates automatically in real-time. You do not need to refresh the page to see the latest status.

---

## 6. Booking a Conference Room

Navigate to **Book a Room** to create a new booking.

### Step-by-Step

1. **Meeting Details**
   - **Meeting Title** (required) - A descriptive name for your meeting.
   - **Description** (optional) - Additional details about the meeting.

2. **Select a Room**
   - Choose a **Facility** from the dropdown.
   - Choose a **Room** from the available rooms at that facility.
   - Room details (capacity, floor, equipment) are shown to help you choose.

3. **Date & Time**
   - **Date** - Select the date for your booking.
   - **Start Time** and **End Time** - Choose the time window for your meeting.
   - The system will automatically check for conflicts. If the room is already booked during your selected time, you will receive an error message.

4. **Virtual Meeting** (optional)
   - **No virtual meeting** - In-person meeting only.
   - **Microsoft Teams** - Select this if the meeting will use Teams. A Teams meeting link is **automatically generated** by the room's calendar system (no link needed from you).
   - **Zoom** - Select this to include a Zoom meeting. You will be prompted to **paste your Zoom meeting link** (e.g., `https://zoom.us/j/...`).

5. **Attendees** (optional)
   - Enter attendee email addresses separated by commas.
   - Attendees will receive calendar invitations if Microsoft 365 integration is configured.

6. Click **Book Room** to confirm your booking.

### Conflict Detection
The system prevents double-booking. If the room is already reserved during your requested time, the booking will be rejected with an error message. Choose a different time or room.

---

## 7. Managing Your Bookings

Navigate to **My Bookings** to view and manage your personal bookings.

### Viewing Bookings
- All your upcoming and past bookings are listed.
- Each booking shows:
  - Meeting title
  - Room and facility
  - Date and time
  - Meeting type (Teams, Zoom, or in-person)
  - Meeting link (if applicable)
  - Status (confirmed or cancelled)

### Cancelling a Booking
1. Find the booking you want to cancel.
2. Click the **Cancel** button on the booking.
3. Confirm the cancellation.
4. The room will become available for others to book.
5. If Microsoft 365 integration is enabled, the corresponding Outlook calendar event will also be cancelled automatically.

### Room Acceptance Status
If Microsoft 365 integration is configured, bookings will show whether the room has **accepted**, **declined**, or **tentatively accepted** the calendar invitation. This reflects the room mailbox's auto-accept settings in your organization's Microsoft 365 environment.

---

## 8. Guest Booking (No Account Required)

The **Book a Room** page is publicly accessible. Users without an account can book rooms as guests:

1. Navigate directly to the booking page URL (e.g., `https://yoursite.com/book`).
2. Fill in the booking details as described in Section 6.
3. Under **Your Information**, provide:
   - **Full Name** (required)
   - **Email Address** (required)
4. Submit the booking.
5. A confirmation email will be sent to the provided email address (if email is configured).

Guest bookings follow the same conflict detection rules as regular bookings.

---

## 9. Site Admin - Booking on Behalf of Others

Site Admins (front desk / reception staff) have a special capability to book rooms on behalf of other people, such as executives or VPs.

### How It Works
1. Navigate to **Book a Room**.
2. You will see an additional **Book on Behalf Of** section.
3. Fill in:
   - **Name** - The name of the person the room is being booked for (e.g., "Jane Smith (CEO)").
   - **Email** - Their email address.
4. Leave these fields blank to book the room for yourself.
5. Complete the rest of the booking form as usual.

### Facility Restrictions
Site Admins can only view and book rooms at their **assigned facilities**. Your administrator assigns which facilities you have access to.

---

## 10. Administration

The following pages are available only to users with the **Admin** role.

### 10.1 Facility Management

**Path:** Administration > Facilities

Manage your organization's office locations.

- **Add Facility** - Create a new facility with a name, location, and timezone.
- **Edit Facility** - Update facility details by clicking the pencil icon.
- **Delete Facility** - Remove a facility by clicking the trash icon. Facilities with existing rooms or bookings must have those removed first.
- **Status** - Each facility can be marked as Active or Inactive.

**Supported Timezones:**
| Timezone | Label |
|----------|-------|
| America/New_York | Eastern (EST/EDT) |
| America/Chicago | Central (CST/CDT) |
| America/Denver | Mountain (MST/MDT) |
| America/Los_Angeles | Pacific (PST/PDT) |

### 10.2 Room Management

**Path:** Administration > Rooms

Manage conference rooms within each facility.

- **Add Room** - Create a new room with:
  - Name
  - Facility assignment
  - Seating capacity
  - Floor (optional)
  - Equipment list (e.g., TV, Whiteboard, Webcam, Speakerphone)
- **Edit Room** - Update room details.
- **Sync from Microsoft 365** - If Microsoft Graph is configured, import room resources directly from your Microsoft 365 directory.

### 10.3 User Management

**Path:** Administration > Users

Manage user accounts and access.

- **View Users** - See all registered users with their roles and approval status.
- **Create User** - Manually create a new user account (auto-approved, no registration approval needed).
- **Invite User** - Send an email invitation with temporary login credentials.
- **Edit User** - Change a user's display name, email, role, or facility.
- **Delete User** - Remove a user account.
- **Approve Users** - New self-registered users appear as "Pending Approval." Click to approve them so they can log in.
- **Facility Assignments** - For Site Admin users, assign which facilities they can access.

### 10.4 Webhook Management

**Path:** Administration > Webhooks

Manage Microsoft Graph webhook subscriptions for real-time calendar synchronization.

- **Subscribe All** - Subscribe to calendar change notifications for all Microsoft 365-linked rooms.
- **View Subscriptions** - See the status of each webhook subscription, including expiration time and error details.
- **Remove Subscriptions** - Remove individual or all webhook subscriptions.
- **Refresh** - Check the current status of all subscriptions.

Subscriptions automatically renew every few hours. If the server restarts, subscriptions are re-established automatically on startup.

### 10.5 Audit Log

**Path:** Administration > Audit Log

View a chronological log of all system changes, including:
- Facility creation, updates, and deletions
- Room creation and updates
- Booking creation and cancellation
- User creation, updates, and deletions
- Facility assignment changes

Each log entry shows the action performed, the user who performed it, the affected entity, and a timestamp.

---

## 11. Microsoft 365 Integration

MeetSpace Manager can integrate with Microsoft 365 for calendar synchronization.

### What It Does
- **Calendar Events** - When a room is booked, an Outlook calendar event is automatically created on the room's mailbox calendar.
- **Teams Meetings** - Selecting "Microsoft Teams" as the meeting type automatically creates a Teams meeting with a join link.
- **Room Sync** - Import room resources from your Microsoft 365 directory into MeetSpace.
- **Event Import** - Pull existing Outlook calendar events from room calendars into MeetSpace.
- **Real-Time Sync** - Webhook subscriptions listen for calendar changes in Microsoft 365 and automatically create, update, or cancel bookings in MeetSpace.
- **Event Cancellation** - Cancelling a booking in MeetSpace also cancels the corresponding Outlook calendar event.

### Prerequisites
To enable Microsoft 365 integration, your IT administrator must:

1. **Create an Azure App Registration** at [Azure Portal](https://portal.azure.com) > Azure Active Directory > App registrations.
2. **Grant API Permissions** (Application type):
   - `Calendars.ReadWrite`
   - `Place.Read.All`
3. **Create a Client Secret** and note the Client ID, Client Secret, and Tenant ID.
4. **Configure Environment Variables** on the server:
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`
   - `MICROSOFT_TENANT_ID`
5. **For webhooks**: Set `WEBHOOK_BASE_URL` to the public HTTPS URL of your MeetSpace installation (e.g., `https://meetspace.yourcompany.com`). The webhook endpoint must be accessible from the internet at `{WEBHOOK_BASE_URL}/api/graph/webhook`.

### Testing the Connection
1. Go to Administration > Rooms.
2. Look for the **Sync from Microsoft 365** button. If it appears, Graph credentials are configured.
3. An admin can test the connection from the admin interface.

---

## 12. Email Notifications

MeetSpace Manager sends email notifications for key events when SendGrid is configured.

### Notification Types

| Event | Recipients | Description |
|-------|-----------|-------------|
| Booking Confirmation | Booker (and booked-for person, if applicable) | Sent when a room is successfully booked. Includes meeting details, room, time, and meeting link. |
| Booking Cancellation | Booker | Sent when a booking is cancelled. |
| New Registration Alert | All administrators | Sent when a new user registers and needs approval. |
| Account Approved | The user | Sent when an admin approves a pending user registration. |
| User Invitation | The invited user | Sent when an admin invites a user via email. Includes temporary login credentials. |

### Setup
Email notifications require a [SendGrid](https://sendgrid.com) account and API key.

1. Sign up at [https://app.sendgrid.com](https://app.sendgrid.com).
2. Create an API key under Settings > API Keys.
3. Configure the following environment variables:
   - `SENDGRID_API_KEY` - Your SendGrid API key.
   - `SENDGRID_FROM_EMAIL` - The sender email address (e.g., `noreply@yourcompany.com`). This address must be verified in your SendGrid account.

Email sending is non-blocking. If an email fails to send, it is logged but does not prevent the associated action (booking, registration, etc.) from completing.

---

## 13. Self-Hosted Deployment

MeetSpace Manager can be deployed on a self-hosted Ubuntu server using Docker.

### System Requirements
- Ubuntu 20.04 or newer
- Docker and Docker Compose (installed automatically by the setup script)
- A domain name pointing to your server (required for SSL)
- Port 80 and 443 open for web traffic

### Deployment Steps

1. **Clone the repository** to your server:
   ```bash
   git clone <repository-url> /opt/meetspace
   cd /opt/meetspace/deploy
   ```

2. **Create the environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env`** and configure all required values:
   - `POSTGRES_PASSWORD` - Strong database password
   - `SESSION_SECRET` - Random string for session encryption (generate with `openssl rand -hex 32`)
   - `ADMIN_PASSWORD` - Password for the default admin account (**required, no default**)
   - `ADMIN_EMAIL` - Email for the admin account
   - Optional: SendGrid and Microsoft 365 settings

4. **Run the installation script:**
   ```bash
   sudo bash install.sh
   ```
   This script will:
   - Install Docker and Docker Compose (if not already installed)
   - Install Nginx and Certbot for SSL
   - Build the application container
   - Start PostgreSQL and the application
   - Set up the database schema and create the admin account

5. **Configure Nginx** with your domain name and obtain an SSL certificate:
   - Edit `nginx.conf` to replace the server name with your domain.
   - Run `certbot --nginx -d yourdomain.com` to obtain a free SSL certificate.

6. **Access the application** at `https://yourdomain.com`.
   - Log in with username `admin` and the password you set in `ADMIN_PASSWORD`.

### Updating

To update to the latest version:
```bash
cd /opt/meetspace/deploy
sudo bash update.sh
```
This pulls the latest code, rebuilds the container, and restarts all services.

### Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_DB` | Yes | Database name (default: `meetspace`) |
| `POSTGRES_USER` | Yes | Database user (default: `meetspace`) |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `SESSION_SECRET` | Yes | Session cookie signing secret |
| `ADMIN_PASSWORD` | Yes | Initial admin account password |
| `ADMIN_EMAIL` | Yes | Initial admin account email |
| `SENDGRID_API_KEY` | No | SendGrid API key for email notifications |
| `SENDGRID_FROM_EMAIL` | No | Sender email address (default: `noreply@meetspace.io`) |
| `MICROSOFT_CLIENT_ID` | No | Azure App Registration client ID |
| `MICROSOFT_CLIENT_SECRET` | No | Azure App Registration client secret |
| `MICROSOFT_TENANT_ID` | No | Azure AD tenant ID |
| `WEBHOOK_BASE_URL` | No | Public HTTPS URL for webhook notifications |

---

## 14. Troubleshooting

### Common Issues

**I can't log in after registering.**
New registrations require admin approval. Contact your administrator to approve your account.

**The room I want is showing as unavailable.**
The room is currently booked during your requested time. Try a different time slot or choose another room. Use the Rooms page to see real-time availability.

**I don't see all facilities/rooms.**
If you are a Site Admin, you only see rooms at your assigned facilities. Contact your administrator to update your facility assignments.

**My booking was rejected due to a conflict.**
Another booking already exists for the same room and time. The system prevents double-booking. Choose a different time or room.

**I'm not receiving email notifications.**
Ensure SendGrid is properly configured with a valid API key and verified sender email address. Check with your administrator.

**Microsoft 365 calendar events are not being created.**
Verify that Microsoft Graph credentials are configured and the connection test passes. The room must have a Microsoft Graph room email address assigned in Room Management.

**Webhook subscriptions are failing.**
Ensure `WEBHOOK_BASE_URL` is set to a publicly accessible HTTPS URL. Microsoft Graph must be able to reach the webhook endpoint at `{WEBHOOK_BASE_URL}/api/graph/webhook`.

**I can't delete a facility.**
Facilities with existing rooms cannot be deleted. Remove or reassign all rooms in the facility first.

### Getting Help
Contact your system administrator for account issues, access problems, or configuration changes.
