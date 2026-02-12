import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["admin", "user", "site_admin"]);
export const bookingStatusEnum = pgEnum("booking_status", ["confirmed", "cancelled", "pending"]);
export const auditActionEnum = pgEnum("audit_action", [
  "booking_created", "booking_cancelled", "booking_modified",
  "room_created", "room_updated", "room_deleted",
  "facility_created", "facility_updated", "facility_deleted",
  "user_created", "user_updated", "user_deleted"
]);

export const facilities = pgTable("facilities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  location: text("location").notNull(),
  timezone: text("timezone").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  floor: text("floor"),
  equipment: text("equipment").array(),
  isActive: boolean("is_active").notNull().default(true),
  msGraphRoomEmail: text("ms_graph_room_email"),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  facilityId: varchar("facility_id").references(() => facilities.id),
  approved: boolean("approved").notNull().default(false),
});

export const userFacilityAssignments = pgTable("user_facility_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
});

export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().references(() => rooms.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  status: bookingStatusEnum("status").notNull().default("confirmed"),
  meetingType: text("meeting_type").default("none"),
  attendees: text("attendees").array(),
  isRecurring: boolean("is_recurring").notNull().default(false),
  bookedForName: text("booked_for_name"),
  bookedForEmail: text("booked_for_email"),
  msGraphEventId: text("ms_graph_event_id"),
});

export const graphSubscriptions = pgTable("graph_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  roomEmail: text("room_email").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  expirationDateTime: timestamp("expiration_date_time", { withTimezone: true }).notNull(),
  clientState: text("client_state").notNull(),
  status: text("status").notNull().default("active"),
  lastNotificationAt: timestamp("last_notification_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: auditActionEnum("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id"),
  details: text("details"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().default(sql`now()`),
});

// Insert schemas
export const insertFacilitySchema = createInsertSchema(facilities).omit({ id: true });
export const insertRoomSchema = createInsertSchema(rooms).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertBookingSchema = createInsertSchema(bookings).omit({ id: true }).extend({
  startTime: z.string().or(z.date()),
  endTime: z.string().or(z.date()),
  bookedForName: z.string().nullable().optional(),
  bookedForEmail: z.string().nullable().optional(),
  msGraphEventId: z.string().nullable().optional(),
});
export const insertUserFacilityAssignmentSchema = createInsertSchema(userFacilityAssignments).omit({ id: true });
export const insertGraphSubscriptionSchema = createInsertSchema(graphSubscriptions).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });

// Types
export type Facility = typeof facilities.$inferSelect;
export type InsertFacility = z.infer<typeof insertFacilitySchema>;
export type Room = typeof rooms.$inferSelect;
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type UserFacilityAssignment = typeof userFacilityAssignments.$inferSelect;
export type InsertUserFacilityAssignment = z.infer<typeof insertUserFacilityAssignmentSchema>;
export type GraphSubscription = typeof graphSubscriptions.$inferSelect;
export type InsertGraphSubscription = z.infer<typeof insertGraphSubscriptionSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Extended types for frontend
export type RoomWithFacility = Room & { facility: Facility };
export type BookingWithDetails = Booking & { room: Room; facility: Facility; user: Pick<User, "id" | "displayName" | "email"> };
