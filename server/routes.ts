import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertFacilitySchema, insertRoomSchema, insertBookingSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Facilities ──
  app.get("/api/facilities", async (_req, res) => {
    const result = await storage.getFacilities();
    res.json(result);
  });

  app.post("/api/facilities", async (req, res) => {
    const parsed = insertFacilitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.message });
    }
    const facility = await storage.createFacility(parsed.data);
    await storage.createAuditLog({
      action: "facility_created",
      entityType: "facility",
      entityId: facility.id,
      details: `Created facility: ${facility.name}`,
    });
    res.status(201).json(facility);
  });

  app.patch("/api/facilities/:id", async (req, res) => {
    const facility = await storage.updateFacility(req.params.id, req.body);
    if (!facility) return res.status(404).json({ message: "Facility not found" });
    await storage.createAuditLog({
      action: "facility_updated",
      entityType: "facility",
      entityId: facility.id,
      details: `Updated facility: ${facility.name}`,
    });
    res.json(facility);
  });

  // ── Rooms ──
  app.get("/api/rooms", async (_req, res) => {
    const result = await storage.getRooms();
    res.json(result);
  });

  app.get("/api/rooms/:id", async (req, res) => {
    const room = await storage.getRoom(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.json(room);
  });

  app.post("/api/rooms", async (req, res) => {
    const parsed = insertRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.message });
    }
    const room = await storage.createRoom(parsed.data);
    await storage.createAuditLog({
      action: "room_created",
      entityType: "room",
      entityId: room.id,
      details: `Created room: ${room.name}`,
    });
    res.status(201).json(room);
  });

  app.patch("/api/rooms/:id", async (req, res) => {
    const room = await storage.updateRoom(req.params.id, req.body);
    if (!room) return res.status(404).json({ message: "Room not found" });
    await storage.createAuditLog({
      action: "room_updated",
      entityType: "room",
      entityId: room.id,
      details: `Updated room: ${room.name}`,
    });
    res.json(room);
  });

  // ── Bookings ──
  app.get("/api/bookings", async (_req, res) => {
    const result = await storage.getBookings();
    res.json(result);
  });

  app.get("/api/bookings/range", async (req, res) => {
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

  app.get("/api/bookings/today", async (_req, res) => {
    const result = await storage.getTodayBookings();
    res.json(result);
  });

  app.get("/api/bookings/:id", async (req, res) => {
    const booking = await storage.getBooking(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    res.json(booking);
  });

  app.post("/api/bookings", async (req, res) => {
    // Inject default userId if not provided (no auth yet)
    const bodyWithUser = {
      ...req.body,
      userId: req.body.userId || (await getDefaultUserId()),
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

    // Check for conflicts
    const hasConflict = await storage.checkConflict(parsed.data.roomId, startTime, endTime);
    if (hasConflict) {
      return res.status(409).json({ message: "This room is already booked during the requested time slot" });
    }

    const booking = await storage.createBooking(parsed.data);
    await storage.createAuditLog({
      userId: parsed.data.userId,
      action: "booking_created",
      entityType: "booking",
      entityId: booking.id,
      details: `Booked "${booking.title}" in room ${parsed.data.roomId}`,
    });
    res.status(201).json(booking);
  });

  app.patch("/api/bookings/:id/cancel", async (req, res) => {
    const booking = await storage.cancelBooking(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    await storage.createAuditLog({
      action: "booking_cancelled",
      entityType: "booking",
      entityId: booking.id,
      details: `Cancelled booking: ${booking.title}`,
    });
    res.json(booking);
  });

  // ── Users ──
  app.get("/api/users", async (_req, res) => {
    const result = await storage.getUsers();
    res.json(result);
  });

  // ── Audit Logs ──
  app.get("/api/audit-logs", async (_req, res) => {
    const result = await storage.getAuditLogs();
    res.json(result);
  });

  return httpServer;
}

async function getDefaultUserId(): Promise<string> {
  const user = await storage.getUserByUsername("admin");
  if (user) return user.id;
  const allUsers = await storage.getUsers();
  if (allUsers.length > 0) return allUsers[0].id;
  throw new Error("No users found in the system");
}
