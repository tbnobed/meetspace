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
    const user = await storage.createUser({
      username: parsed.data.username,
      password: hashed,
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      role: "user",
      facilityId: parsed.data.facilityId || null,
      approved: false,
    });
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

  // ── Public Routes ──
  app.get("/api/facilities", async (_req, res) => {
    const result = await storage.getFacilities();
    res.json(result);
  });

  app.get("/api/rooms", async (_req, res) => {
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
        bookedForName: bookedForName,
      };
      sendBookingConfirmation(emailParams).catch(() => {});
      if (bookedForEmail) {
        sendBookingConfirmation({ ...emailParams, to: bookedForEmail, displayName: bookedForName || "User" }).catch(() => {});
      }
    }

    io.emit("bookings:updated");
    res.status(201).json(booking);
  });

  // ── Protected Routes (require login) ──
  app.get("/api/bookings", requireAuth, async (_req, res) => {
    const result = await storage.getBookings();
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
    res.json(result);
  });

  app.get("/api/bookings/today", requireAuth, async (_req, res) => {
    const result = await storage.getTodayBookings();
    res.json(result);
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

    io.emit("bookings:updated");
    res.json(booking);
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
      res.json({ message: "User deleted" });
    } catch (error: any) {
      if (error.message?.includes("foreign key")) {
        return res.status(409).json({ message: "Cannot delete user with existing bookings. Cancel their bookings first." });
      }
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

  return httpServer;
}
