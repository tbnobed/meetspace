import { eq, and, gte, lte, or, desc, ne, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  facilities, rooms, users, bookings, auditLogs, userFacilityAssignments, graphSubscriptions,
  type Facility, type InsertFacility,
  type Room, type InsertRoom,
  type User, type InsertUser,
  type Booking, type InsertBooking,
  type AuditLog, type InsertAuditLog,
  type UserFacilityAssignment, type InsertUserFacilityAssignment,
  type GraphSubscription, type InsertGraphSubscription,
  type RoomWithFacility, type BookingWithDetails,
} from "@shared/schema";

export interface IStorage {
  // Facilities
  getFacilities(): Promise<Facility[]>;
  getFacilitiesByIds(ids: string[]): Promise<Facility[]>;
  getFacility(id: string): Promise<Facility | undefined>;
  createFacility(data: InsertFacility): Promise<Facility>;
  updateFacility(id: string, data: Partial<InsertFacility>): Promise<Facility | undefined>;

  // Rooms
  getRooms(): Promise<RoomWithFacility[]>;
  getRoomsByFacilityIds(facilityIds: string[]): Promise<RoomWithFacility[]>;
  getRoom(id: string): Promise<RoomWithFacility | undefined>;
  createRoom(data: InsertRoom): Promise<Room>;
  updateRoom(id: string, data: Partial<InsertRoom>): Promise<Room | undefined>;

  // Users
  getUsers(): Promise<(User & { facility?: Facility })[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  nullifyAuditLogUser(userId: string): Promise<void>;
  getAdminEmails(): Promise<string[]>;

  // User Facility Assignments
  getUserFacilityAssignments(userId: string): Promise<UserFacilityAssignment[]>;
  setUserFacilityAssignments(userId: string, facilityIds: string[]): Promise<UserFacilityAssignment[]>;

  // Bookings
  getBookings(): Promise<BookingWithDetails[]>;
  getBookingsByUserId(userId: string): Promise<BookingWithDetails[]>;
  getBookingsByFacilityIds(facilityIds: string[]): Promise<BookingWithDetails[]>;
  getBookingsByRange(start: Date, end: Date): Promise<BookingWithDetails[]>;
  getTodayBookings(): Promise<BookingWithDetails[]>;
  getBooking(id: string): Promise<BookingWithDetails | undefined>;
  createBooking(data: InsertBooking): Promise<Booking>;
  cancelBooking(id: string): Promise<Booking | undefined>;
  checkConflict(roomId: string, startTime: Date, endTime: Date, excludeId?: string): Promise<boolean>;

  // Bookings - Graph
  updateBookingGraphEventId(id: string, msGraphEventId: string): Promise<void>;
  getRoomByGraphEmail(email: string): Promise<RoomWithFacility | undefined>;

  // Bookings - additional
  getBookingByGraphEventId(msGraphEventId: string): Promise<Booking | undefined>;
  updateBooking(id: string, data: Partial<InsertBooking>): Promise<Booking | undefined>;

  // Graph Subscriptions
  getGraphSubscriptions(): Promise<GraphSubscription[]>;
  getGraphSubscriptionByRoomEmail(roomEmail: string): Promise<GraphSubscription | undefined>;
  getGraphSubscriptionBySubscriptionId(subscriptionId: string): Promise<GraphSubscription | undefined>;
  createGraphSubscription(data: InsertGraphSubscription): Promise<GraphSubscription>;
  updateGraphSubscription(id: string, data: Partial<InsertGraphSubscription>): Promise<GraphSubscription | undefined>;
  deleteGraphSubscription(id: string): Promise<boolean>;
  getExpiringSubscriptions(beforeDate: Date): Promise<GraphSubscription[]>;

  // Audit
  getAuditLogs(): Promise<(AuditLog & { user?: Pick<User, "id" | "displayName" | "email"> })[]>;
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
}

export class DatabaseStorage implements IStorage {
  // Facilities
  async getFacilities(): Promise<Facility[]> {
    return db.select().from(facilities).orderBy(facilities.name);
  }

  async getFacilitiesByIds(ids: string[]): Promise<Facility[]> {
    if (ids.length === 0) return [];
    return db.select().from(facilities).where(inArray(facilities.id, ids)).orderBy(facilities.name);
  }

  async getFacility(id: string): Promise<Facility | undefined> {
    const [result] = await db.select().from(facilities).where(eq(facilities.id, id));
    return result;
  }

  async createFacility(data: InsertFacility): Promise<Facility> {
    const [result] = await db.insert(facilities).values(data).returning();
    return result;
  }

  async updateFacility(id: string, data: Partial<InsertFacility>): Promise<Facility | undefined> {
    const [result] = await db.update(facilities).set(data).where(eq(facilities.id, id)).returning();
    return result;
  }

  // Rooms
  async getRooms(): Promise<RoomWithFacility[]> {
    const result = await db
      .select()
      .from(rooms)
      .innerJoin(facilities, eq(rooms.facilityId, facilities.id))
      .orderBy(rooms.name);
    return result.map((r) => ({ ...r.rooms, facility: r.facilities }));
  }

  async getRoomsByFacilityIds(facilityIds: string[]): Promise<RoomWithFacility[]> {
    if (facilityIds.length === 0) return [];
    const result = await db
      .select()
      .from(rooms)
      .innerJoin(facilities, eq(rooms.facilityId, facilities.id))
      .where(inArray(rooms.facilityId, facilityIds))
      .orderBy(rooms.name);
    return result.map((r) => ({ ...r.rooms, facility: r.facilities }));
  }

  async getRoom(id: string): Promise<RoomWithFacility | undefined> {
    const [result] = await db
      .select()
      .from(rooms)
      .innerJoin(facilities, eq(rooms.facilityId, facilities.id))
      .where(eq(rooms.id, id));
    if (!result) return undefined;
    return { ...result.rooms, facility: result.facilities };
  }

  async createRoom(data: InsertRoom): Promise<Room> {
    const [result] = await db.insert(rooms).values(data).returning();
    return result;
  }

  async updateRoom(id: string, data: Partial<InsertRoom>): Promise<Room | undefined> {
    const [result] = await db.update(rooms).set(data).where(eq(rooms.id, id)).returning();
    return result;
  }

  // Users
  async getUsers(): Promise<(User & { facility?: Facility })[]> {
    const result = await db
      .select()
      .from(users)
      .leftJoin(facilities, eq(users.facilityId, facilities.id))
      .orderBy(users.displayName);
    return result.map((r) => ({
      ...r.users,
      facility: r.facilities || undefined,
    }));
  }

  async getUser(id: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.id, id));
    return result;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.username, username));
    return result;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.email, email));
    return result;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [result] = await db.insert(users).values(data).returning();
    return result;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [result] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async nullifyAuditLogUser(userId: string): Promise<void> {
    await db.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, userId));
  }

  async getAdminEmails(): Promise<string[]> {
    const admins = await db.select({ email: users.email }).from(users).where(eq(users.role, "admin"));
    return admins.map((a) => a.email);
  }

  // User Facility Assignments
  async getUserFacilityAssignments(userId: string): Promise<UserFacilityAssignment[]> {
    return db.select().from(userFacilityAssignments).where(eq(userFacilityAssignments.userId, userId));
  }

  async setUserFacilityAssignments(userId: string, facilityIds: string[]): Promise<UserFacilityAssignment[]> {
    await db.delete(userFacilityAssignments).where(eq(userFacilityAssignments.userId, userId));
    if (facilityIds.length === 0) return [];
    const values = facilityIds.map((facilityId) => ({ userId, facilityId }));
    return db.insert(userFacilityAssignments).values(values).returning();
  }

  // Bookings
  async getBookings(): Promise<BookingWithDetails[]> {
    const result = await db
      .select()
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .innerJoin(facilities, eq(rooms.facilityId, facilities.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .orderBy(desc(bookings.startTime));
    return result.map((r) => ({
      ...r.bookings,
      room: r.rooms,
      facility: r.facilities,
      user: { id: r.users.id, displayName: r.users.displayName, email: r.users.email },
    }));
  }

  async getBookingsByUserId(userId: string): Promise<BookingWithDetails[]> {
    const result = await db
      .select()
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .innerJoin(facilities, eq(rooms.facilityId, facilities.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .where(eq(bookings.userId, userId))
      .orderBy(desc(bookings.startTime));
    return result.map((r) => ({
      ...r.bookings,
      room: r.rooms,
      facility: r.facilities,
      user: { id: r.users.id, displayName: r.users.displayName, email: r.users.email },
    }));
  }

  async getBookingsByFacilityIds(facilityIds: string[]): Promise<BookingWithDetails[]> {
    if (facilityIds.length === 0) return [];
    const result = await db
      .select()
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .innerJoin(facilities, eq(rooms.facilityId, facilities.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .where(inArray(rooms.facilityId, facilityIds))
      .orderBy(desc(bookings.startTime));
    return result.map((r) => ({
      ...r.bookings,
      room: r.rooms,
      facility: r.facilities,
      user: { id: r.users.id, displayName: r.users.displayName, email: r.users.email },
    }));
  }

  async getBookingsByRange(start: Date, end: Date): Promise<BookingWithDetails[]> {
    const result = await db
      .select()
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .innerJoin(facilities, eq(rooms.facilityId, facilities.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .where(
        and(
          gte(bookings.endTime, start),
          lte(bookings.startTime, end),
          ne(bookings.status, "cancelled")
        )
      )
      .orderBy(bookings.startTime);
    return result.map((r) => ({
      ...r.bookings,
      room: r.rooms,
      facility: r.facilities,
      user: { id: r.users.id, displayName: r.users.displayName, email: r.users.email },
    }));
  }

  async getTodayBookings(): Promise<BookingWithDetails[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const result = await db
      .select()
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .innerJoin(facilities, eq(rooms.facilityId, facilities.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .where(
        and(
          gte(bookings.endTime, todayStart),
          lte(bookings.startTime, todayEnd),
          ne(bookings.status, "cancelled")
        )
      )
      .orderBy(bookings.startTime);

    return result.map((r) => ({
      ...r.bookings,
      room: r.rooms,
      facility: r.facilities,
      user: { id: r.users.id, displayName: r.users.displayName, email: r.users.email },
    }));
  }

  async getBooking(id: string): Promise<BookingWithDetails | undefined> {
    const [result] = await db
      .select()
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .innerJoin(facilities, eq(rooms.facilityId, facilities.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .where(eq(bookings.id, id));
    if (!result) return undefined;
    return {
      ...result.bookings,
      room: result.rooms,
      facility: result.facilities,
      user: { id: result.users.id, displayName: result.users.displayName, email: result.users.email },
    };
  }

  async createBooking(data: InsertBooking): Promise<Booking> {
    const bookingData = {
      ...data,
      startTime: typeof data.startTime === "string" ? new Date(data.startTime) : data.startTime,
      endTime: typeof data.endTime === "string" ? new Date(data.endTime) : data.endTime,
    };
    const [result] = await db.insert(bookings).values(bookingData).returning();
    return result;
  }

  async cancelBooking(id: string): Promise<Booking | undefined> {
    const [result] = await db
      .update(bookings)
      .set({ status: "cancelled" })
      .where(eq(bookings.id, id))
      .returning();
    return result;
  }

  async checkConflict(roomId: string, startTime: Date, endTime: Date, excludeId?: string): Promise<boolean> {
    const conditions = [
      eq(bookings.roomId, roomId),
      eq(bookings.status, "confirmed"),
      lte(bookings.startTime, endTime),
      gte(bookings.endTime, startTime),
    ];
    if (excludeId) {
      conditions.push(ne(bookings.id, excludeId));
    }
    const [result] = await db.select().from(bookings).where(and(...conditions)).limit(1);
    return !!result;
  }

  async updateBookingGraphEventId(id: string, msGraphEventId: string): Promise<void> {
    await db.update(bookings).set({ msGraphEventId }).where(eq(bookings.id, id));
  }

  async getRoomByGraphEmail(email: string): Promise<RoomWithFacility | undefined> {
    const [result] = await db
      .select()
      .from(rooms)
      .innerJoin(facilities, eq(rooms.facilityId, facilities.id))
      .where(eq(rooms.msGraphRoomEmail, email));
    if (!result) return undefined;
    return { ...result.rooms, facility: result.facilities };
  }

  // Bookings - additional
  async getBookingByGraphEventId(msGraphEventId: string): Promise<Booking | undefined> {
    const [result] = await db.select().from(bookings).where(eq(bookings.msGraphEventId, msGraphEventId));
    return result;
  }

  async updateBooking(id: string, data: Partial<InsertBooking>): Promise<Booking | undefined> {
    const updateData: Record<string, any> = { ...data };
    if (updateData.startTime && typeof updateData.startTime === "string") {
      updateData.startTime = new Date(updateData.startTime);
    }
    if (updateData.endTime && typeof updateData.endTime === "string") {
      updateData.endTime = new Date(updateData.endTime);
    }
    const [result] = await db.update(bookings).set(updateData).where(eq(bookings.id, id)).returning();
    return result;
  }

  // Graph Subscriptions
  async getGraphSubscriptions(): Promise<GraphSubscription[]> {
    return db.select().from(graphSubscriptions).orderBy(graphSubscriptions.roomEmail);
  }

  async getGraphSubscriptionByRoomEmail(roomEmail: string): Promise<GraphSubscription | undefined> {
    const [result] = await db.select().from(graphSubscriptions).where(eq(graphSubscriptions.roomEmail, roomEmail));
    return result;
  }

  async getGraphSubscriptionBySubscriptionId(subscriptionId: string): Promise<GraphSubscription | undefined> {
    const [result] = await db.select().from(graphSubscriptions).where(eq(graphSubscriptions.subscriptionId, subscriptionId));
    return result;
  }

  async createGraphSubscription(data: InsertGraphSubscription): Promise<GraphSubscription> {
    const [result] = await db.insert(graphSubscriptions).values(data).returning();
    return result;
  }

  async updateGraphSubscription(id: string, data: Partial<InsertGraphSubscription>): Promise<GraphSubscription | undefined> {
    const [result] = await db.update(graphSubscriptions).set(data).where(eq(graphSubscriptions.id, id)).returning();
    return result;
  }

  async deleteGraphSubscription(id: string): Promise<boolean> {
    const result = await db.delete(graphSubscriptions).where(eq(graphSubscriptions.id, id)).returning();
    return result.length > 0;
  }

  async getExpiringSubscriptions(beforeDate: Date): Promise<GraphSubscription[]> {
    return db.select().from(graphSubscriptions).where(
      and(
        lte(graphSubscriptions.expirationDateTime, beforeDate),
        eq(graphSubscriptions.status, "active")
      )
    );
  }

  // Audit
  async getAuditLogs(): Promise<(AuditLog & { user?: Pick<User, "id" | "displayName" | "email"> })[]> {
    const result = await db
      .select()
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.timestamp))
      .limit(200);
    return result.map((r) => ({
      ...r.audit_logs,
      user: r.users ? { id: r.users.id, displayName: r.users.displayName, email: r.users.email } : undefined,
    }));
  }

  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [result] = await db.insert(auditLogs).values(data).returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
