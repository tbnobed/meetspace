import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatTimeInZone, formatDateInZone, getTimezoneAbbr } from "@/lib/constants";
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
} from "lucide-react";
import type { BookingWithDetails } from "@shared/schema";

function BookingCard({ booking }: { booking: BookingWithDetails }) {
  const { toast } = useToast();
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
    <Card className={`${isPast ? "opacity-60" : ""}`} data-testid={`booking-card-${booking.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-sm">{booking.title}</h3>
              {isActive && <Badge variant="default" className="text-[10px]">Live</Badge>}
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
            <span>{formatDateInZone(booking.startTime, booking.facility.timezone)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              {formatTimeInZone(booking.startTime, booking.facility.timezone)} - {formatTimeInZone(booking.endTime, booking.facility.timezone)}
              <span className="ml-1">({getTimezoneAbbr(booking.facility.timezone)})</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{booking.room.name} - {booking.facility.name}</span>
          </div>
          {booking.meetingType && booking.meetingType !== "none" && (
            <div className="flex items-center gap-2">
              {booking.meetingType === "teams" ? (
                <Monitor className="w-3.5 h-3.5 flex-shrink-0" />
              ) : (
                <Video className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              <span className="capitalize">{booking.meetingType} Meeting</span>
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full" data-testid={`button-cancel-${booking.id}`}>
                <X className="w-3.5 h-3.5 mr-1.5" />
                Cancel Booking
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
        )}
      </CardContent>
    </Card>
  );
}

export default function MyBookings() {
  const { data: bookings, isLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ["/api/bookings"],
  });

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
        title="My Bookings"
        description="View and manage your conference room reservations"
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
