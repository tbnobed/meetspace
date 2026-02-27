import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import {
  DoorOpen,
  CalendarPlus,
  CalendarIcon,
  Users,
  Monitor,
  Phone,
  Presentation,
  Wifi,
  Clock,
  Link2,
} from "lucide-react";
import { formatTime, getTimezoneAbbr } from "@/lib/constants";
import { format } from "date-fns";
import type { Facility, RoomWithFacility, BookingWithDetails } from "@shared/schema";

const equipmentIcons: Record<string, React.ReactNode> = {
  "TV/Display": <Monitor className="w-3.5 h-3.5" />,
  "Video Conference": <Wifi className="w-3.5 h-3.5" />,
  "Phone": <Phone className="w-3.5 h-3.5" />,
  "Projector": <Presentation className="w-3.5 h-3.5" />,
};

const timeSlots = Array.from({ length: 28 }, (_, i) => {
  const hour = Math.floor(i / 2) + 7;
  const min = i % 2 === 0 ? "00" : "30";
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return {
    value: `${hour.toString().padStart(2, "0")}:${min}`,
    label: `${displayHour}:${min} ${ampm}`,
  };
});

const quickBookSchema = z.object({
  title: z.string().min(1, "Meeting title is required").max(100),
  date: z.date({ required_error: "Please select a date" }),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  meetingType: z.string().default("none"),
  meetingLink: z.string().optional(),
  attendees: z.string().optional(),
});

type QuickBookValues = z.infer<typeof quickBookSchema>;

function QuickBookDialog({
  room,
  open,
  onOpenChange,
}: {
  room: RoomWithFacility;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();

  const form = useForm<QuickBookValues>({
    resolver: zodResolver(quickBookSchema),
    defaultValues: {
      title: "",
      date: new Date(),
      startTime: "",
      endTime: "",
      meetingType: "none",
      meetingLink: "",
      attendees: "",
    },
  });

  const createBooking = useMutation({
    mutationFn: async (values: QuickBookValues) => {
      const dateStr = format(values.date, "yyyy-MM-dd");
      const startTime = new Date(`${dateStr}T${values.startTime}:00`);
      const endTime = new Date(`${dateStr}T${values.endTime}:00`);

      if (endTime <= startTime) {
        throw new Error("End time must be after start time");
      }

      const attendeesArr = values.attendees
        ? values.attendees.split(",").map((a) => a.trim()).filter(Boolean)
        : [];

      const body: Record<string, any> = {
        roomId: room.id,
        title: values.title,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        meetingType: values.meetingType,
        meetingLink: values.meetingType !== "none" && values.meetingLink ? values.meetingLink : undefined,
        attendees: attendeesArr.length > 0 ? attendeesArr : undefined,
        isRecurring: false,
      };

      const res = await apiRequest("POST", "/api/bookings", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/range"] });
      toast({ title: "Room booked successfully", description: `${room.name} has been reserved.` });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Booking failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book {room.name}</DialogTitle>
          <DialogDescription>
            {room.facility.name} — Capacity: {room.capacity}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => createBooking.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meeting Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Weekly Team Standup" {...field} data-testid="input-quick-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" className="justify-start text-left font-normal" data-testid="button-quick-date">
                          <CalendarIcon className="mr-2 w-4 h-4" />
                          {field.value ? format(field.value, "PPP") : "Pick a date"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-quick-start">
                          <Clock className="w-4 h-4 mr-2" />
                          <SelectValue placeholder="Start" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeSlots.map((slot) => (
                          <SelectItem key={slot.value} value={slot.value}>{slot.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-quick-end">
                          <Clock className="w-4 h-4 mr-2" />
                          <SelectValue placeholder="End" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeSlots.map((slot) => (
                          <SelectItem key={slot.value} value={slot.value}>{slot.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="meetingType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meeting Platform</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-quick-meeting-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No virtual meeting</SelectItem>
                      <SelectItem value="teams">Microsoft Teams</SelectItem>
                      <SelectItem value="zoom">Zoom</SelectItem>
                      <SelectItem value="other">Other (Google Meet, Webex, etc.)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.watch("meetingType") === "teams" && (
              <FormField
                control={form.control}
                name="meetingLink"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Existing Teams Link <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <Input
                          placeholder="https://teams.microsoft.com/l/meetup-join/..."
                          {...field}
                          data-testid="input-quick-meeting-link"
                        />
                      </div>
                    </FormControl>
                    <p className="text-xs text-muted-foreground mt-1">
                      Already have a Teams link? Paste it here. Leave blank to auto-generate one.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {(form.watch("meetingType") === "zoom" || form.watch("meetingType") === "other") && (
              <FormField
                control={form.control}
                name="meetingLink"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meeting Link</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <Input
                          placeholder={form.watch("meetingType") === "zoom" ? "https://zoom.us/j/..." : "https://meet.google.com/... or other link"}
                          {...field}
                          data-testid="input-quick-meeting-link"
                        />
                      </div>
                    </FormControl>
                    <p className="text-xs text-muted-foreground mt-1">
                      Paste your meeting link — it will be included in the calendar invite
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="attendees"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Attendees (comma-separated emails)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="john@company.com, jane@company.com"
                      {...field}
                      data-testid="input-quick-attendees"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={createBooking.isPending} data-testid="button-quick-submit">
              <CalendarPlus className="w-4 h-4 mr-2" />
              {createBooking.isPending ? "Booking..." : "Book Room"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RoomAvailabilityCard({ room, bookings, canBook }: { room: RoomWithFacility; bookings: BookingWithDetails[]; canBook: boolean }) {
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const { user } = useAuth();
  const now = new Date();
  const currentBooking = bookings.find(
    (b) => b.roomId === room.id && b.status === "confirmed" && new Date(b.startTime) <= now && new Date(b.endTime) > now
  );
  const nextBooking = bookings.find(
    (b) => b.roomId === room.id && b.status === "confirmed" && new Date(b.startTime) > now
  );
  const isAvailable = !currentBooking;

  return (
    <>
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
          {isAvailable && user && canBook && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3"
              data-testid={`button-book-${room.id}`}
              onClick={() => setBookDialogOpen(true)}
            >
              <CalendarPlus className="w-3.5 h-3.5 mr-1.5" />
              Book Now
            </Button>
          )}
          {isAvailable && !user && (
            <Link href={`/book?room=${room.id}`}>
              <Button variant="outline" size="sm" className="w-full mt-3" data-testid={`button-book-${room.id}`}>
                <CalendarPlus className="w-3.5 h-3.5 mr-1.5" />
                Book Now
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
      {user && <QuickBookDialog room={room} open={bookDialogOpen} onOpenChange={setBookDialogOpen} />}
    </>
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
  const { data: accessibleRooms } = useQuery<RoomWithFacility[]>({
    queryKey: ["/api/rooms/accessible"],
  });
  const { data: bookings, isLoading: bookingsLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ["/api/bookings/today"],
  });

  const isLoading = facLoading || roomsLoading || bookingsLoading;

  if (isLoading) return <AllMeetingsSkeleton />;

  return (
    <div>
      <PageHeader
        title="All Rooms"
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
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0" data-testid="tabs-facility-filter">
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            {facilities?.map((f) => (
              <TabsTrigger key={f.id} value={f.id} className="whitespace-nowrap" data-testid={`tab-${f.name.toLowerCase().replace(/\s+/g, "-")}`}>
                <span className="hidden sm:inline">{f.name}</span>
                <span className="sm:hidden">{f.name.split(' ')[0]}</span>
                <Badge variant="secondary" className="ml-1 sm:ml-1.5 text-[10px]">
                  {getTimezoneAbbr(f.timezone)}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="all" className="mt-4">
          <ScrollArea className="w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {rooms?.map((room) => (
                <RoomAvailabilityCard key={room.id} room={room} bookings={bookings || []} canBook={accessibleRooms ? accessibleRooms.some((ar) => ar.id === room.id) : false} />
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
                  <RoomAvailabilityCard key={room.id} room={room} bookings={bookings || []} canBook={accessibleRooms ? accessibleRooms.some((ar) => ar.id === room.id) : false} />
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
