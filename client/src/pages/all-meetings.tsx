import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "wouter";
import {
  Building2,
  DoorOpen,
  CalendarPlus,
  Users,
  Monitor,
  Phone,
  Presentation,
  Wifi,
} from "lucide-react";
import { formatTime, getTimezoneAbbr } from "@/lib/constants";
import type { Facility, RoomWithFacility, BookingWithDetails } from "@shared/schema";

const equipmentIcons: Record<string, React.ReactNode> = {
  "TV/Display": <Monitor className="w-3.5 h-3.5" />,
  "Video Conference": <Wifi className="w-3.5 h-3.5" />,
  "Phone": <Phone className="w-3.5 h-3.5" />,
  "Projector": <Presentation className="w-3.5 h-3.5" />,
};

function RoomAvailabilityCard({ room, bookings }: { room: RoomWithFacility; bookings: BookingWithDetails[] }) {
  const now = new Date();
  const currentBooking = bookings.find(
    (b) => b.roomId === room.id && b.status === "confirmed" && new Date(b.startTime) <= now && new Date(b.endTime) > now
  );
  const nextBooking = bookings.find(
    (b) => b.roomId === room.id && b.status === "confirmed" && new Date(b.startTime) > now
  );
  const isAvailable = !currentBooking;

  return (
    <Card className="hover-elevate" data-testid={`room-card-${room.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm truncate">{room.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {room.facility.name} {room.floor ? `- ${room.floor}` : ""}
            </p>
          </div>
          <StatusBadge status={isAvailable ? "available" : "occupied"} />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {room.capacity}
          </span>
          {room.equipment && room.equipment.length > 0 && (
            <div className="flex items-center gap-1.5">
              {room.equipment.slice(0, 3).map((eq) => (
                <span key={eq} title={eq}>
                  {equipmentIcons[eq] || <Monitor className="w-3.5 h-3.5" />}
                </span>
              ))}
              {room.equipment.length > 3 && (
                <span className="text-muted-foreground">+{room.equipment.length - 3}</span>
              )}
            </div>
          )}
        </div>
        {currentBooking ? (
          <div className="rounded-md bg-destructive/10 p-2.5 text-xs">
            <p className="font-medium text-destructive">{currentBooking.title}</p>
            <p className="text-muted-foreground mt-0.5">
              Until {formatTime(currentBooking.endTime)}
            </p>
          </div>
        ) : nextBooking ? (
          <div className="rounded-md bg-muted p-2.5 text-xs">
            <p className="font-medium">Next: {nextBooking.title}</p>
            <p className="text-muted-foreground mt-0.5">
              {formatTime(nextBooking.startTime)} - {formatTime(nextBooking.endTime)}
            </p>
          </div>
        ) : (
          <div className="rounded-md bg-muted p-2.5 text-xs">
            <p className="text-muted-foreground">No upcoming bookings</p>
          </div>
        )}
        {isAvailable && (
          <Link href={`/book?room=${room.id}`}>
            <Button variant="outline" size="sm" className="w-full mt-3" data-testid={`button-book-${room.id}`}>
              <CalendarPlus className="w-3.5 h-3.5 mr-1.5" />
              Book Now
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function AllMeetingsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AllMeetings() {
  const { data: facilities, isLoading: facLoading } = useQuery<Facility[]>({
    queryKey: ["/api/facilities"],
  });
  const { data: rooms, isLoading: roomsLoading } = useQuery<RoomWithFacility[]>({
    queryKey: ["/api/rooms"],
  });
  const { data: bookings, isLoading: bookingsLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ["/api/bookings/today"],
  });

  const isLoading = facLoading || roomsLoading || bookingsLoading;

  if (isLoading) return <AllMeetingsSkeleton />;

  return (
    <div>
      <PageHeader
        title="All Meetings"
        description="Real-time conference room availability across all facilities"
        actions={
          <Link href="/book">
            <Button data-testid="button-new-booking-meetings">
              <CalendarPlus className="w-4 h-4 mr-2" />
              Book a Room
            </Button>
          </Link>
        }
      />

      <Tabs defaultValue="all" className="w-full">
        <TabsList data-testid="tabs-facility-filter">
          <TabsTrigger value="all" data-testid="tab-all">All Facilities</TabsTrigger>
          {facilities?.map((f) => (
            <TabsTrigger key={f.id} value={f.id} data-testid={`tab-${f.name.toLowerCase().replace(/\s+/g, "-")}`}>
              {f.name}
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                {getTimezoneAbbr(f.timezone)}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <ScrollArea className="w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {rooms?.map((room) => (
                <RoomAvailabilityCard key={room.id} room={room} bookings={bookings || []} />
              ))}
            </div>
          </ScrollArea>
          {(!rooms || rooms.length === 0) && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <DoorOpen className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-sm">No rooms configured yet</p>
                <Link href="/admin/rooms">
                  <Button variant="outline" size="sm" className="mt-3" data-testid="button-setup-rooms">
                    Set Up Rooms
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {facilities?.map((facility) => (
          <TabsContent key={facility.id} value={facility.id} className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {rooms
                ?.filter((r) => r.facilityId === facility.id)
                .map((room) => (
                  <RoomAvailabilityCard key={room.id} room={room} bookings={bookings || []} />
                ))}
            </div>
            {rooms?.filter((r) => r.facilityId === facility.id).length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <DoorOpen className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground text-sm">No rooms in {facility.name}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
