import * as msal from "@azure/msal-node";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const clientId = process.env.MICROSOFT_CLIENT_ID || "";
const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || "";
const tenantId = process.env.MICROSOFT_TENANT_ID || "";

let ccaInstance: msal.ConfidentialClientApplication | null = null;

function getCCA(): msal.ConfidentialClientApplication {
  if (!ccaInstance) {
    if (!clientId || !clientSecret || !tenantId) {
      throw new Error("Microsoft Graph credentials not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_TENANT_ID.");
    }
    ccaInstance = new msal.ConfidentialClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        clientSecret,
      },
    });
  }
  return ccaInstance;
}

async function getAccessToken(): Promise<string> {
  const cca = getCCA();
  const result = await cca.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result || !result.accessToken) {
    throw new Error("Failed to acquire Microsoft Graph access token");
  }
  return result.accessToken;
}

async function graphFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Graph API error ${res.status}: ${errorBody}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function isGraphConfigured(): boolean {
  return !!(clientId && clientSecret && tenantId);
}

export interface GraphRoom {
  id: string;
  displayName: string;
  emailAddress: string;
  capacity: number;
  building: string | null;
  floorNumber: number | null;
  floorLabel: string | null;
  phone: string | null;
  address: {
    city: string;
    state: string;
    street: string;
    postalCode: string;
    countryOrRegion: string;
  } | null;
}

export async function listGraphRooms(): Promise<GraphRoom[]> {
  const rooms: GraphRoom[] = [];
  let url = "/places/microsoft.graph.room?$top=100";
  while (url) {
    const data = await graphFetch(url);
    if (data.value) {
      rooms.push(...data.value.map((r: any) => ({
        id: r.id,
        displayName: r.displayName,
        emailAddress: r.emailAddress,
        capacity: r.capacity || 0,
        building: r.building || null,
        floorNumber: r.floorNumber || null,
        floorLabel: r.floorLabel || null,
        phone: r.phone || null,
        address: r.address || null,
      })));
    }
    url = data["@odata.nextLink"] || null;
  }
  return rooms;
}

export interface CreateEventParams {
  roomEmail: string;
  subject: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  body?: string;
  meetingType?: string;
  organizerEmail?: string;
  attendees?: string[];
}

export async function createCalendarEvent(params: CreateEventParams): Promise<{ eventId: string; joinUrl?: string }> {
  const {
    roomEmail,
    subject,
    startTime,
    endTime,
    timezone,
    body,
    meetingType,
    organizerEmail,
    attendees,
  } = params;

  const isTeamsMeeting = meetingType?.toLowerCase() === "teams" || meetingType?.toLowerCase() === "teams meeting";

  const eventAttendees: any[] = [
    {
      type: "resource",
      emailAddress: {
        address: roomEmail,
        name: "Conference Room",
      },
    },
  ];

  if (attendees) {
    for (const email of attendees) {
      if (email && email.includes("@")) {
        eventAttendees.push({
          type: "required",
          emailAddress: { address: email },
        });
      }
    }
  }

  let eventBody = body || "";
  if (meetingType?.toLowerCase() === "zoom" && !eventBody.includes("zoom")) {
    eventBody += "\n\nMeeting Type: Zoom - Please use the Zoom link provided separately.";
  } else if (meetingType?.toLowerCase() === "google meet" && !eventBody.includes("meet.google")) {
    eventBody += "\n\nMeeting Type: Google Meet - Please use the Google Meet link provided separately.";
  }

  const eventData: any = {
    subject,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: "UTC",
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: "UTC",
    },
    location: {
      displayName: "Conference Room",
      locationUri: roomEmail,
      locationType: "conferenceRoom",
    },
    attendees: eventAttendees,
    body: {
      contentType: "text",
      content: eventBody || `Meeting: ${subject}`,
    },
  };

  if (isTeamsMeeting) {
    eventData.isOnlineMeeting = true;
    eventData.onlineMeetingProvider = "teamsForBusiness";
  }

  const calendarUser = organizerEmail || roomEmail;
  const result = await graphFetch(`/users/${calendarUser}/events`, {
    method: "POST",
    body: JSON.stringify(eventData),
  });

  return {
    eventId: result.id,
    joinUrl: result.onlineMeeting?.joinUrl || null,
  };
}

export async function cancelCalendarEvent(roomEmail: string, eventId: string): Promise<void> {
  await graphFetch(`/users/${roomEmail}/events/${eventId}`, {
    method: "DELETE",
  });
}

export async function getCalendarEvents(
  roomEmail: string,
  startTime: Date,
  endTime: Date
): Promise<any[]> {
  const start = startTime.toISOString();
  const end = endTime.toISOString();
  const allEvents: any[] = [];
  let url: string | null = `/users/${roomEmail}/calendarView?startDateTime=${start}&endDateTime=${end}&$top=50&$select=id,subject,start,end,organizer,attendees,isOnlineMeeting,onlineMeetingProvider,isCancelled`;
  while (url) {
    const data = await graphFetch(url, {
      headers: { Prefer: 'outlook.timezone="UTC"' },
    });
    if (data.value) {
      allEvents.push(...data.value);
    }
    url = data["@odata.nextLink"] || null;
  }
  return allEvents;
}

export async function getEventDetails(
  userOrRoomEmail: string,
  eventId: string
): Promise<{
  roomResponse: string;
  roomEmail: string | null;
  attendees: { email: string; name: string; type: string; response: string }[];
} | null> {
  try {
    const event = await graphFetch(
      `/users/${userOrRoomEmail}/events/${eventId}?$select=attendees`
    );
    if (!event || !event.attendees) return null;

    const attendees = event.attendees.map((a: any) => ({
      email: a.emailAddress?.address || "",
      name: a.emailAddress?.name || "",
      type: a.type || "required",
      response: a.status?.response || "none",
    }));

    const roomAttendee = attendees.find((a: any) => a.type === "resource");
    return {
      roomResponse: roomAttendee?.response || "none",
      roomEmail: roomAttendee?.email || null,
      attendees,
    };
  } catch (error: any) {
    console.error(`Failed to get event details for ${eventId}:`, error.message);
    return null;
  }
}

export async function getCalendarEvent(
  roomEmail: string,
  eventId: string
): Promise<any | null> {
  try {
    const event = await graphFetch(
      `/users/${roomEmail}/events/${eventId}?$select=id,subject,start,end,organizer,attendees,isOnlineMeeting,onlineMeetingProvider,isCancelled,body`,
      { headers: { Prefer: 'outlook.timezone="UTC"' } }
    );
    return event;
  } catch (error: any) {
    if (error.message?.includes("404")) return null;
    throw error;
  }
}

export interface CreateSubscriptionParams {
  roomEmail: string;
  notificationUrl: string;
  clientState: string;
  expirationMinutes?: number;
}

export async function createGraphSubscription(params: CreateSubscriptionParams): Promise<{
  subscriptionId: string;
  expirationDateTime: string;
}> {
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + (params.expirationMinutes || 4200));

  const subscriptionData = {
    changeType: "created,updated,deleted",
    notificationUrl: params.notificationUrl,
    resource: `/users/${params.roomEmail}/events`,
    expirationDateTime: expiration.toISOString(),
    clientState: params.clientState,
  };

  const result = await graphFetch("/subscriptions", {
    method: "POST",
    body: JSON.stringify(subscriptionData),
  });

  return {
    subscriptionId: result.id,
    expirationDateTime: result.expirationDateTime,
  };
}

export async function renewGraphSubscription(subscriptionId: string, expirationMinutes?: number): Promise<string> {
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + (expirationMinutes || 4200));

  const result = await graphFetch(`/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify({
      expirationDateTime: expiration.toISOString(),
    }),
  });

  return result.expirationDateTime;
}

export async function deleteGraphSubscription(subscriptionId: string): Promise<void> {
  try {
    await graphFetch(`/subscriptions/${subscriptionId}`, {
      method: "DELETE",
    });
  } catch (error: any) {
    if (!error.message?.includes("404")) {
      throw error;
    }
  }
}

export async function testConnection(): Promise<{ success: boolean; message: string; roomCount?: number }> {
  try {
    const rooms = await listGraphRooms();
    return {
      success: true,
      message: `Connected successfully. Found ${rooms.length} room(s) in your organization.`,
      roomCount: rooms.length,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to connect to Microsoft Graph",
    };
  }
}
