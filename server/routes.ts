import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { insertFacilitySchema, insertRoomSchema, insertBookingSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  sendBookingConfirmation,
  sendBookingCancellation,
  sendApprovalNotification,
  sendNewRegistrationAlert,
  sendInviteEmail,
} from "./email";
import {
  isGraphConfigured,
  listGraphRooms,
  createCalendarEvent,
  cancelCalendarEvent,
  getCalendarEvents,
  getEventDetails,
  testConnection as testGraphConnection,
} from "./graph";
import {
  setSocketIO,
  subscribeAllRooms,
  removeSubscription,
  removeAllSubscriptions,
  processNotification,
  startRenewalScheduler,
  createSubscriptionForRoom,
} from "./webhooks";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    socket.on("disconnect", () => {});
  });

  setSocketIO(io);

  if (isGraphConfigured()) {
    setTimeout(async () => {
      try {
        const result = await subscribeAllRooms();
        console.log(`Graph webhook subscriptions: ${result.success}/${result.total} active`);
        if (result.errors.length > 0) {
          console.warn("Subscription errors:", result.errors);
        }
        startRenewalScheduler();
      } catch (err: any) {
        console.error("Failed to initialize Graph webhooks:", err.message);
      }
    }, 5000);
  }

  // ── Auth Routes (public) ──
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    const user = await storage.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    if (!user.approved) {
      return res.status(403).json({ message: "Your account is pending approval. An administrator will review your registration shortly." });
    }
    req.session.userId = user.id;
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.post("/api/auth/register", async (req, res) => {
    const schema = z.object({
      username: z.string().min(3, "Username must be at least 3 characters"),
      password: z.string().min(6, "Password must be at least 6 characters"),
      displayName: z.string().min(1, "Display name is required"),
      email: z.string().email("Valid email is required"),
      facilityId: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const existing = await storage.getUserByUsername(parsed.data.username);
    if (existing) {
      return res.status(409).json({ message: "Username already taken" });
    }
    const hashed = await bcrypt.hash(parsed.data.password, 10);
    const existingEmail = await storage.getUserByEmail(parsed.data.email);
    let user;
    if (existingEmail && /^.+_\d{10,}$/.test(existingEmail.username)) {
      user = await storage.updateUser(existingEmail.id, {
        username: parsed.data.username,
        password: hashed,
        displayName: parsed.data.displayName,
        facilityId: parsed.data.facilityId || existingEmail.facilityId,
        approved: false,
      });
      if (!user) {
        return res.status(500).json({ message: "Failed to upgrade guest account" });
      }
    } else if (existingEmail) {
      return res.status(409).json({ message: "An account with this email already exists" });
    } else {
      user = await storage.createUser({
        username: parsed.data.username,
        password: hashed,
        displayName: parsed.data.displayName,
        email: parsed.data.email,
        role: "user",
        facilityId: parsed.data.facilityId || null,
        approved: false,
      });
    }
    const { password: _, ...safeUser } = user;

    const adminEmails = await storage.getAdminEmails();
    sendNewRegistrationAlert({
      adminEmails,
      newUserName: user.username,
      newUserEmail: user.email,
      newUserDisplayName: user.displayName,
    }).catch(() => {});

    io.emit("users:updated");
    res.status(201).json({ ...safeUser, pendingApproval: true });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Failed to logout" });
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const { password: _, ...safeUser } = user;

    if (user.role === "site_admin") {
      const assignments = await storage.getUserFacilityAssignments(user.id);
      return res.json({ ...safeUser, assignedFacilityIds: assignments.map((a) => a.facilityId) });
    }

    res.json(safeUser);
  });

  // ── Public Routes (with role-based facility filtering) ──
  app.get("/api/facilities", async (req, res) => {
    if (req.session.userId) {
      const user = await storage.getUser(req.session.userId);
      if (user && user.role === "site_admin") {
        const assignments = await storage.getUserFacilityAssignments(user.id);
        const facilityIds = assignments.map((a) => a.facilityId);
        const result = await storage.getFacilitiesByIds(facilityIds);
        return res.json(result);
      }
      if (user && user.role === "user" && user.facilityId) {
        const result = await storage.getFacilitiesByIds([user.facilityId]);
        return res.json(result);
      }
    }
    const result = await storage.getFacilities();
    res.json(result);
  });

  app.get("/api/rooms", async (req, res) => {
    if (req.session.userId) {
      const user = await storage.getUser(req.session.userId);
      if (user && user.role === "site_admin") {
        const assignments = await storage.getUserFacilityAssignments(user.id);
        const facilityIds = assignments.map((a) => a.facilityId);
        const result = await storage.getRoomsByFacilityIds(facilityIds);
        return res.json(result);
      }
      if (user && user.role === "user" && user.facilityId) {
        const result = await storage.getRoomsByFacilityIds([user.facilityId]);
        return res.json(result);
      }
    }
    const result = await storage.getRooms();
    res.json(result);
  });

  app.get("/api/rooms/:id", async (req, res) => {
    const room = await storage.getRoom(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.json(room);
  });

  // Public booking endpoint - supports authenticated, site_admin, and guest bookings
  app.post("/api/bookings", async (req, res) => {
    let userId = req.session.userId;
    let bookedForName: string | null = null;
    let bookedForEmail: string | null = null;

    if (!userId) {
      const { guestName, guestEmail } = req.body;
      if (!guestName || !guestEmail) {
        return res.status(400).json({ message: "Name and email are required for guest bookings" });
      }
      let guestUser = await storage.getUserByEmail(guestEmail);
      if (!guestUser) {
        const randomPass = await bcrypt.hash(Math.random().toString(36), 10);
        guestUser = await storage.createUser({
          username: guestEmail.split("@")[0] + "_" + Date.now(),
          password: randomPass,
          displayName: guestName,
          email: guestEmail,
          role: "user",
          facilityId: null,
          approved: true,
        });
      }
      userId = guestUser.id;
    } else {
      const currentUser = await storage.getUser(userId);
      if (currentUser && currentUser.role === "site_admin") {
        const room = await storage.getRoom(req.body.roomId);
        if (room) {
          const assignments = await storage.getUserFacilityAssignments(userId);
          const assignedFacilityIds = assignments.map((a) => a.facilityId);
          if (assignedFacilityIds.length > 0 && !assignedFacilityIds.includes(room.facilityId)) {
            return res.status(403).json({ message: "You are not assigned to this facility" });
          }
        }

        if (req.body.bookedForName && req.body.bookedForEmail) {
          bookedForName = req.body.bookedForName;
          bookedForEmail = req.body.bookedForEmail;
        }
      }
    }

    const bodyWithUser = {
      ...req.body,
      userId,
      bookedForName,
      bookedForEmail,
    };

    const parsed = insertBookingSchema.safeParse(bodyWithUser);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.message });
    }

    const startTime = new Date(parsed.data.startTime);
    const endTime = new Date(parsed.data.endTime);

    if (endTime <= startTime) {
      return res.status(400).json({ message: "End time must be after start time" });
    }

    const hasConflict = await storage.checkConflict(parsed.data.roomId, startTime, endTime);
    if (hasConflict) {
      return res.status(409).json({ message: "This room is already booked during the requested time slot" });
    }

    const booking = await storage.createBooking(parsed.data);
    const details = bookedForName
      ? `Booked "${booking.title}" in room ${parsed.data.roomId} on behalf of ${bookedForName}`
      : `Booked "${booking.title}" in room ${parsed.data.roomId}`;
    await storage.createAuditLog({
      userId,
      action: "booking_created",
      entityType: "booking",
      entityId: booking.id,
      details,
    });

    const room = await storage.getRoom(parsed.data.roomId);
    const booker = await storage.getUser(userId!);
    if (room && booker) {
      const formatTime = (d: Date) => d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
      const emailParams = {
        to: booker.email,
        displayName: booker.displayName,
        title: booking.title,
        roomName: room.name,
        facilityName: room.facility.name,
        startTime: formatTime(new Date(booking.startTime)),
        endTime: formatTime(new Date(booking.endTime)),
        meetingType: booking.meetingType || undefined,
        meetingLink: booking.meetingLink || undefined,
        bookedForName: bookedForName,
      };
      sendBookingConfirmation(emailParams).catch(() => {});
      if (bookedForEmail) {
        sendBookingConfirmation({ ...emailParams, to: bookedForEmail, displayName: bookedForName || "User" }).catch(() => {});
      }
    }

    if (isGraphConfigured() && room && room.msGraphRoomEmail) {
      try {
        const eventAttendees: string[] = [];
        if (booker?.email) eventAttendees.push(booker.email);
        if (bookedForEmail && !eventAttendees.includes(bookedForEmail)) eventAttendees.push(bookedForEmail);
        if (booking.attendees && Array.isArray(booking.attendees)) {
          for (const email of booking.attendees) {
            if (email && !eventAttendees.includes(email)) eventAttendees.push(email);
          }
        }
        const graphResult = await createCalendarEvent({
          roomEmail: room.msGraphRoomEmail,
          subject: booking.title,
          startTime: new Date(booking.startTime),
          endTime: new Date(booking.endTime),
          timezone: "UTC",
          body: booking.description || undefined,
          meetingType: booking.meetingType || undefined,
          organizerEmail: room.msGraphRoomEmail,
          attendees: eventAttendees.length > 0 ? eventAttendees : undefined,
        });
        await storage.updateBookingGraphEventId(booking.id, graphResult.eventId);
      } catch (graphErr: any) {
        console.error("Failed to create Graph calendar event:", graphErr.message);
      }
    }

    io.emit("bookings:updated");
    res.status(201).json(booking);
  });

  // ── Protected Routes (require login) ──
  app.get("/api/bookings", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId as string);
    if (!user) return res.status(401).json({ message: "User not found" });

    const mineOnly = req.query.mine === "true";

    if (mineOnly && user.role !== "admin") {
      const result = await storage.getBookingsByUserId(user.id);
      return res.json(result);
    }

    if (user.role === "admin") {
      const result = await storage.getBookings();
      return res.json(result);
    }

    if (user.role === "site_admin") {
      const assignments = await storage.getUserFacilityAssignments(user.id);
      const facilityIds = assignments.map((a) => a.facilityId);
      const result = await storage.getBookingsByFacilityIds(facilityIds);
      return res.json(result);
    }

    if (user.facilityId) {
      const result = await storage.getBookingsByFacilityIds([user.facilityId]);
      return res.json(result);
    }

    const result = await storage.getBookingsByUserId(user.id);
    res.json(result);
  });

  app.get("/api/bookings/range", requireAuth, async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ message: "start and end query parameters are required" });
    }
    const startDate = new Date(start as string);
    const endDate = new Date(end as string);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }
    const result = await storage.getBookingsByRange(startDate, endDate);
    const user = await storage.getUser(req.session.userId as string);
    if (user && user.role === "site_admin") {
      const assignments = await storage.getUserFacilityAssignments(user.id);
      const facilityIds = assignments.map((a) => a.facilityId);
      return res.json(result.filter((b) => facilityIds.includes(b.room.facilityId)));
    }
    if (user && user.role === "user" && user.facilityId) {
      return res.json(result.filter((b) => b.room.facilityId === user.facilityId));
    }
    res.json(result);
  });

  app.get("/api/bookings/today", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId as string);
    if (user && user.role === "site_admin") {
      const assignments = await storage.getUserFacilityAssignments(user.id);
      const facilityIds = assignments.map((a) => a.facilityId);
      const allToday = await storage.getTodayBookings();
      const filtered = allToday.filter((b) => facilityIds.includes(b.room.facilityId));
      return res.json(filtered);
    }
    const allToday = await storage.getTodayBookings();
    if (user && user.role === "user" && user.facilityId) {
      return res.json(allToday.filter((b) => b.room.facilityId === user.facilityId));
    }
    res.json(allToday);
  });

  app.get("/api/bookings/:id", requireAuth, async (req, res) => {
    const booking = await storage.getBooking(req.params.id as string);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    res.json(booking);
  });

  app.patch("/api/bookings/:id/cancel", requireAuth, async (req, res) => {
    const bookingDetails = await storage.getBooking(req.params.id as string);
    const booking = await storage.cancelBooking(req.params.id as string);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    await storage.createAuditLog({
      userId: req.session.userId as string,
      action: "booking_cancelled",
      entityType: "booking",
      entityId: booking.id,
      details: `Cancelled booking: ${booking.title}`,
    });

    if (bookingDetails) {
      const formatTime = (d: Date) => d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
      if (bookingDetails.user) {
        sendBookingCancellation({
          to: bookingDetails.user.email,
          displayName: bookingDetails.user.displayName,
          title: booking.title,
          roomName: bookingDetails.room.name,
          facilityName: bookingDetails.facility.name,
          startTime: formatTime(new Date(booking.startTime)),
          endTime: formatTime(new Date(booking.endTime)),
        }).catch(() => {});
      }

      if (isGraphConfigured() && booking.msGraphEventId && bookingDetails.room.msGraphRoomEmail) {
        try {
          await cancelCalendarEvent(bookingDetails.room.msGraphRoomEmail, booking.msGraphEventId);
        } catch (graphErr: any) {
          console.error("Failed to cancel Graph calendar event:", graphErr.message);
        }
      }
    }

    io.emit("bookings:updated");
    res.json(booking);
  });

  // ── Booking Room Status (Graph) ──
  app.get("/api/bookings/:id/room-status", requireAuth, async (req, res) => {
    try {
      if (!isGraphConfigured()) {
        return res.json({ status: "unavailable" });
      }
      const allBookings = await storage.getBookings();
      const booking = allBookings.find((b) => b.id === req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });

      const userId = req.session.userId as string;
      const user = await storage.getUser(userId);
      const isOwner = booking.userId === userId;
      const isAdmin = user?.role === "admin" || user?.role === "site_admin";
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      if (!booking.msGraphEventId) {
        return res.json({ status: "unavailable" });
      }
      const allRooms = await storage.getRooms();
      const room = allRooms.find((r) => r.id === booking.roomId);
      if (!room?.msGraphRoomEmail) {
        return res.json({ status: "unavailable" });
      }
      const details = await getEventDetails(room.msGraphRoomEmail, booking.msGraphEventId);
      if (!details) {
        return res.json({ status: "unknown" });
      }
      res.json({ status: details.roomResponse });
    } catch (error: any) {
      res.json({ status: "error" });
    }
  });

  // ── User Facility Assignments ──
  app.get("/api/users/:id/facility-assignments", requireAdmin, async (req, res) => {
    const assignments = await storage.getUserFacilityAssignments(req.params.id as string);
    res.json(assignments);
  });

  app.put("/api/users/:id/facility-assignments", requireAdmin, async (req, res) => {
    const schema = z.object({
      facilityIds: z.array(z.string()),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "facilityIds array is required" });
    }
    const assignments = await storage.setUserFacilityAssignments(req.params.id as string, parsed.data.facilityIds);
    await storage.createAuditLog({
      userId: req.session.userId as string,
      action: "user_updated",
      entityType: "user",
      entityId: req.params.id as string,
      details: JSON.stringify({ action: "facility_assignments_updated", facilityIds: parsed.data.facilityIds }),
    });
    io.emit("users:updated");
    res.json(assignments);
  });

  // ── Admin Routes ──
  app.post("/api/facilities", requireAdmin, async (req, res) => {
    const parsed = insertFacilitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.message });
    }
    const facility = await storage.createFacility(parsed.data);
    await storage.createAuditLog({
      userId: req.session.userId as string,
      action: "facility_created",
      entityType: "facility",
      entityId: facility.id,
      details: `Created facility: ${facility.name}`,
    });
    io.emit("facilities:updated");
    res.status(201).json(facility);
  });

  app.patch("/api/facilities/:id", requireAdmin, async (req, res) => {
    const facility = await storage.updateFacility(req.params.id as string, req.body);
    if (!facility) return res.status(404).json({ message: "Facility not found" });
    await storage.createAuditLog({
      userId: req.session.userId as string,
      action: "facility_updated",
      entityType: "facility",
      entityId: facility.id,
      details: `Updated facility: ${facility.name}`,
    });
    io.emit("facilities:updated");
    res.json(facility);
  });

  app.delete("/api/facilities/:id", requireAdmin, async (req, res) => {
    try {
      const facility = await storage.getFacility(req.params.id as string);
      if (!facility) return res.status(404).json({ message: "Facility not found" });
      const deleted = await storage.deleteFacility(req.params.id as string);
      if (!deleted) return res.status(404).json({ message: "Facility not found" });
      await storage.createAuditLog({
        userId: req.session.userId as string,
        action: "facility_deleted",
        entityType: "facility",
        entityId: req.params.id as string,
        details: `Deleted facility: ${facility.name}`,
      });
      io.emit("facilities:updated");
      res.json({ message: "Facility deleted" });
    } catch (error: any) {
      if (error.code === "23503") {
        return res.status(400).json({ message: "Cannot delete facility: it has rooms or bookings associated with it. Remove those first." });
      }
      throw error;
    }
  });

  app.post("/api/rooms", requireAdmin, async (req, res) => {
    const parsed = insertRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.message });
    }
    const room = await storage.createRoom(parsed.data);
    await storage.createAuditLog({
      userId: req.session.userId as string,
      action: "room_created",
      entityType: "room",
      entityId: room.id,
      details: `Created room: ${room.name}`,
    });
    io.emit("rooms:updated");
    res.status(201).json(room);
  });

  app.patch("/api/rooms/:id", requireAdmin, async (req, res) => {
    const room = await storage.updateRoom(req.params.id as string, req.body);
    if (!room) return res.status(404).json({ message: "Room not found" });
    await storage.createAuditLog({
      userId: req.session.userId as string,
      action: "room_updated",
      entityType: "room",
      entityId: room.id,
      details: `Updated room: ${room.name}`,
    });
    io.emit("rooms:updated");
    res.json(room);
  });

  app.get("/api/users", requireAdmin, async (_req, res) => {
    const allUsers = await storage.getUsers();
    const usersWithAssignments = await Promise.all(
      allUsers.map(async (user) => {
        if (user.role === "site_admin") {
          const assignments = await storage.getUserFacilityAssignments(user.id);
          return { ...user, assignedFacilityIds: assignments.map((a) => a.facilityId) };
        }
        return { ...user, assignedFacilityIds: [] as string[] };
      })
    );
    res.json(usersWithAssignments);
  });

  app.post("/api/users", requireAdmin, async (req, res) => {
    try {
      const schema = insertUserSchema.pick({
        username: true,
        displayName: true,
        email: true,
        role: true,
        facilityId: true,
      }).extend({
        password: z.string().min(6, "Password must be at least 6 characters"),
        assignedFacilityIds: z.array(z.string()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const existing = await storage.getUserByUsername(parsed.data.username);
      if (existing) {
        return res.status(409).json({ message: "Username already exists" });
      }
      const hashed = await bcrypt.hash(parsed.data.password, 10);
      const { assignedFacilityIds, ...userData } = parsed.data;
      const user = await storage.createUser({
        ...userData,
        password: hashed,
        approved: true,
      });

      if (parsed.data.role === "site_admin" && assignedFacilityIds && assignedFacilityIds.length > 0) {
        await storage.setUserFacilityAssignments(user.id, assignedFacilityIds);
      }

      await storage.createAuditLog({
        action: "user_created",
        entityType: "user",
        entityId: user.id,
        userId: req.session.userId as string,
        details: JSON.stringify({ username: user.username, displayName: user.displayName, role: user.role }),
      });
      const { password: _, ...safeUser } = user;
      io.emit("users:updated");
      res.status(201).json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const existing = await storage.getUser(id);
      if (!existing) {
        return res.status(404).json({ message: "User not found" });
      }
      const schema = z.object({
        displayName: z.string().min(1).optional(),
        email: z.string().email().optional(),
        role: z.enum(["admin", "user", "site_admin"]).optional(),
        facilityId: z.string().nullable().optional(),
        password: z.string().min(6).optional(),
        approved: z.boolean().optional(),
        assignedFacilityIds: z.array(z.string()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { assignedFacilityIds, ...updateFields } = parsed.data;
      const updateData: Record<string, any> = { ...updateFields };
      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 10);
      } else {
        delete updateData.password;
      }
      const updated = await storage.updateUser(id, updateData);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      const newRole = parsed.data.role || existing.role;
      if (newRole === "site_admin" && assignedFacilityIds !== undefined) {
        await storage.setUserFacilityAssignments(id, assignedFacilityIds);
      } else if (newRole !== "site_admin") {
        await storage.setUserFacilityAssignments(id, []);
      }

      if (parsed.data.approved === true && !existing.approved) {
        sendApprovalNotification({
          to: updated.email,
          displayName: updated.displayName,
        }).catch(() => {});
      }

      await storage.createAuditLog({
        action: "user_updated",
        entityType: "user",
        entityId: id,
        userId: req.session.userId as string,
        details: JSON.stringify({ displayName: updated.displayName, role: updated.role }),
      });
      const { password: _, ...safeUser } = updated;
      io.emit("users:updated");
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      if (id === req.session.userId) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }
      const existing = await storage.getUser(id);
      if (!existing) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.nullifyAuditLogUser(id);
      const deleted = await storage.deleteUser(id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete user" });
      }
      await storage.createAuditLog({
        action: "user_deleted",
        entityType: "user",
        entityId: id,
        userId: req.session.userId as string,
        details: JSON.stringify({ username: existing.username, displayName: existing.displayName }),
      });
      io.emit("users:updated");
      io.emit("bookings:updated");
      res.json({ message: "User deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete user" });
    }
  });

  app.post("/api/users/invite", requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email("Valid email is required"),
        displayName: z.string().min(1, "Display name is required"),
        role: z.enum(["admin", "user", "site_admin"]).default("user"),
        facilityId: z.string().nullable().optional(),
        assignedFacilityIds: z.array(z.string()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const existingByEmail = await storage.getUserByEmail(parsed.data.email);
      if (existingByEmail) {
        return res.status(409).json({ message: "A user with this email already exists" });
      }

      const tempPassword = crypto.randomBytes(6).toString("base64url");
      const username = parsed.data.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "") + "_" + Date.now().toString(36).slice(-4);
      const hashed = await bcrypt.hash(tempPassword, 10);

      const { assignedFacilityIds, ...userData } = parsed.data;
      const user = await storage.createUser({
        ...userData,
        username,
        password: hashed,
        facilityId: userData.facilityId || null,
        approved: true,
      });

      if (parsed.data.role === "site_admin" && assignedFacilityIds && assignedFacilityIds.length > 0) {
        await storage.setUserFacilityAssignments(user.id, assignedFacilityIds);
      }

      const emailSent = await sendInviteEmail({
        to: parsed.data.email,
        displayName: parsed.data.displayName,
        username,
        tempPassword,
      });

      await storage.createAuditLog({
        action: "user_created",
        entityType: "user",
        entityId: user.id,
        userId: req.session.userId as string,
        details: JSON.stringify({ action: "invite_sent", username, email: parsed.data.email, emailSent }),
      });

      const { password: _, ...safeUser } = user;
      io.emit("users:updated");
      res.status(201).json({ ...safeUser, emailSent });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to invite user" });
    }
  });

  app.get("/api/audit-logs", requireAdmin, async (_req, res) => {
    const result = await storage.getAuditLogs();
    res.json(result);
  });

  // ── Microsoft Graph Routes (Admin) ──
  app.get("/api/graph/status", requireAdmin, async (_req, res) => {
    res.json({ configured: isGraphConfigured() });
  });

  app.post("/api/graph/test", requireAdmin, async (_req, res) => {
    if (!isGraphConfigured()) {
      return res.status(400).json({ success: false, message: "Microsoft Graph credentials not configured" });
    }
    const result = await testGraphConnection();
    res.json(result);
  });

  app.get("/api/graph/rooms", requireAdmin, async (_req, res) => {
    if (!isGraphConfigured()) {
      return res.status(400).json({ message: "Microsoft Graph credentials not configured" });
    }
    try {
      const graphRooms = await listGraphRooms();
      res.json(graphRooms);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch rooms from Microsoft Graph" });
    }
  });

  app.post("/api/graph/sync-rooms", requireAdmin, async (req, res) => {
    if (!isGraphConfigured()) {
      return res.status(400).json({ message: "Microsoft Graph credentials not configured" });
    }
    try {
      const { facilityId, roomMappings } = req.body;
      if (!facilityId) {
        return res.status(400).json({ message: "facilityId is required" });
      }

      const graphRooms = await listGraphRooms();
      const existingRooms = await storage.getRooms();
      const results: { created: number; updated: number; skipped: number } = { created: 0, updated: 0, skipped: 0 };

      const roomsToSync = roomMappings
        ? graphRooms.filter((gr: any) => roomMappings.includes(gr.emailAddress))
        : graphRooms;

      for (const gr of roomsToSync) {
        const existing = existingRooms.find((r) => r.msGraphRoomEmail === gr.emailAddress);
        if (existing) {
          await storage.updateRoom(existing.id, {
            name: gr.displayName,
            capacity: gr.capacity || existing.capacity,
            msGraphRoomEmail: gr.emailAddress,
          });
          results.updated++;
        } else {
          await storage.createRoom({
            facilityId,
            name: gr.displayName,
            capacity: gr.capacity || 1,
            floor: gr.floorLabel || null,
            equipment: [],
            isActive: true,
            msGraphRoomEmail: gr.emailAddress,
          });
          results.created++;
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId as string,
        action: "room_created",
        entityType: "room",
        entityId: facilityId,
        details: `Synced rooms from Microsoft Graph: ${results.created} created, ${results.updated} updated`,
      });

      io.emit("rooms:updated");
      res.json({ message: `Sync complete: ${results.created} created, ${results.updated} updated`, ...results });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to sync rooms" });
    }
  });

  app.post("/api/graph/import-events", requireAdmin, async (req, res) => {
    if (!isGraphConfigured()) {
      return res.status(400).json({ message: "Microsoft Graph credentials not configured" });
    }
    try {
      const { facilityId, daysAhead } = req.body;
      const days = daysAhead || 30;

      const allRooms = await storage.getRooms();
      const rooms = allRooms.filter((r) => r.msGraphRoomEmail && (!facilityId || r.facilityId === facilityId));

      if (rooms.length === 0) {
        return res.json({ message: "No rooms with Microsoft 365 email found", imported: 0, skipped: 0 });
      }

      const now = new Date();
      const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const existingBookings = await storage.getBookings();
      const existingEventIds = new Set(existingBookings.filter((b) => b.msGraphEventId).map((b) => b.msGraphEventId));

      const results = { imported: 0, skipped: 0, errors: 0 };
      const importedIntervals: Map<string, { start: Date; end: Date }[]> = new Map();

      for (const room of rooms) {
        try {
          const events = await getCalendarEvents(room.msGraphRoomEmail!, now, end);
          for (const event of events) {
            if (existingEventIds.has(event.id)) {
              results.skipped++;
              continue;
            }
            if (event.isCancelled) {
              results.skipped++;
              continue;
            }

            const rawStart = event.start?.dateTime || "";
            const rawEnd = event.end?.dateTime || "";
            const startTime = new Date(rawStart.endsWith("Z") ? rawStart : rawStart + "Z");
            const endTime = new Date(rawEnd.endsWith("Z") ? rawEnd : rawEnd + "Z");

            if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
              results.skipped++;
              continue;
            }

            const hasExistingConflict = existingBookings.some(
              (b) =>
                b.roomId === room.id &&
                b.status === "confirmed" &&
                new Date(b.startTime) < endTime &&
                new Date(b.endTime) > startTime
            );
            if (hasExistingConflict) {
              results.skipped++;
              continue;
            }

            const roomIntervals = importedIntervals.get(room.id) || [];
            const hasBatchConflict = roomIntervals.some(
              (interval) => interval.start < endTime && interval.end > startTime
            );
            if (hasBatchConflict) {
              results.skipped++;
              continue;
            }

            let meetingType = "none";
            if (event.isOnlineMeeting && event.onlineMeetingProvider === "teamsForBusiness") {
              meetingType = "Teams Meeting";
            }

            await storage.createBooking({
              roomId: room.id,
              userId: null,
              title: event.subject || "Imported Meeting",
              description: `Imported from Outlook calendar. Organizer: ${event.organizer?.emailAddress?.name || event.organizer?.emailAddress?.address || "Unknown"}`,
              startTime: startTime,
              endTime: endTime,
              status: "confirmed",
              meetingType,
              attendees: (event.attendees || [])
                .filter((a: any) => a.type !== "resource")
                .map((a: any) => a.emailAddress?.address)
                .filter(Boolean),
              isRecurring: false,
              bookedForName: event.organizer?.emailAddress?.name || null,
              bookedForEmail: event.organizer?.emailAddress?.address || null,
              msGraphEventId: event.id,
            });

            existingEventIds.add(event.id);
            roomIntervals.push({ start: startTime, end: endTime });
            importedIntervals.set(room.id, roomIntervals);
            results.imported++;
          }
        } catch (err: any) {
          console.error(`Failed to import events for room ${room.name} (${room.msGraphRoomEmail}):`, err.message);
          results.errors++;
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId as string,
        action: "booking_created",
        entityType: "booking",
        entityId: facilityId || "all",
        details: `Imported events from Outlook: ${results.imported} imported, ${results.skipped} skipped, ${results.errors} room errors`,
      });

      io.emit("bookings:updated");
      res.json({
        message: `Import complete: ${results.imported} imported, ${results.skipped} skipped`,
        ...results,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to import calendar events" });
    }
  });

  // ── Graph Webhook Endpoint (public - called by Microsoft) ──
  app.post("/api/graph/webhook", async (req, res) => {
    if (req.query.validationToken) {
      console.log("Graph webhook validation request received");
      res.set("Content-Type", "text/plain");
      return res.status(200).send(req.query.validationToken as string);
    }

    res.status(202).send();

    try {
      const notifications = req.body?.value;
      if (!Array.isArray(notifications)) return;

      for (const notification of notifications) {
        try {
          await processNotification(notification);
        } catch (err: any) {
          console.error("Error processing webhook notification:", err.message);
        }
      }
    } catch (err: any) {
      console.error("Webhook processing error:", err.message);
    }
  });

  // ── Graph Subscription Management (Admin) ──
  app.get("/api/graph/subscriptions", requireAdmin, async (_req, res) => {
    try {
      const subs = await storage.getGraphSubscriptions();
      const rooms = await storage.getRooms();
      const enriched = subs.map(sub => {
        const room = rooms.find(r => r.id === sub.roomId);
        return {
          ...sub,
          roomName: room?.name || "Unknown",
          facilityName: room?.facility?.name || "Unknown",
          isExpired: new Date(sub.expirationDateTime) < new Date(),
        };
      });
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get subscriptions" });
    }
  });

  app.post("/api/graph/subscriptions/subscribe-all", requireAdmin, async (req, res) => {
    if (!isGraphConfigured()) {
      return res.status(400).json({ message: "Microsoft Graph credentials not configured" });
    }
    try {
      const result = await subscribeAllRooms();
      await storage.createAuditLog({
        userId: req.session.userId as string,
        action: "room_updated",
        entityType: "subscription",
        entityId: "all",
        details: `Subscribed to Graph webhooks: ${result.success}/${result.total} rooms`,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to subscribe rooms" });
    }
  });

  app.post("/api/graph/subscriptions/subscribe-room", requireAdmin, async (req, res) => {
    if (!isGraphConfigured()) {
      return res.status(400).json({ message: "Microsoft Graph credentials not configured" });
    }
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ message: "roomId is required" });

    try {
      const room = await storage.getRoom(roomId);
      if (!room) return res.status(404).json({ message: "Room not found" });
      if (!room.msGraphRoomEmail) return res.status(400).json({ message: "Room has no Microsoft 365 email configured" });

      const result = await createSubscriptionForRoom(room.id, room.msGraphRoomEmail);
      if (result.success) {
        res.json({ message: `Subscribed to ${room.name}` });
      } else {
        res.status(500).json({ message: result.error || "Failed to subscribe" });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to subscribe room" });
    }
  });

  app.delete("/api/graph/subscriptions/:id", requireAdmin, async (req, res) => {
    try {
      const removed = await removeSubscription(req.params.id as string);
      if (!removed) return res.status(404).json({ message: "Subscription not found" });
      res.json({ message: "Subscription removed" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to remove subscription" });
    }
  });

  app.delete("/api/graph/subscriptions", requireAdmin, async (req, res) => {
    try {
      const count = await removeAllSubscriptions();
      res.json({ message: `Removed ${count} subscriptions`, count });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to remove subscriptions" });
    }
  });

  // ── Tablet Routes ──

  function requireTabletAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session.tabletId || !req.session.tabletRoomId) {
      return res.status(401).json({ message: "Tablet authentication required" });
    }
    next();
  }

  app.post("/api/tablet/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    const tablet = await storage.getRoomTabletByUsername(username);
    if (!tablet || !tablet.isActive) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const valid = await bcrypt.compare(password, tablet.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    req.session.tabletId = tablet.id;
    req.session.tabletRoomId = tablet.roomId;
    const room = await storage.getRoom(tablet.roomId);
    res.json({
      tabletId: tablet.id,
      roomId: tablet.roomId,
      displayName: tablet.displayName,
      room: room || null,
    });
  });

  app.post("/api/tablet/logout", (req, res) => {
    req.session.destroy(() => {});
    res.json({ message: "Logged out" });
  });

  app.get("/api/tablet/me", requireTabletAuth, async (req, res) => {
    const tablet = await storage.getRoomTablet(req.session.tabletId as string);
    if (!tablet) return res.status(401).json({ message: "Tablet not found" });
    const room = await storage.getRoom(tablet.roomId);
    res.json({
      tabletId: tablet.id,
      roomId: tablet.roomId,
      displayName: tablet.displayName,
      room: room || null,
    });
  });

  app.get("/api/tablet/room-status", requireTabletAuth, async (req, res) => {
    const roomId = req.session.tabletRoomId as string;
    const room = await storage.getRoom(roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const allBookings = await storage.getBookingsByRange(todayStart, todayEnd);
    const roomBookings = allBookings
      .filter((b) => b.roomId === roomId && b.status === "confirmed")
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    const currentMeeting = roomBookings.find(
      (b) => new Date(b.startTime) <= now && new Date(b.endTime) > now
    );

    const upcomingMeetings = roomBookings.filter(
      (b) => new Date(b.startTime) > now
    );

    const nextMeeting = upcomingMeetings[0] || null;

    let availableUntil: Date | null = null;
    if (!currentMeeting && nextMeeting) {
      availableUntil = new Date(nextMeeting.startTime);
    }

    let status: "available" | "occupied" | "upcoming" = "available";
    if (currentMeeting) {
      status = "occupied";
    } else if (nextMeeting) {
      const minutesUntilNext = (new Date(nextMeeting.startTime).getTime() - now.getTime()) / 60000;
      if (minutesUntilNext <= 10) {
        status = "upcoming";
      }
    }

    const meetingMapper = (b: typeof roomBookings[0]) => ({
      id: b.id,
      title: b.title,
      startTime: b.startTime,
      endTime: b.endTime,
      meetingType: b.meetingType,
      organizer: b.bookedForName || b.user?.displayName || "Unknown",
    });

    res.json({
      room: {
        id: room.id,
        name: room.name,
        capacity: room.capacity,
        floor: room.floor,
        equipment: room.equipment,
        facilityName: room.facility?.name || "Unknown",
        timezone: room.facility?.timezone || "America/Los_Angeles",
      },
      status,
      currentMeeting: currentMeeting ? meetingMapper(currentMeeting) : null,
      nextMeeting: nextMeeting ? meetingMapper(nextMeeting) : null,
      todayMeetings: roomBookings.map(meetingMapper),
      availableUntil,
      upcomingCount: upcomingMeetings.length,
      todayTotal: roomBookings.length,
    });
  });

  app.post("/api/tablet/book", requireTabletAuth, async (req, res) => {
    const roomId = req.session.tabletRoomId as string;
    const { title, duration, organizerName } = req.body;

    if (!duration || ![15, 30, 45, 60].includes(duration)) {
      return res.status(400).json({ message: "Duration must be 15, 30, 45, or 60 minutes" });
    }

    const now = new Date();
    const startTime = new Date(Math.ceil(now.getTime() / (5 * 60000)) * (5 * 60000));
    const endTime = new Date(startTime.getTime() + duration * 60000);

    const hasConflict = await storage.checkConflict(roomId, startTime, endTime);
    if (hasConflict) {
      return res.status(409).json({ message: "Room is not available for the requested time" });
    }

    const room = await storage.getRoom(roomId);

    try {
      const booking = await storage.createBooking({
        roomId,
        userId: null,
        title: title || "Walk-in Booking",
        description: `Booked from room tablet${organizerName ? ` by ${organizerName}` : ""}`,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: "confirmed",
        meetingType: "none",
        meetingLink: null,
        attendees: null,
        isRecurring: false,
        bookedForName: organizerName || null,
        bookedForEmail: null,
        msGraphEventId: null,
      });

      if (room?.msGraphRoomEmail && isGraphConfigured()) {
        try {
          const graphEvent = await createCalendarEvent({
            roomEmail: room.msGraphRoomEmail,
            subject: booking.title,
            body: booking.description || "",
            startTime,
            endTime,
            timezone: room.facility?.timezone || "America/Los_Angeles",
            meetingType: "none",
            attendees: [],
          });
          if (graphEvent?.eventId) {
            await storage.updateBookingGraphEventId(booking.id, graphEvent.eventId);
          }
        } catch (e) {
          console.error("Failed to create calendar event for tablet booking:", e);
        }
      }

      io.emit("bookings:updated");
      res.status(201).json(booking);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create booking" });
    }
  });

  app.post("/api/tablet/schedule", requireTabletAuth, async (req, res) => {
    const roomId = req.session.tabletRoomId as string;
    const { title, startTime: startTimeStr, endTime: endTimeStr, organizerName } = req.body;

    if (!startTimeStr || !endTimeStr) {
      return res.status(400).json({ message: "Start time and end time are required" });
    }

    const startTime = new Date(startTimeStr);
    const endTime = new Date(endTimeStr);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    if (endTime <= startTime) {
      return res.status(400).json({ message: "End time must be after start time" });
    }

    if (startTime < new Date()) {
      return res.status(400).json({ message: "Cannot schedule meetings in the past" });
    }

    const hasConflict = await storage.checkConflict(roomId, startTime, endTime);
    if (hasConflict) {
      return res.status(409).json({ message: "Room is not available for the requested time" });
    }

    const room = await storage.getRoom(roomId);

    try {
      const booking = await storage.createBooking({
        roomId,
        userId: null,
        title: title || "Scheduled Meeting",
        description: `Scheduled from room tablet${organizerName ? ` by ${organizerName}` : ""}`,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: "confirmed",
        meetingType: "none",
        meetingLink: null,
        attendees: null,
        isRecurring: false,
        bookedForName: organizerName || null,
        bookedForEmail: null,
        msGraphEventId: null,
      });

      if (room?.msGraphRoomEmail && isGraphConfigured()) {
        try {
          const graphEvent = await createCalendarEvent({
            roomEmail: room.msGraphRoomEmail,
            subject: booking.title,
            body: booking.description || "",
            startTime,
            endTime,
            timezone: room.facility?.timezone || "America/Los_Angeles",
            meetingType: "none",
            attendees: [],
          });
          if (graphEvent?.eventId) {
            await storage.updateBookingGraphEventId(booking.id, graphEvent.eventId);
          }
        } catch (e) {
          console.error("Failed to create calendar event for scheduled tablet booking:", e);
        }
      }

      io.emit("bookings:updated");
      res.status(201).json(booking);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to schedule booking" });
    }
  });

  // ── Admin Tablet Management Routes ──

  app.get("/api/tablets", requireAdmin, async (req, res) => {
    const tablets = await storage.getRoomTablets();
    const safe = tablets.map(({ password, ...t }) => t);
    res.json(safe);
  });

  app.post("/api/tablets", requireAdmin, async (req, res) => {
    const parsed = z.object({
      roomId: z.string(),
      username: z.string().min(3),
      password: z.string().min(4),
      displayName: z.string().min(1),
      isActive: z.boolean().optional().default(true),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
    }

    const existing = await storage.getRoomTabletByUsername(parsed.data.username);
    if (existing) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(parsed.data.password, 10);
    const tablet = await storage.createRoomTablet({
      ...parsed.data,
      password: hashedPassword,
    });

    const { password, ...safe } = tablet;
    res.status(201).json(safe);
  });

  app.patch("/api/tablets/:id", requireAdmin, async (req, res) => {
    const parsed = z.object({
      roomId: z.string().optional(),
      username: z.string().min(3).optional(),
      password: z.string().min(4).optional(),
      displayName: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
    }

    const updateData: any = { ...parsed.data };
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    if (updateData.username) {
      const existing = await storage.getRoomTabletByUsername(updateData.username);
      if (existing && existing.id !== req.params.id) {
        return res.status(409).json({ message: "Username already exists" });
      }
    }

    const tablet = await storage.updateRoomTablet(req.params.id as string, updateData);
    if (!tablet) return res.status(404).json({ message: "Tablet not found" });

    const { password, ...safe } = tablet;
    res.json(safe);
  });

  app.delete("/api/tablets/:id", requireAdmin, async (req, res) => {
    const result = await storage.deleteRoomTablet(req.params.id as string);
    if (!result) return res.status(404).json({ message: "Tablet not found" });
    res.json({ message: "Tablet deleted" });
  });

  return httpServer;
}
