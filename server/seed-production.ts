import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedProductionDatabase() {
  const existingUsers = await db.select().from(users);

  if (existingUsers.length > 0) {
    for (const user of existingUsers) {
      if (!user.password.startsWith("$2a$") && !user.password.startsWith("$2b$")) {
        const hashed = await bcrypt.hash(user.password, 10);
        await db.update(users).set({ password: hashed }).where(eq(users.id, user.id));
        console.log(`Rehashed password for user: ${user.username}`);
      }
    }
    console.log("Database already seeded, skipping.");
    return;
  }

  console.log("Seeding production database with admin account...");

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error("ERROR: ADMIN_PASSWORD environment variable is required for production seeding.");
    console.error("Set ADMIN_PASSWORD in your .env file and restart.");
    return;
  }
  const adminEmail = process.env.ADMIN_EMAIL || "admin@meetspace.io";

  await db.insert(users).values({
    username: "admin",
    password: await bcrypt.hash(adminPassword, 10),
    displayName: "System Admin",
    email: adminEmail,
    role: "admin",
    approved: true,
  });

  console.log("Production database seeded with admin account.");
  console.log(`  Username: admin`);
  console.log(`  Email: ${adminEmail}`);
}
