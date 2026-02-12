import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { getTimezoneAbbr } from "@/lib/constants";
import { format } from "date-fns";
import {
  CalendarIcon,
  Clock,
  Users,
  DoorOpen,
  Building2,
  Monitor,
  Video,
  LogIn,
} from "lucide-react";
import type { Facility, RoomWithFacility } from "@shared/schema";

const bookingFormSchema = z.object({
  roomId: z.string().min(1, "Please select a room"),
  title: z.string().min(1, "Meeting title is required").max(100),
  description: z.string().optional(),
  date: z.date({ required_error: "Please select a date" }),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  meetingType: z.string().default("none"),
  attendees: z.string().optional(),
  guestName: z.string().optional(),
  guestEmail: z.string().optional(),
  bookedForName: z.string().optional(),
  bookedForEmail: z.string().optional(),
});

type BookingFormValues = z.infer<typeof bookingFormSchema>;

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

function RoomSelector({ rooms, value, onChange, facilityId }: {
  rooms: RoomWithFacility[];
  value: string;
  onChange: (val: string) => void;
  facilityId?: string;
}) {
  const filtered = facilityId ? rooms.filter((r) => r.facilityId === facilityId) : rooms;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {filtered.map((room) => (
        <Card
          key={room.id}
          className={`cursor-pointer hover-elevate ${value === room.id ? "ring-2 ring-primary" : ""}`}
          onClick={() => onChange(room.id)}
          data-testid={`select-room-${room.id}`}
        >
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{room.name}</p>
                <p className="text-xs text-muted-foreground">{room.facility.name}</p>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                <Users className="w-3 h-3 mr-1" />
                {room.capacity}
              </Badge>
            </div>
            {room.equipment && room.equipment.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {room.equipment.map((eq) => (
                  <Badge key={eq} variant="outline" className="text-[10px]">{eq}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {filtered.length === 0 && (
        <div className="col-span-2 text-center py-8 text-muted-foreground text-sm">
          No rooms available for this facility
        </div>
      )}
    </div>
  );
}

export default function BookRoom() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const preselectedRoom = params.get("room") || "";
  const [selectedFacility, setSelectedFacility] = useState<string>("");
  const [bookingComplete, setBookingComplete] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const isGuest = !user;
  const isSiteAdmin = user?.role === "site_admin";

  const { data: facilities } = useQuery<Facility[]>({ queryKey: ["/api/facilities"] });
  const { data: rooms, isLoading } = useQuery<RoomWithFacility[]>({ queryKey: ["/api/rooms"] });

  useEffect(() => {
    if (preselectedRoom && rooms) {
      const room = rooms.find((r) => r.id === preselectedRoom);
      if (room) {
        setSelectedFacility(room.facilityId);
      }
    }
  }, [preselectedRoom, rooms]);

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      roomId: preselectedRoom,
      title: "",
      description: "",
      date: new Date(),
      startTime: "",
      endTime: "",
      meetingType: "none",
      attendees: "",
      guestName: "",
      guestEmail: "",
      bookedForName: "",
      bookedForEmail: "",
    },
  });

  const createBooking = useMutation({
    mutationFn: async (values: BookingFormValues) => {
      if (isGuest && (!values.guestName || !values.guestEmail)) {
        throw new Error("Name and email are required for guest bookings");
      }

      const dateStr = format(values.date, "yyyy-MM-dd");
      const startTime = new Date(`${dateStr}T${values.startTime}:00`);
      const endTime = new Date(`${dateStr}T${values.endTime}:00`);
      const attendeesArr = values.attendees
        ? values.attendees.split(",").map((a) => a.trim()).filter(Boolean)
        : [];

      const body: Record<string, any> = {
        roomId: values.roomId,
        title: values.title,
        description: values.description || undefined,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        meetingType: values.meetingType,
        attendees: attendeesArr.length > 0 ? attendeesArr : undefined,
        isRecurring: false,
      };

      if (isGuest) {
        body.guestName = values.guestName;
        body.guestEmail = values.guestEmail;
      }

      if (isSiteAdmin && values.bookedForName && values.bookedForEmail) {
        body.bookedForName = values.bookedForName;
        body.bookedForEmail = values.bookedForEmail;
      }

      const res = await apiRequest("POST", "/api/bookings", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/today"] });
      toast({ title: "Room booked successfully", description: "Your meeting has been scheduled." });
      if (isGuest) {
        setBookingComplete(true);
      } else {
        navigate("/bookings");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Booking failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (bookingComplete) {
    return (
      <div className={isGuest ? "min-h-screen bg-background p-6 max-w-3xl mx-auto" : ""}>
        <Card className="max-w-md mx-auto mt-12">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CalendarIcon className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Booking Confirmed</h2>
            <p className="text-muted-foreground text-sm">Your room has been successfully booked.</p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => { setBookingComplete(false); form.reset(); }} data-testid="button-book-another">
                Book Another Room
              </Button>
              <Button variant="outline" onClick={() => navigate("/auth")} data-testid="button-sign-in">
                <LogIn className="w-4 h-4 mr-2" />
                Sign in to manage bookings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const content = (
    <div>
      <PageHeader
        title="Book a Room"
        description={isGuest ? "Book a conference room — no account required" : "Select a room and schedule your meeting"}
      />
      {isGuest && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span>Already have an account?</span>
          <Button variant="outline" size="sm" onClick={() => navigate("/auth")} data-testid="button-goto-login">
            <LogIn className="w-4 h-4 mr-2" />
            Sign In
          </Button>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => createBooking.mutate(v))} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              {isGuest && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Your Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="guestName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Your full name" {...field} data-testid="input-guest-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="guestEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="you@company.com" {...field} data-testid="input-guest-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              )}

              {isSiteAdmin && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Booking On Behalf Of
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs text-muted-foreground">Leave blank to book for yourself</p>
                    <FormField
                      control={form.control}
                      name="bookedForName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Jane Smith (CEO)" {...field} data-testid="input-booked-for-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bookedForEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="jane@company.com" {...field} data-testid="input-booked-for-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    Date & Time
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className="justify-start text-left font-normal" data-testid="button-date-picker">
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
                          <FormLabel>Start Time</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-start-time">
                                <Clock className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Select start time" />
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
                          <FormLabel>End Time</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-end-time">
                                <Clock className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Select end time" />
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Monitor className="w-4 h-4" />
                    Meeting Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meeting Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Weekly Team Standup" {...field} data-testid="input-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Add any notes about the meeting..."
                            className="resize-none"
                            {...field}
                            data-testid="input-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                            data-testid="input-attendees"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    Virtual Meeting
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="meetingType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meeting Platform</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-meeting-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No virtual meeting</SelectItem>
                            <SelectItem value="teams">Microsoft Teams</SelectItem>
                            <SelectItem value="zoom">Zoom</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <DoorOpen className="w-4 h-4" />
                    Select Room
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <Select value={selectedFacility} onValueChange={(val) => { setSelectedFacility(val); form.setValue("roomId", ""); }}>
                      <SelectTrigger data-testid="select-facility-filter">
                        <Building2 className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Select a facility first" />
                      </SelectTrigger>
                      <SelectContent>
                        {(isSiteAdmin && user?.assignedFacilityIds?.length
                          ? facilities?.filter((f) => user.assignedFacilityIds!.includes(f.id))
                          : facilities
                        )?.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name} ({getTimezoneAbbr(f.timezone)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedFacility ? (
                    <FormField
                      control={form.control}
                      name="roomId"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <RoomSelector
                              rooms={isSiteAdmin && user?.assignedFacilityIds?.length
                                ? (rooms || []).filter((r) => user.assignedFacilityIds!.includes(r.facilityId))
                                : (rooms || [])
                              }
                              value={field.value}
                              onChange={field.onChange}
                              facilityId={selectedFacility}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Please select a facility to see available rooms
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button
                type="submit"
                className="w-full"
                disabled={createBooking.isPending}
                data-testid="button-submit-booking"
              >
                {createBooking.isPending ? "Booking..." : "Book Room"}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );

  if (isGuest) {
    return (
      <div className="min-h-screen bg-background p-6 max-w-7xl mx-auto">
        {content}
      </div>
    );
  }

  return content;
}
