import crypto from "crypto";
import { storage } from "./storage";
import {
  isGraphConfigured,
  createGraphSubscription as createGraphSub,
  renewGraphSubscription as renewGraphSub,
  deleteGraphSubscription as deleteGraphSub,
  getCalendarEvent,
} from "./graph";
import type { Server as SocketIOServer } from "socket.io";

let renewalInterval: NodeJS.Timeout | null = null;
let ioInstance: SocketIOServer | null = null;

export function setSocketIO(io: SocketIOServer) {
  ioInstance = io;
}

function getWebhookUrl(): string {
  const baseUrl = process.env.WEBHOOK_BASE_URL || process.env.REPLIT_DEV_DOMAIN;
  if (!baseUrl) {
    throw new Error("WEBHOOK_BASE_URL environment variable is required for Graph webhook subscriptions");
  }
  const url = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
  return `${url}/api/graph/webhook`;
}

function generateClientState(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSubscriptionForRoom(roomId: string, roomEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await storage.getGraphSubscriptionByRoomEmail(roomEmail);
    if (existing) {
      try {
        const newExpiration = await renewGraphSub(existing.subscriptionId);
        await storage.updateGraphSubscription(existing.id, {
          expirationDateTime: new Date(newExpiration),
          status: "active",
          lastError: null,
        });
        console.log(`Renewed existing subscription for ${roomEmail}`);
        return { success: true };
      } catch (renewErr: any) {
        console.log(`Failed to renew subscription for ${roomEmail}, recreating: ${renewErr.message}`);
        try { await deleteGraphSub(existing.subscriptionId); } catch {}
        await storage.deleteGraphSubscription(existing.id);
      }
    }

    const webhookUrl = getWebhookUrl();
    const clientState = generateClientState();

    const result = await createGraphSub({
      roomEmail,
      notificationUrl: webhookUrl,
      clientState,
    });

    await storage.createGraphSubscription({
      roomId,
      roomEmail,
      subscriptionId: result.subscriptionId,
      expirationDateTime: new Date(result.expirationDateTime),
      clientState,
      status: "active",
      lastNotificationAt: null,
      lastError: null,
    });

    console.log(`Created subscription for ${roomEmail} (expires: ${result.expirationDateTime})`);
    return { success: true };
  } catch (error: any) {
    console.error(`Failed to create subscription for ${roomEmail}:`, error.message);
    return { success: false, error: error.message };
  }
}

export async function subscribeAllRooms(): Promise<{ total: number; success: number; failed: number; errors: string[] }> {
  if (!isGraphConfigured()) {
    return { total: 0, success: 0, failed: 0, errors: ["Microsoft Graph not configured"] };
  }

  const rooms = await storage.getRooms();
  const graphRooms = rooms.filter(r => r.msGraphRoomEmail);

  const results = { total: graphRooms.length, success: 0, failed: 0, errors: [] as string[] };

  for (const room of graphRooms) {
    const result = await createSubscriptionForRoom(room.id, room.msGraphRoomEmail!);
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push(`${room.name}: ${result.error}`);
    }
  }

  return results;
}

export async function removeSubscription(subscriptionDbId: string): Promise<boolean> {
  const sub = await storage.getGraphSubscriptions().then(subs => subs.find(s => s.id === subscriptionDbId));
  if (!sub) return false;

  try {
    await deleteGraphSub(sub.subscriptionId);
  } catch {}

  await storage.deleteGraphSubscription(sub.id);
  return true;
}

export async function removeAllSubscriptions(): Promise<number> {
  const subs = await storage.getGraphSubscriptions();
  let count = 0;
  for (const sub of subs) {
    try {
      await deleteGraphSub(sub.subscriptionId);
    } catch {}
    await storage.deleteGraphSubscription(sub.id);
    count++;
  }
  return count;
}

async function renewExpiringSubscriptions(): Promise<void> {
  try {
    const renewBefore = new Date();
    renewBefore.setHours(renewBefore.getHours() + 12);

    const expiring = await storage.getExpiringSubscriptions(renewBefore);

    for (const sub of expiring) {
      try {
        const newExpiration = await renewGraphSub(sub.subscriptionId);
        await storage.updateGraphSubscription(sub.id, {
          expirationDateTime: new Date(newExpiration),
          status: "active",
          lastError: null,
        });
        console.log(`Renewed subscription for ${sub.roomEmail} (new expiry: ${newExpiration})`);
      } catch (error: any) {
        console.error(`Failed to renew subscription for ${sub.roomEmail}:`, error.message);
        try {
          await deleteGraphSub(sub.subscriptionId);
        } catch {}
        await storage.deleteGraphSubscription(sub.id);

        const room = (await storage.getRooms()).find(r => r.msGraphRoomEmail === sub.roomEmail);
        if (room) {
          const result = await createSubscriptionForRoom(room.id, sub.roomEmail);
          if (!result.success) {
            console.error(`Failed to recreate subscription for ${sub.roomEmail}:`, result.error);
          }
        }
      }
    }
  } catch (error: any) {
    console.error("Subscription renewal check failed:", error.message);
  }
}

export function startRenewalScheduler(): void {
  if (renewalInterval) {
    clearInterval(renewalInterval);
  }

  renewalInterval = setInterval(renewExpiringSubscriptions, 60 * 60 * 1000);
  console.log("Graph subscription renewal scheduler started (runs hourly)");

  setTimeout(renewExpiringSubscriptions, 30 * 1000);
}

export function stopRenewalScheduler(): void {
  if (renewalInterval) {
    clearInterval(renewalInterval);
    renewalInterval = null;
  }
}


export async function processNotification(notification: any): Promise<void> {
  const { changeType, resource, resourceData, clientState, subscriptionId } = notification;

  const sub = await storage.getGraphSubscriptionBySubscriptionId(subscriptionId);
  if (!sub) {
    console.warn(`Received notification for unknown subscription: ${subscriptionId}`);
    return;
  }

  if (sub.clientState !== clientState) {
    console.warn(`Client state mismatch for subscription ${subscriptionId}`);
    return;
  }

  await storage.updateGraphSubscription(sub.id, {
    lastNotificationAt: new Date(),
  });

  const room = (await storage.getRooms()).find(r => r.msGraphRoomEmail === sub.roomEmail);
  if (!room) {
    console.warn(`Room not found for subscription ${sub.roomEmail}`);
    return;
  }

  const eventId = resourceData?.id;
  if (!eventId) {
    console.warn("Notification missing event ID");
    return;
  }

  try {
    if (changeType === "deleted") {
      await handleEventDeleted(eventId, room.id);
    } else if (changeType === "created" || changeType === "updated") {
      await handleEventCreatedOrUpdated(eventId, sub.roomEmail, room.id, changeType);
    }
  } catch (error: any) {
    console.error(`Error processing ${changeType} notification for event ${eventId}:`, error.message);
    await storage.updateGraphSubscription(sub.id, {
      lastError: `${changeType} processing error: ${error.message}`,
    });
  }
}

async function handleEventDeleted(eventId: string, roomId: string): Promise<void> {
  const existingBooking = await storage.getBookingByGraphEventId(eventId);
  if (existingBooking && existingBooking.status === "confirmed") {
    await storage.cancelBooking(existingBooking.id);
    await storage.createAuditLog({
      userId: null,
      action: "booking_cancelled",
      entityType: "booking",
      entityId: existingBooking.id,
      details: `Auto-cancelled via Microsoft 365 webhook: event deleted from Outlook`,
    });
    console.log(`Auto-cancelled booking ${existingBooking.id} (Outlook event deleted)`);
    ioInstance?.emit("bookings:updated");
  }
}

async function handleEventCreatedOrUpdated(
  eventId: string,
  roomEmail: string,
  roomId: string,
  changeType: string
): Promise<void> {
  const event = await getCalendarEvent(roomEmail, eventId);
  if (!event) {
    if (changeType === "updated") {
      await handleEventDeleted(eventId, roomId);
    }
    return;
  }

  if (event.isCancelled) {
    await handleEventDeleted(eventId, roomId);
    return;
  }

  const rawStart = event.start?.dateTime || "";
  const rawEnd = event.end?.dateTime || "";
  const startTime = new Date(rawStart.endsWith("Z") ? rawStart : rawStart + "Z");
  const endTime = new Date(rawEnd.endsWith("Z") ? rawEnd : rawEnd + "Z");

  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    console.warn(`Invalid dates in event ${eventId}`);
    return;
  }

  let meetingType = "none";
  if (event.isOnlineMeeting && event.onlineMeetingProvider === "teamsForBusiness") {
    meetingType = "Teams Meeting";
  }

  const attendees = (event.attendees || [])
    .filter((a: any) => a.type !== "resource")
    .map((a: any) => a.emailAddress?.address)
    .filter(Boolean);

  const organizerName = event.organizer?.emailAddress?.name || null;
  const organizerEmail = event.organizer?.emailAddress?.address || null;

  const existingBooking = await storage.getBookingByGraphEventId(eventId);

  if (existingBooking) {
    if (existingBooking.status === "cancelled") return;

    await storage.updateBooking(existingBooking.id, {
      title: event.subject || existingBooking.title,
      startTime: startTime,
      endTime: endTime,
      meetingType,
      attendees: attendees.length > 0 ? attendees : existingBooking.attendees,
      bookedForName: organizerName,
      bookedForEmail: organizerEmail,
    });

    console.log(`Updated booking ${existingBooking.id} from Outlook webhook`);
    ioInstance?.emit("bookings:updated");
  } else {
    const hasConflict = await storage.checkConflict(roomId, startTime, endTime);
    if (hasConflict) {
      console.log(`Skipping event ${eventId}: conflicts with existing booking`);
      return;
    }

    const booking = await storage.createBooking({
      roomId,
      userId: null,
      title: event.subject || "Outlook Meeting",
      description: `Auto-synced from Outlook calendar. Organizer: ${organizerName || organizerEmail || "Unknown"}`,
      startTime: startTime,
      endTime: endTime,
      status: "confirmed",
      meetingType,
      attendees,
      isRecurring: false,
      bookedForName: organizerName,
      bookedForEmail: organizerEmail,
      msGraphEventId: eventId,
    });

    await storage.createAuditLog({
      userId: null,
      action: "booking_created",
      entityType: "booking",
      entityId: booking.id,
      details: `Auto-created via Microsoft 365 webhook: "${event.subject}" by ${organizerName || organizerEmail || "Unknown"}`,
    });

    console.log(`Auto-created booking ${booking.id} from Outlook webhook`);
    ioInstance?.emit("bookings:updated");
  }
}
