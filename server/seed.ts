import { db } from "./db";
import { facilities, rooms, users, bookings, userFacilityAssignments } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedDatabase() {
  const existingFacilities = await db.select().from(facilities);
  if (existingFacilities.length > 0) {
    const existingUsers = await db.select().from(users);
    for (const user of existingUsers) {
      if (!user.password.startsWith("$2a$") && !user.password.startsWith("$2b$")) {
        const hashed = await bcrypt.hash(user.password, 10);
        await db.update(users).set({ password: hashed }).where(eq(users.id, user.id));
        console.log(`Rehashed password for user: ${user.username}`);
      }
    }
    return;
  }

  console.log("Seeding database with initial data...");

  const hashPassword = async (pw: string) => bcrypt.hash(pw, 10);

  const [tustin] = await db.insert(facilities).values({
    name: "Tustin",
    location: "Tustin, CA",
    timezone: "America/Los_Angeles",
  }).returning();

  const [nashville] = await db.insert(facilities).values({
    name: "Nashville",
    location: "Nashville, TN",
    timezone: "America/Chicago",
  }).returning();

  const [plex] = await db.insert(facilities).values({
    name: "Plex - Dallas",
    location: "Dallas, TX",
    timezone: "America/Chicago",
  }).returning();

  const [heritage] = await db.insert(facilities).values({
    name: "Heritage - Dallas",
    location: "Dallas, TX",
    timezone: "America/Chicago",
  }).returning();

  const roomsData = [
    { facilityId: tustin.id, name: "Pacific Room", capacity: 12, floor: "2nd Floor", equipment: ["TV/Display", "Video Conference", "Whiteboard", "Microsoft Teams Room"] },
    { facilityId: tustin.id, name: "Sunset Room", capacity: 8, floor: "2nd Floor", equipment: ["TV/Display", "Video Conference", "Phone"] },
    { facilityId: tustin.id, name: "Harbor View", capacity: 6, floor: "1st Floor", equipment: ["TV/Display", "Whiteboard"] },
    { facilityId: tustin.id, name: "Innovation Lab", capacity: 20, floor: "3rd Floor", equipment: ["Projector", "Video Conference", "Whiteboard", "Microsoft Teams Room", "Speakers"] },
    { facilityId: tustin.id, name: "Huddle Space A", capacity: 4, floor: "1st Floor", equipment: ["TV/Display", "Phone"] },
    { facilityId: nashville.id, name: "Music City", capacity: 14, floor: "3rd Floor", equipment: ["TV/Display", "Video Conference", "Whiteboard", "Microsoft Teams Room", "Speakers"] },
    { facilityId: nashville.id, name: "Broadway Room", capacity: 8, floor: "2nd Floor", equipment: ["TV/Display", "Video Conference", "Phone"] },
    { facilityId: nashville.id, name: "Bluebird Room", capacity: 6, floor: "2nd Floor", equipment: ["TV/Display", "Whiteboard"] },
    { facilityId: nashville.id, name: "Grand Ole", capacity: 24, floor: "1st Floor", equipment: ["Projector", "Video Conference", "Speakers", "Microsoft Teams Room", "Webcam"] },
    { facilityId: nashville.id, name: "Ryman Studio", capacity: 4, floor: "3rd Floor", equipment: ["TV/Display"] },
    { facilityId: plex.id, name: "Longhorn Room", capacity: 10, floor: "2nd Floor", equipment: ["TV/Display", "Video Conference", "Microsoft Teams Room"] },
    { facilityId: plex.id, name: "Maverick Room", capacity: 8, floor: "2nd Floor", equipment: ["TV/Display", "Whiteboard", "Phone"] },
    { facilityId: plex.id, name: "Star Room", capacity: 16, floor: "1st Floor", equipment: ["Projector", "Video Conference", "Speakers", "Microsoft Teams Room"] },
    { facilityId: plex.id, name: "Huddle B", capacity: 4, floor: "1st Floor", equipment: ["TV/Display"] },
    { facilityId: heritage.id, name: "Legacy Room", capacity: 12, floor: "2nd Floor", equipment: ["TV/Display", "Video Conference", "Whiteboard", "Microsoft Teams Room"] },
    { facilityId: heritage.id, name: "Pioneer Room", capacity: 6, floor: "1st Floor", equipment: ["TV/Display", "Phone"] },
    { facilityId: heritage.id, name: "Heritage Hall", capacity: 30, floor: "1st Floor", equipment: ["Projector", "Video Conference", "Speakers", "Microsoft Teams Room", "Webcam"] },
    { facilityId: heritage.id, name: "Frontier Room", capacity: 8, floor: "2nd Floor", equipment: ["TV/Display", "Video Conference"] },
    { facilityId: heritage.id, name: "Trailhead", capacity: 4, floor: "2nd Floor", equipment: ["TV/Display", "Whiteboard"] },
  ];

  const createdRooms = await db.insert(rooms).values(roomsData).returning();

  const [adminUser] = await db.insert(users).values({
    username: "admin",
    password: await hashPassword("admin123"),
    displayName: "System Admin",
    email: "admin@meetspace.io",
    role: "admin",
    facilityId: tustin.id,
  }).returning();

  const [jdoe] = await db.insert(users).values({
    username: "jdoe",
    password: await hashPassword("password"),
    displayName: "John Doe",
    email: "john.doe@company.com",
    role: "user",
    facilityId: tustin.id,
  }).returning();

  const [jsmith] = await db.insert(users).values({
    username: "jsmith",
    password: await hashPassword("password"),
    displayName: "Jane Smith",
    email: "jane.smith@company.com",
    role: "user",
    facilityId: nashville.id,
  }).returning();

  const [mwilson] = await db.insert(users).values({
    username: "mwilson",
    password: await hashPassword("password"),
    displayName: "Mike Wilson",
    email: "mike.wilson@company.com",
    role: "admin",
    facilityId: plex.id,
  }).returning();

  const [sjohnson] = await db.insert(users).values({
    username: "sjohnson",
    password: await hashPassword("password"),
    displayName: "Sarah Johnson",
    email: "sarah.johnson@company.com",
    role: "user",
    facilityId: heritage.id,
  }).returning();

  const [receptionist] = await db.insert(users).values({
    username: "lgarcia",
    password: await hashPassword("password"),
    displayName: "Lisa Garcia",
    email: "lisa.garcia@company.com",
    role: "site_admin",
    facilityId: tustin.id,
  }).returning();

  await db.insert(userFacilityAssignments).values([
    { userId: receptionist.id, facilityId: tustin.id },
    { userId: receptionist.id, facilityId: nashville.id },
  ]);

  const today = new Date();
  const makeTime = (hour: number, min: number = 0) => {
    const d = new Date(today);
    d.setHours(hour, min, 0, 0);
    return d;
  };

  const bookingsData = [
    {
      roomId: createdRooms[0].id, userId: jdoe.id,
      title: "Weekly Team Standup", description: "Regular team sync-up meeting",
      startTime: makeTime(9, 0), endTime: makeTime(9, 30),
      meetingType: "teams", attendees: ["john.doe@company.com", "jane.smith@company.com"], isRecurring: false,
    },
    {
      roomId: createdRooms[1].id, userId: jdoe.id,
      title: "Product Review", description: "Q1 product roadmap discussion",
      startTime: makeTime(10, 0), endTime: makeTime(11, 0),
      meetingType: "teams", attendees: ["john.doe@company.com", "mike.wilson@company.com", "sarah.johnson@company.com"], isRecurring: false,
    },
    {
      roomId: createdRooms[5].id, userId: jsmith.id,
      title: "Client Presentation", description: "New product demo for Acme Corp",
      startTime: makeTime(13, 0), endTime: makeTime(14, 30),
      meetingType: "zoom", attendees: ["jane.smith@company.com", "client@acme.com"], isRecurring: false,
    },
    {
      roomId: createdRooms[10].id, userId: mwilson.id,
      title: "Engineering Sprint Planning", description: "Sprint 24 planning session",
      startTime: makeTime(11, 0), endTime: makeTime(12, 0),
      meetingType: "teams", attendees: ["mike.wilson@company.com", "john.doe@company.com"], isRecurring: false,
    },
    {
      roomId: createdRooms[14].id, userId: sjohnson.id,
      title: "HR Town Hall", description: "Monthly all-hands meeting",
      startTime: makeTime(15, 0), endTime: makeTime(16, 0),
      meetingType: "teams", attendees: ["sarah.johnson@company.com"], isRecurring: false,
    },
    {
      roomId: createdRooms[3].id, userId: adminUser.id,
      title: "Innovation Workshop", description: "Brainstorming session for new features",
      startTime: makeTime(14, 0), endTime: makeTime(16, 0),
      meetingType: "none", attendees: ["admin@meetspace.io", "john.doe@company.com", "jane.smith@company.com", "mike.wilson@company.com"], isRecurring: false,
    },
  ];

  await db.insert(bookings).values(bookingsData);

  console.log("Database seeded successfully!");
}
