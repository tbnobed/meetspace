import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatTime, formatDate, getBrowserTimezoneAbbr } from "@/lib/constants";
import { Link } from "wouter";
import {
  CalendarPlus,
  Clock,
  MapPin,
  Users,
  X,
  Video,
  CalendarDays,
  Monitor,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  Pencil,
} from "lucide-react";
import type { BookingWithDetails } from "@shared/schema";
import { useAuth } from "@/lib/auth";

function RoomStatusBadge({ bookingId }: { bookingId: string }) {
  const { data, isLoading } = useQuery<{
    status: string;
    message?: string;
    roomEmail?: string;
  }>({
    queryKey: ["/api/bookings", bookingId, "room-status"],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${bookingId}/room-status`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 60000,
    retry: false,
  });

  if (isLoading) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Checking room...
      </Badge>
    );
  }

  if (!data || data.status === "unavailable") return null;

  const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string; tooltip: string }> = {
    accepted: {
      label: "Room Accepted",
      icon: CheckCircle2,
      className: "text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700",
      tooltip: "The room has accepted this meeting invitation",
    },
    declined: {
      label: "Room Declined",
      icon: XCircle,
      className: "text-red-700 dark:text-red-400 border-red-300 dark:border-red-700",
      tooltip: "The room declined this meeting - it may have a scheduling conflict in Outlook",
    },
    tentativelyAccepted: {
      label: "Tentative",
      icon: HelpCircle,
      className: "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700",
      tooltip: "The room has tentatively accepted this meeting",
    },
    none: {
      label: "No Response",
      icon: HelpCircle,
      className: "text-muted-foreground",
      tooltip: "The room has not yet responded to this meeting invitation",
    },
  };

  const config = statusConfig[data.status] || statusConfig.none;
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={`text-[10px] gap-1 ${config.className}`} data-testid={`badge-room-status-${bookingId}`}>
          <Icon className="w-3 h-3" />
          {config.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{config.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function toFacilityDateTimeValue(utcDateStr: string, timezone: string): string {
  const d = new Date(utcDateStr);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function normalizeMeetingType(mt: string | null | undefined): string {
  if (!mt || mt === "none") return "none";
  const lower = mt.toLowerCase();
  if (lower === "teams" || lower === "teams meeting") return "teams";
  if (lower === "zoom") return "zoom";
  return mt;
}

function meetingTypeLabel(mt: string): string {
  if (mt === "teams") return "Teams Meeting";
  if (mt === "zoom") return "Zoom";
  return "No virtual meeting";
}

function EditBookingDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: BookingWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const facilityTz = booking.facility.timezone || "America/Los_Angeles";
  const [title, setTitle] = useState(booking.title);
  const [description, setDescription] = useState(booking.description || "");
  const [startTime, setStartTime] = useState(toFacilityDateTimeValue(booking.startTime as unknown as string, facilityTz));
  const [endTime, setEndTime] = useState(toFacilityDateTimeValue(booking.endTime as unknown as string, facilityTz));
  const [meetingType, setMeetingType] = useState(normalizeMeetingType(booking.meetingType));
  const [meetingLink, setMeetingLink] = useState(booking.meetingLink || "");
  const [attendees, setAttendees] = useState((booking.attendees || []).join(", "));
  const [validationError, setValidationError] = useState("");

  const updateBooking = useMutation({
    mutationFn: async () => {
      if (!title.trim()) {
        throw new Error("Title is required");
      }
      if (!startTime || !endTime) {
        throw new Error("Start and end times are required");
      }
      if (endTime <= startTime) {
        throw new Error("End time must be after start time");
      }

      const attendeesArr = attendees
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);

      await apiRequest("PATCH", `/api/bookings/${booking.id}`, {
        title,
        description: description || null,
        startTime,
        endTime,
        meetingType,
        meetingLink: meetingType === "zoom" ? meetingLink : null,
        attendees: attendeesArr,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/today"] });
      toast({ title: "Booking updated" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    setValidationError("");
    if (!title.trim()) {
      setValidationError("Title is required");
      return;
    }
    if (!startTime || !endTime) {
      setValidationError("Start and end times are required");
      return;
    }
    if (endTime <= startTime) {
      setValidationError("End time must be after start time");
      return;
    }
    updateBooking.mutate();
  };

  const tzAbbr = new Date().toLocaleString("en-US", { timeZone: facilityTz, timeZoneName: "short" }).split(" ").pop();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Booking</DialogTitle>
          <DialogDescription>
            Update your booking for {booking.room.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-edit-title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none"
              rows={2}
              data-testid="input-edit-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-start">Start Time ({tzAbbr})</Label>
              <Input
                id="edit-start"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                data-testid="input-edit-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-end">End Time ({tzAbbr})</Label>
              <Input
                id="edit-end"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                data-testid="input-edit-end"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-meeting-type">Meeting Type</Label>
            <Select value={meetingType} onValueChange={setMeetingType}>
              <SelectTrigger id="edit-meeting-type" data-testid="select-edit-meeting-type">
                <SelectValue>{meetingTypeLabel(meetingType)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No virtual meeting</SelectItem>
                <SelectItem value="teams">Teams Meeting</SelectItem>
                <SelectItem value="zoom">Zoom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {meetingType === "zoom" && (
            <div className="space-y-2">
              <Label htmlFor="edit-meeting-link">Zoom Link</Label>
              <Input
                id="edit-meeting-link"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://zoom.us/j/..."
                data-testid="input-edit-meeting-link"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="edit-attendees">Attendees (comma-separated emails)</Label>
            <Input
              id="edit-attendees"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="user1@example.com, user2@example.com"
              data-testid="input-edit-attendees"
            />
          </div>
          {validationError && (
            <p className="text-sm text-destructive" data-testid="text-edit-error">{validationError}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-edit-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateBooking.isPending}
            data-testid="button-edit-save"
          >
            {updateBooking.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookingCard({ booking }: { booking: BookingWithDetails }) {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const isPast = new Date(booking.endTime) < new Date();
  const isActive = new Date(booking.startTime) <= new Date() && new Date(booking.endTime) > new Date();

  const cancelBooking = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/bookings/${booking.id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/today"] });
      toast({ title: "Booking cancelled" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cancel", description: error.message, variant: "destructive" });
    },
  });

  return (
    <>
      <Card className={`${isPast ? "opacity-60" : ""}`} data-testid={`booking-card-${booking.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-sm">{booking.title}</h3>
                {isActive && <Badge variant="default" className="text-[10px]">Live</Badge>}
                {booking.status === "confirmed" && <RoomStatusBadge bookingId={booking.id} />}
              </div>
              {booking.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{booking.description}</p>
              )}
            </div>
            <StatusBadge status={booking.status} />
          </div>

          <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{formatDate(booking.startTime)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                <span className="ml-1">({getBrowserTimezoneAbbr()})</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{booking.room.name} - {booking.facility.name}</span>
            </div>
            {booking.meetingType && booking.meetingType !== "none" && (
              <div className="flex items-center gap-2">
                {booking.meetingType === "teams" || booking.meetingType === "Teams Meeting" ? (
                  <Monitor className="w-3.5 h-3.5 flex-shrink-0" />
                ) : (
                  <Video className="w-3.5 h-3.5 flex-shrink-0" />
                )}
                <span className="capitalize">{booking.meetingType}</span>
                {booking.meetingLink && (
                  <a
                    href={booking.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-xs text-muted-foreground"
                    data-testid={`link-meeting-${booking.id}`}
                  >
                    Join
                  </a>
                )}
              </div>
            )}
            {booking.attendees && booking.attendees.length > 0 && (
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{booking.attendees.length} attendee{booking.attendees.length !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>

          {booking.status === "confirmed" && !isPast && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setEditOpen(true)}
                data-testid={`button-edit-${booking.id}`}
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1" data-testid={`button-cancel-${booking.id}`}>
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will cancel "{booking.title}" in {booking.room.name}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-dialog-no">Keep Booking</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cancelBooking.mutate()}
                      className="bg-destructive text-destructive-foreground"
                      data-testid="button-cancel-dialog-yes"
                    >
                      Cancel Booking
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>
      {editOpen && (
        <EditBookingDialog
          booking={booking}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </>
  );
}

export default function MyBookings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isSiteAdmin = user?.role === "site_admin";

  const queryPath = isAdmin || isSiteAdmin ? "/api/bookings" : "/api/bookings?mine=true";
  const { data: bookings, isLoading } = useQuery<BookingWithDetails[]>({
    queryKey: [queryPath],
  });

  const pageTitle = isAdmin ? "All Bookings" : isSiteAdmin ? "Facility Bookings" : "My Bookings";
  const pageDescription = isAdmin
    ? "View and manage all conference room reservations across all facilities"
    : isSiteAdmin
      ? "View and manage bookings for your assigned facilities"
      : "View and manage your conference room reservations";

  const now = new Date();
  const upcoming = bookings?.filter(
    (b) => b.status === "confirmed" && new Date(b.endTime) >= now
  ) || [];
  const past = bookings?.filter(
    (b) => b.status === "confirmed" && new Date(b.endTime) < now
  ) || [];
  const cancelled = bookings?.filter((b) => b.status === "cancelled") || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-4 space-y-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-24" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={pageDescription}
        actions={
          <Link href="/book">
            <Button data-testid="button-new-booking-from-list">
              <CalendarPlus className="w-4 h-4 mr-2" />
              New Booking
            </Button>
          </Link>
        }
      />

      <Tabs defaultValue="upcoming">
        <TabsList data-testid="tabs-bookings">
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            Upcoming ({upcoming.length})
          </TabsTrigger>
          <TabsTrigger value="past" data-testid="tab-past">
            Past ({past.length})
          </TabsTrigger>
          <TabsTrigger value="cancelled" data-testid="tab-cancelled">
            Cancelled ({cancelled.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          {upcoming.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcoming.map((b) => <BookingCard key={b.id} booking={b} />)}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <CalendarDays className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-sm mb-3">No upcoming bookings</p>
                <Link href="/book">
                  <Button variant="outline" size="sm" data-testid="button-book-first">Book a Room</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          {past.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {past.map((b) => <BookingCard key={b.id} booking={b} />)}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground text-sm">No past bookings</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cancelled" className="mt-4">
          {cancelled.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cancelled.map((b) => <BookingCard key={b.id} booking={b} />)}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground text-sm">No cancelled bookings</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
