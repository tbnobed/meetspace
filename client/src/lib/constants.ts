export const FACILITY_TIMEZONES: Record<string, string> = {
  "America/Los_Angeles": "PST",
  "America/Chicago": "CST",
  "America/New_York": "EST",
  "America/Denver": "MST",
};

export const DEFAULT_FACILITIES = [
  { name: "Tustin", location: "Tustin, CA", timezone: "America/Los_Angeles" },
  { name: "Nashville", location: "Nashville, TN", timezone: "America/Chicago" },
  { name: "Plex - Dallas", location: "Dallas, TX", timezone: "America/Chicago" },
  { name: "Heritage - Dallas", location: "Dallas, TX", timezone: "America/Chicago" },
];

export const EQUIPMENT_OPTIONS = [
  "TV/Display",
  "Whiteboard",
  "Video Conference",
  "Phone",
  "Projector",
  "Webcam",
  "Speakers",
  "Microsoft Teams Room",
];

export const MEETING_TYPES = [
  { value: "none", label: "No virtual meeting" },
  { value: "teams", label: "Microsoft Teams" },
  { value: "zoom", label: "Zoom" },
];

export function getTimezoneAbbr(timezone: string): string {
  return FACILITY_TIMEZONES[timezone] || timezone;
}

export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getBrowserTimezoneAbbr(): string {
  const tz = getBrowserTimezone();
  if (FACILITY_TIMEZONES[tz]) return FACILITY_TIMEZONES[tz];
  const abbr = new Date().toLocaleTimeString("en-US", { timeZoneName: "short", timeZone: tz }).split(" ").pop();
  return abbr || tz;
}

export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTimeInZone(date: Date | string, timezone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    hour12: true,
  });
}

export function formatDateInZone(date: Date | string, timezone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });
}
