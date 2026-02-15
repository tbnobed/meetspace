import { useState, useEffect, useCallback } from "react";
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
import { Clock, Users, CalendarClock, CheckCircle2, XCircle, Wifi, LogOut } from "lucide-react";

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
  currentMeeting: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    meetingType: string;
    organizer: string;
  } | null;
  nextMeeting: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    meetingType: string;
    organizer: string;
  } | null;
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

export default function KioskDisplay() {
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
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
      <div className={`flex items-center justify-between gap-2 px-6 py-3 ${isAvailable ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}>
        <div className="flex items-center gap-3">
          <Wifi className="w-4 h-4 opacity-60" />
          <span className="text-sm font-medium" data-testid="text-kiosk-facility">{status.room.facilityName}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Clock className="w-4 h-4 opacity-60" />
          <CurrentTime timezone={tz} />
          <Button
            size="icon"
            variant="ghost"
            onClick={handleLogout}
            data-testid="button-kiosk-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold" data-testid="text-kiosk-room-name">{status.room.name}</h1>
          <div className="flex items-center justify-center gap-3 text-muted-foreground text-sm">
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {status.room.capacity}
            </span>
            {status.room.floor && <span>Floor {status.room.floor}</span>}
          </div>
        </div>

        <div className="text-center">
          <Badge
            variant={isAvailable ? "default" : "destructive"}
            className="text-lg px-6 py-2"
            data-testid="badge-kiosk-status"
          >
            {isAvailable ? "Available" : isOccupied ? "Occupied" : "Upcoming"}
          </Badge>
        </div>

        {isOccupied && status.currentMeeting && (
          <Card className="w-full max-w-lg">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Current Meeting</p>
              <h2 className="text-xl font-semibold mb-2" data-testid="text-kiosk-current-title">{status.currentMeeting.title}</h2>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarClock className="w-4 h-4" />
                  {formatTimeRange(status.currentMeeting.startTime, status.currentMeeting.endTime, tz)}
                </span>
                <span>{status.currentMeeting.organizer}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-3" data-testid="text-kiosk-time-remaining">
                {getMinutesRemaining(status.currentMeeting.endTime)} min remaining
              </p>
            </CardContent>
          </Card>
        )}

        {isAvailable && (
          <div className="text-center space-y-4">
            {status.availableUntil ? (
              <p className="text-sm text-muted-foreground" data-testid="text-kiosk-available-until">
                Available until {formatTime(status.availableUntil, tz)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-kiosk-available-rest">
                Available for the rest of the day
              </p>
            )}
            <Button
              size="lg"
              onClick={() => setBookDialogOpen(true)}
              data-testid="button-kiosk-book"
            >
              <CheckCircle2 className="w-5 h-5 mr-2" />
              Book Now
            </Button>
          </div>
        )}

        {status.nextMeeting && !isOccupied && (
          <Card className="w-full max-w-lg">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Next Meeting</p>
              <h3 className="font-medium mb-1" data-testid="text-kiosk-next-title">{status.nextMeeting.title}</h3>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarClock className="w-4 h-4" />
                  {formatTimeRange(status.nextMeeting.startTime, status.nextMeeting.endTime, tz)}
                </span>
                <span>{status.nextMeeting.organizer}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {isOccupied && status.nextMeeting && (
          <Card className="w-full max-w-lg">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Up Next</p>
              <h3 className="font-medium mb-1">{status.nextMeeting.title}</h3>
              <span className="text-sm text-muted-foreground">
                {formatTimeRange(status.nextMeeting.startTime, status.nextMeeting.endTime, tz)}
              </span>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground" data-testid="text-kiosk-today-count">
          {status.todayTotal} meeting{status.todayTotal !== 1 ? "s" : ""} today
          {status.upcomingCount > 0 && ` \u00B7 ${status.upcomingCount} upcoming`}
        </p>
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
    </div>
  );
}
