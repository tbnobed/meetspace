import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Users, CalendarClock, CheckCircle2, XCircle, Wifi, LogOut, Plus, CalendarPlus } from "lucide-react";

interface MeetingInfo {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  meetingType: string;
  organizer: string;
}

interface RoomStatus {
  room: {
    id: string;
    name: string;
    capacity: number;
    floor: string | null;
    equipment: string[];
    facilityName: string;
    timezone: string;
  };
  status: "available" | "occupied" | "upcoming";
  currentMeeting: MeetingInfo | null;
  nextMeeting: MeetingInfo | null;
  todayMeetings: MeetingInfo[];
  availableUntil: string | null;
  upcomingCount: number;
  todayTotal: number;
}

function formatTime(dateStr: string, tz: string) {
  try {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    });
  } catch {
    return new Date(dateStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
}

function formatTimeRange(start: string, end: string, tz: string) {
  return `${formatTime(start, tz)} - ${formatTime(end, tz)}`;
}

function getMinutesRemaining(endTimeStr: string) {
  return Math.max(0, Math.round((new Date(endTimeStr).getTime() - Date.now()) / 60000));
}

function CurrentTime({ timezone }: { timezone: string }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      try {
        setTime(new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          timeZone: timezone,
        }));
      } catch {
        setTime(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timezone]);

  return <span data-testid="text-kiosk-time">{time}</span>;
}

function getHourInTz(tz: string, date: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).formatToParts(date);
    const hourPart = parts.find(p => p.type === "hour");
    return hourPart ? parseInt(hourPart.value, 10) : date.getHours();
  } catch {
    return date.getHours();
  }
}

function DayTimeline({ meetings, timezone }: { meetings: MeetingInfo[]; timezone: string }) {
  const startHour = 7;
  const endHour = 20;
  const totalHours = endHour - startHour;
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const nowHour = getHourInTz(timezone);
  const nowMinute = (() => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        minute: "numeric",
        timeZone: timezone,
      }).formatToParts(new Date());
      const minPart = parts.find(p => p.type === "minute");
      return minPart ? parseInt(minPart.value, 10) : new Date().getMinutes();
    } catch {
      return new Date().getMinutes();
    }
  })();

  const nowPosition = ((nowHour - startHour) + nowMinute / 60) / totalHours * 100;
  const showNowLine = nowPosition >= 0 && nowPosition <= 100;

  const getMeetingPosition = (meeting: MeetingInfo) => {
    const start = new Date(meeting.startTime);
    const end = new Date(meeting.endTime);

    let startH: number, startM: number, endH: number, endM: number;
    try {
      const sp = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", hour12: false, timeZone: timezone }).formatToParts(start);
      const ep = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", hour12: false, timeZone: timezone }).formatToParts(end);
      startH = parseInt(sp.find(p => p.type === "hour")?.value || "0", 10);
      startM = parseInt(sp.find(p => p.type === "minute")?.value || "0", 10);
      endH = parseInt(ep.find(p => p.type === "hour")?.value || "0", 10);
      endM = parseInt(ep.find(p => p.type === "minute")?.value || "0", 10);
    } catch {
      startH = start.getHours();
      startM = start.getMinutes();
      endH = end.getHours();
      endM = end.getMinutes();
    }

    const meetStartFrac = ((startH - startHour) + startM / 60) / totalHours;
    const meetEndFrac = ((endH - startHour) + endM / 60) / totalHours;

    const clampedStart = Math.max(0, Math.min(100, meetStartFrac * 100));
    const clampedEnd = Math.max(0, Math.min(100, meetEndFrac * 100));
    const width = Math.max(0.5, clampedEnd - clampedStart);

    if (width <= 0) return null;
    return { left: `${clampedStart}%`, width: `${width}%` };
  };

  const hours = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);

  return (
    <div className="w-full" data-testid="kiosk-day-timeline">
      <div className="relative">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          {hours.map(h => (
            <span key={h} className="w-0 text-center" style={{ position: "relative" }}>
              {h === 0 ? "12a" : h <= 12 ? (h === 12 ? "12p" : `${h}a`) : `${h - 12}p`}
            </span>
          ))}
        </div>

        <div className="relative h-12 bg-muted/50 rounded-md overflow-hidden">
          {hours.map(h => (
            <div
              key={h}
              className="absolute top-0 bottom-0 border-l border-border/30"
              style={{ left: `${((h - startHour) / totalHours) * 100}%` }}
            />
          ))}

          {meetings.map(meeting => {
            const pos = getMeetingPosition(meeting);
            if (!pos) return null;
            const isCurrent = new Date(meeting.startTime) <= new Date() && new Date(meeting.endTime) > new Date();
            return (
              <div
                key={meeting.id}
                className={`absolute top-1 bottom-1 rounded-sm ${isCurrent ? "bg-destructive/80" : "bg-primary/60"}`}
                style={{ left: pos.left, width: pos.width }}
                title={`${meeting.title} - ${formatTimeRange(meeting.startTime, meeting.endTime, timezone)}`}
                data-testid={`timeline-meeting-${meeting.id}`}
              />
            );
          })}

          {showNowLine && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-foreground z-10"
              style={{ left: `${nowPosition}%` }}
            >
              <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-foreground" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MeetingList({ meetings, timezone }: { meetings: MeetingInfo[]; timezone: string }) {
  if (meetings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-meetings">
        No meetings scheduled today
      </p>
    );
  }

  return (
    <div className="space-y-2 flex-1 overflow-y-auto" data-testid="kiosk-meeting-list">
      {meetings.map(meeting => {
        const isPast = new Date(meeting.endTime) <= new Date();
        const isCurrent = new Date(meeting.startTime) <= new Date() && new Date(meeting.endTime) > new Date();
        return (
          <div
            key={meeting.id}
            className={`flex items-center gap-3 p-2 rounded-md text-sm ${isCurrent ? "bg-destructive/10" : isPast ? "opacity-50" : "bg-muted/50"}`}
            data-testid={`meeting-item-${meeting.id}`}
          >
            <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${isCurrent ? "bg-destructive" : isPast ? "bg-muted-foreground/30" : "bg-primary"}`} />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{meeting.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatTimeRange(meeting.startTime, meeting.endTime, timezone)}
                {meeting.organizer !== "Unknown" && ` \u00B7 ${meeting.organizer}`}
              </p>
            </div>
            {isCurrent && (
              <Badge variant="destructive" className="flex-shrink-0 text-xs">Now</Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

function generateTimeOptions(tz: string): string[] {
  const now = new Date();
  let currentH: number, currentM: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", hour12: false, timeZone: tz }).formatToParts(now);
    currentH = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    currentM = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
  } catch {
    currentH = now.getHours();
    currentM = now.getMinutes();
  }

  const roundedMin = Math.ceil(currentM / 15) * 15;
  let startH = currentH;
  let startM = roundedMin;
  if (startM >= 60) {
    startH += 1;
    startM = 0;
  }

  const times: string[] = [];
  for (let h = startH; h <= 23; h++) {
    for (let m = (h === startH ? startM : 0); m < 60; m += 15) {
      const hh = h.toString().padStart(2, "0");
      const mm = m.toString().padStart(2, "0");
      times.push(`${hh}:${mm}`);
    }
  }
  return times;
}

function formatTimeLabel(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr;
  if (h === 0) return `12:${m} AM`;
  if (h < 12) return `${h}:${m} AM`;
  if (h === 12) return `12:${m} PM`;
  return `${h - 12}:${m} PM`;
}

function ScheduleDialog({
  open,
  onOpenChange,
  roomName,
  timezone,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomName: string;
  timezone: string;
  onScheduled: () => void;
}) {
  const [title, setTitle] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const timeOptions = useMemo(() => generateTimeOptions(timezone), [timezone, open]);

  const endTimeOptions = useMemo(() => {
    if (!startTime) return timeOptions;
    return timeOptions.filter(t => t > startTime);
  }, [startTime, timeOptions]);

  useEffect(() => {
    if (startTime && (!endTime || endTime <= startTime)) {
      const [hStr, mStr] = startTime.split(":");
      let h = parseInt(hStr, 10);
      let m = parseInt(mStr, 10) + 30;
      if (m >= 60) { h += 1; m -= 60; }
      if (h <= 23) {
        setEndTime(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
      }
    }
  }, [startTime]);

  const handleSchedule = async () => {
    if (!startTime || !endTime) {
      setError("Please select start and end times");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const now = new Date();
      let dateStr: string;
      try {
        dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
      } catch {
        dateStr = now.toISOString().slice(0, 10);
      }

      const res = await fetch("/api/tablet/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "Scheduled Meeting",
          date: dateStr,
          startHour: startTime,
          endHour: endTime,
          organizerName: organizer || undefined,
        }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Scheduling failed");
      }

      onOpenChange(false);
      setTitle("");
      setOrganizer("");
      setStartTime("");
      setEndTime("");
      onScheduled();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule Meeting</DialogTitle>
          <DialogDescription>Schedule a future meeting for {roomName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" data-testid="text-schedule-error">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Meeting Title (optional)</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Scheduled Meeting"
              data-testid="input-schedule-title"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Your Name (optional)</label>
            <Input
              value={organizer}
              onChange={(e) => setOrganizer(e.target.value)}
              placeholder="Name"
              data-testid="input-schedule-organizer"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Time</label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger data-testid="select-schedule-start">
                  <SelectValue placeholder="Start" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(t => (
                    <SelectItem key={t} value={t}>{formatTimeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Time</label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger data-testid="select-schedule-end">
                  <SelectValue placeholder="End" />
                </SelectTrigger>
                <SelectContent>
                  {endTimeOptions.map(t => (
                    <SelectItem key={t} value={t}>{formatTimeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="w-full"
            onClick={handleSchedule}
            disabled={submitting || !startTime || !endTime}
            data-testid="button-schedule-confirm"
          >
            {submitting ? "Scheduling..." : "Schedule Meeting"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function KioskDisplay() {
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [bookTitle, setBookTitle] = useState("");
  const [bookOrganizer, setBookOrganizer] = useState("");
  const [bookDuration, setBookDuration] = useState(30);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/tablet/room-status", { credentials: "include" });
      if (res.status === 401) {
        window.location.href = "/tablet";
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch status");
      const data = await res.json();
      setStatus(data);
      setError("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 15000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleBook = async () => {
    setBooking(true);
    setBookError("");
    try {
      const res = await fetch("/api/tablet/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bookTitle || "Walk-in Booking",
          duration: bookDuration,
          organizerName: bookOrganizer || undefined,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Booking failed");
      }
      setBookDialogOpen(false);
      setBookTitle("");
      setBookOrganizer("");
      setBookDuration(30);
      fetchStatus();
    } catch (err: any) {
      setBookError(err.message);
    } finally {
      setBooking(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/tablet/logout", { method: "POST", credentials: "include" });
    window.location.href = "/tablet";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Skeleton className="h-64 w-96" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-12 text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">Connection Error</p>
            <p className="text-sm text-muted-foreground mb-4">{error || "Unable to load room status"}</p>
            <Button onClick={fetchStatus} data-testid="button-kiosk-retry">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAvailable = status.status === "available";
  const isOccupied = status.status === "occupied";
  const tz = status.room.timezone;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className={`flex items-center justify-between gap-4 px-8 py-6 ${isAvailable ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold" data-testid="text-kiosk-room-name">{status.room.name}</h1>
          <span className="opacity-60 text-xl">|</span>
          <span className="text-base font-medium" data-testid="text-kiosk-facility">{status.room.facilityName}</span>
          <div className="flex items-center gap-1 text-base opacity-75">
            <Users className="w-5 h-5" />
            {status.room.capacity}
            {status.room.floor && <span className="ml-1">Floor {status.room.floor}</span>}
          </div>
        </div>
        <div className="flex items-center gap-4 text-base">
          <Clock className="w-5 h-5 opacity-60" />
          <CurrentTime timezone={tz} />
          <Button
            size="icon"
            variant="ghost"
            onClick={handleLogout}
            data-testid="button-kiosk-logout"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`w-9 flex-shrink-0 ${isAvailable ? "bg-green-500" : "bg-red-500"}`} data-testid="bar-kiosk-status" />
        <div className="flex-1 flex flex-col p-8 gap-6 justify-center relative">
          <div className="absolute inset-0 opacity-[0.08] pointer-events-none" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: "24px 24px",
          }} />

          <div className="relative flex items-center gap-4 flex-wrap">
            <Badge
              variant={isAvailable ? "default" : "destructive"}
              className="text-lg px-5 py-2"
              data-testid="badge-kiosk-status"
            >
              {isAvailable ? "Available" : isOccupied ? "Occupied" : "Upcoming"}
            </Badge>
          </div>

          {isOccupied && status.currentMeeting && (
            <Card className="relative">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Current Meeting</p>
                <h2 className="text-xl font-semibold" data-testid="text-kiosk-current-title">{status.currentMeeting.title}</h2>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-2">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="w-4 h-4" />
                    {formatTimeRange(status.currentMeeting.startTime, status.currentMeeting.endTime, tz)}
                  </span>
                  <span>{status.currentMeeting.organizer}</span>
                  <span data-testid="text-kiosk-time-remaining">
                    {getMinutesRemaining(status.currentMeeting.endTime)} min remaining
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {isAvailable && (
            <div className="relative flex items-center gap-4 flex-wrap">
              {status.availableUntil ? (
                <p className="text-muted-foreground" data-testid="text-kiosk-available-until">
                  Available until {formatTime(status.availableUntil, tz)}
                </p>
              ) : (
                <p className="text-muted-foreground" data-testid="text-kiosk-available-rest">
                  Available for the rest of the day
                </p>
              )}
              <div className="flex gap-3 ml-auto">
                <Button
                  size="lg"
                  onClick={() => setBookDialogOpen(true)}
                  data-testid="button-kiosk-book"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Book Now
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setScheduleDialogOpen(true)}
                  data-testid="button-kiosk-schedule"
                >
                  <CalendarPlus className="w-5 h-5 mr-2" />
                  Schedule
                </Button>
              </div>
            </div>
          )}

          {!isAvailable && (
            <div className="relative flex items-center gap-4 flex-wrap">
              {status.nextMeeting && !isOccupied && (
                <p className="text-muted-foreground">
                  Next: {status.nextMeeting.title} at {formatTime(status.nextMeeting.startTime, tz)}
                </p>
              )}
              {isOccupied && status.nextMeeting && (
                <p className="text-muted-foreground">
                  Up next: {status.nextMeeting.title} at {formatTime(status.nextMeeting.startTime, tz)}
                </p>
              )}
              <Button
                size="lg"
                variant="outline"
                className="ml-auto"
                onClick={() => setScheduleDialogOpen(true)}
                data-testid="button-kiosk-schedule"
              >
                <CalendarPlus className="w-5 h-5 mr-2" />
                Schedule
              </Button>
            </div>
          )}
        </div>

        <div className="w-72 border-l flex flex-col p-4 gap-3 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Today's Schedule
            </h3>
            <span className="text-xs text-muted-foreground" data-testid="text-kiosk-today-count">
              {status.todayTotal} meeting{status.todayTotal !== 1 ? "s" : ""}
            </span>
          </div>

          <MeetingList meetings={status.todayMeetings} timezone={tz} />
        </div>
      </div>

      <Dialog open={bookDialogOpen} onOpenChange={setBookDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Quick Book</DialogTitle>
            <DialogDescription>Book {status.room.name} right now</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {bookError && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" data-testid="text-kiosk-book-error">
                {bookError}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Meeting Title (optional)</label>
              <Input
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
                placeholder="Walk-in Booking"
                data-testid="input-kiosk-book-title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Your Name (optional)</label>
              <Input
                value={bookOrganizer}
                onChange={(e) => setBookOrganizer(e.target.value)}
                placeholder="Name"
                data-testid="input-kiosk-book-organizer"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Duration</label>
              <div className="grid grid-cols-4 gap-2">
                {[15, 30, 45, 60].map((d) => (
                  <Button
                    key={d}
                    variant={bookDuration === d ? "default" : "outline"}
                    className="toggle-elevate"
                    onClick={() => setBookDuration(d)}
                    data-testid={`button-kiosk-duration-${d}`}
                  >
                    {d}m
                  </Button>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleBook}
              disabled={booking}
              data-testid="button-kiosk-confirm-book"
            >
              {booking ? "Booking..." : "Confirm Booking"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ScheduleDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        roomName={status.room.name}
        timezone={tz}
        onScheduled={fetchStatus}
      />
    </div>
  );
}
