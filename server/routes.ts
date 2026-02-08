import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertFacilitySchema, insertRoomSchema, insertBookingSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";

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
    });
    req.session.userId = user.id;
    const { password: _, ...safeUser } = user;
    res.status(201).json(safeUser);
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

  // Public booking endpoint - supports both authenticated and guest bookings
  app.post("/api/bookings", async (req, res) => {
    let userId = req.session.userId;

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
        });
      }
      userId = guestUser.id;
    }

    const bodyWithUser = {
      ...req.body,
      userId,
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
    await storage.createAuditLog({
      userId,
      action: "booking_created",
      entityType: "booking",
      entityId: booking.id,
      details: `Booked "${booking.title}" in room ${parsed.data.roomId}`,
    });
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
    const booking = await storage.cancelBooking(req.params.id as string);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    await storage.createAuditLog({
      userId: req.session.userId as string,
      action: "booking_cancelled",
      entityType: "booking",
      entityId: booking.id,
      details: `Cancelled booking: ${booking.title}`,
    });
    res.json(booking);
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
    res.json(room);
  });

  app.get("/api/users", requireAdmin, async (_req, res) => {
    const result = await storage.getUsers();
    res.json(result);
  });

  app.get("/api/audit-logs", requireAdmin, async (_req, res) => {
    const result = await storage.getAuditLogs();
    res.json(result);
  });

  return httpServer;
}
