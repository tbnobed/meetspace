import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/page-header";
import { Link } from "wouter";
import {
  Building2,
  DoorOpen,
  CalendarPlus,
  Clock,
  ChevronLeft,
  ChevronRight,
  Users,
  MapPin,
  Monitor,
  Video,
} from "lucide-react";
import { formatTime, getBrowserTimezoneAbbr } from "@/lib/constants";
import type { Facility, RoomWithFacility, BookingWithDetails } from "@shared/schema";

type ViewMode = "month" | "week" | "day";

const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 20;

function computeHours(bookings: BookingWithDetails[]): number[] {
  let minHour = DEFAULT_START_HOUR;
  let maxHour = DEFAULT_END_HOUR;
  for (const b of bookings) {
    const startH = getLocalHour(b.startTime);
    const endH = getLocalHour(b.endTime);
    if (startH < minHour) minHour = startH;
    if (endH > maxHour) maxHour = endH;
  }
  return Array.from({ length: maxHour - minHour + 1 }, (_, i) => i + minHour);
}

function getLocalHour(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getHours();
}

function getLocalMinute(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getMinutes();
}

function getMeetingTypeIcon(meetingType: string | null) {
  if (meetingType === "teams") return <Monitor className="w-3 h-3 flex-shrink-0" />;
  if (meetingType === "zoom") return <Video className="w-3 h-3 flex-shrink-0" />;
  return null;
}

function computeOverlapLayout(bookings: BookingWithDetails[]): Map<string, { col: number; totalCols: number }> {
  const result = new Map<string, { col: number; totalCols: number }>();
  if (bookings.length === 0) return result;

  const sorted = [...bookings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const groups: BookingWithDetails[][] = [];
  for (const b of sorted) {
    const bStart = new Date(b.startTime).getTime();
    const bEnd = new Date(b.endTime).getTime();
    let placed = false;
    for (const group of groups) {
      const overlaps = group.some((g) => {
        const gStart = new Date(g.startTime).getTime();
        const gEnd = new Date(g.endTime).getTime();
        return bStart < gEnd && bEnd > gStart;
      });
      if (overlaps) {
        group.push(b);
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push([b]);
    }
  }

  for (const group of groups) {
    const columns: BookingWithDetails[][] = [];
    const groupSorted = [...group].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    for (const b of groupSorted) {
      const bStart = new Date(b.startTime).getTime();
      let placedInCol = false;
      for (let ci = 0; ci < columns.length; ci++) {
        const lastInCol = columns[ci][columns[ci].length - 1];
        if (new Date(lastInCol.endTime).getTime() <= bStart) {
          columns[ci].push(b);
          result.set(b.id, { col: ci, totalCols: 0 });
          placedInCol = true;
          break;
        }
      }
      if (!placedInCol) {
        result.set(b.id, { col: columns.length, totalCols: 0 });
        columns.push([b]);
      }
    }
    const totalCols = columns.length;
    for (const b of group) {
      const entry = result.get(b.id);
      if (entry) entry.totalCols = totalCols;
    }
  }

  return result;
}

const BOOKING_COLORS = [
  "bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300",
  "bg-violet-500/15 border-violet-500/30 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 border-cyan-500/30 text-cyan-700 dark:text-cyan-300",
  "bg-orange-500/15 border-orange-500/30 text-orange-700 dark:text-orange-300",
  "bg-pink-500/15 border-pink-500/30 text-pink-700 dark:text-pink-300",
];

function getBookingColor(roomId: string): string {
  let hash = 0;
  for (let i = 0; i < roomId.length; i++) {
    hash = ((hash << 5) - hash) + roomId.charCodeAt(i);
    hash |= 0;
  }
  return BOOKING_COLORS[Math.abs(hash) % BOOKING_COLORS.length];
}

function getWeekDates(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    return dt;
  });
}

function getMonthDates(date: Date): Date[][] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];

  for (let i = 0; i < startDay; i++) {
    const d = new Date(year, month, -(startDay - 1 - i));
    currentWeek.push(d);
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    currentWeek.push(new Date(year, month, day));
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    const remaining = 7 - currentWeek.length;
    for (let i = 1; i <= remaining; i++) {
      currentWeek.push(new Date(year, month + 1, i));
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatWeekRange(dates: Date[]): string {
  const start = dates[0];
  const end = dates[6];
  if (start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString("en-US", { month: "long" })} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${start.toLocaleDateString("en-US", { month: "short" })} ${start.getDate()} - ${end.toLocaleDateString("en-US", { month: "short" })} ${end.getDate()}, ${end.getFullYear()}`;
}

function formatDayHeader(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function getBookingsForDay(bookings: BookingWithDetails[], day: Date): BookingWithDetails[] {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  return bookings.filter((b) => {
    const start = new Date(b.startTime);
    const end = new Date(b.endTime);
    return start < dayEnd && end > dayStart;
  });
}

function StatCard({ title, value, icon, subtitle }: { title: string; value: string | number; icon: React.ReactNode; subtitle?: string }) {
  return (
    <Card data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function BookingTooltipContent({ booking }: { booking: BookingWithDetails }) {
  return (
    <div className="space-y-1.5 max-w-64">
      <p className="font-medium text-sm">{booking.title}</p>
      <div className="flex items-center gap-1.5 text-xs">
        <Clock className="w-3 h-3 flex-shrink-0" />
        <span>
          {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
          {" "}({getBrowserTimezoneAbbr()})
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <MapPin className="w-3 h-3 flex-shrink-0" />
        <span>{booking.room.name} - {booking.facility.name}</span>
      </div>
      {booking.meetingType && booking.meetingType !== "none" && (
        <div className="flex items-center gap-1.5 text-xs">
          {getMeetingTypeIcon(booking.meetingType)}
          <span className="capitalize">{booking.meetingType}</span>
        </div>
      )}
    </div>
  );
}

function MonthView({
  currentDate,
  bookings,
  facilityFilter,
  onDayClick,
}: {
  currentDate: Date;
  bookings: BookingWithDetails[];
  facilityFilter: string;
  onDayClick: (date: Date) => void;
}) {
  const weeks = getMonthDates(currentDate);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const filtered = facilityFilter === "all"
    ? bookings
    : bookings.filter((b) => b.facility.id === facilityFilter);

  return (
    <div className="border rounded-md overflow-hidden" data-testid="calendar-month-view">
      <div className="grid grid-cols-7 border-b">
        {dayNames.map((d) => (
          <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground bg-muted/30">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((day, di) => {
            const dayBookings = getBookingsForDay(filtered, day);
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const today = isToday(day);
            return (
              <div
                key={di}
                className={`min-h-[140px] border-r last:border-r-0 p-1.5 cursor-pointer hover-elevate ${
                  !isCurrentMonth ? "bg-muted/20" : ""
                }`}
                onClick={() => onDayClick(day)}
                data-testid={`month-day-${day.getDate()}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                      today
                        ? "bg-primary text-primary-foreground"
                        : !isCurrentMonth
                          ? "text-muted-foreground"
                          : ""
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayBookings.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {dayBookings.length}
                    </Badge>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayBookings.slice(0, 3).map((b) => (
                    <Tooltip key={b.id}>
                      <TooltipTrigger asChild>
                        <div
                          className={`text-[11px] leading-tight px-1.5 py-0.5 rounded border truncate ${getBookingColor(b.roomId)}`}
                          data-testid={`month-booking-${b.id}`}
                        >
                          {formatTime(b.startTime).replace(/:00/g, "")} {b.title}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="start">
                        <BookingTooltipContent booking={b} />
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {dayBookings.length > 3 && (
                    <div className="text-[10px] text-muted-foreground pl-1.5">
                      +{dayBookings.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function WeekView({
  currentDate,
  bookings,
  facilityFilter,
  onDayClick,
}: {
  currentDate: Date;
  bookings: BookingWithDetails[];
  facilityFilter: string;
  onDayClick: (date: Date) => void;
}) {
  const weekDates = getWeekDates(currentDate);

  const filtered = facilityFilter === "all"
    ? bookings
    : bookings.filter((b) => b.facility.id === facilityFilter);

  const allWeekBookings = weekDates.flatMap((day) => getBookingsForDay(filtered, day));
  const hours = computeHours(allWeekBookings);

  return (
    <div className="border rounded-md overflow-hidden" data-testid="calendar-week-view">
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
        <div className="p-2 bg-muted/30" />
        {weekDates.map((day, i) => {
          const today = isToday(day);
          return (
            <div
              key={i}
              className={`p-2 text-center border-l cursor-pointer hover-elevate ${today ? "bg-primary/5" : "bg-muted/30"}`}
              onClick={() => onDayClick(day)}
            >
              <div className="text-xs text-muted-foreground">
                {day.toLocaleDateString("en-US", { weekday: "short" })}
              </div>
              <div className={`text-sm font-medium mt-0.5 w-7 h-7 flex items-center justify-center mx-auto rounded-full ${
                today ? "bg-primary text-primary-foreground" : ""
              }`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div className="overflow-y-auto max-h-[600px]">
        {hours.map((hour) => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b last:border-b-0">
            <div className="p-1.5 text-xs text-muted-foreground text-right pr-2 pt-0 -mt-2">
              {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
            </div>
            {weekDates.map((day, di) => {
              const dayBookings = getBookingsForDay(filtered, day);
              const layoutMap = computeOverlapLayout(dayBookings);

              const startingThisHour = dayBookings.filter((b) => {
                return getLocalHour(b.startTime) === hour;
              });

              return (
                <div key={di} className="border-l min-h-[48px] p-0.5 relative">
                  {startingThisHour.map((b) => {
                    const startH = getLocalHour(b.startTime);
                    const startM = getLocalMinute(b.startTime);
                    const endH = getLocalHour(b.endTime);
                    const endM = getLocalMinute(b.endTime);
                    const durationMins = (endH * 60 + endM) - (startH * 60 + startM);
                    const heightPx = Math.max(20, (durationMins / 60) * 48 - 2);
                    const topPx = (startM / 60) * 48;
                    const layout = layoutMap.get(b.id) || { col: 0, totalCols: 1 };
                    const widthPct = 100 / layout.totalCols;
                    const leftPct = layout.col * widthPct;

                    return (
                      <Tooltip key={b.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute rounded border px-1 py-0.5 text-[11px] leading-tight overflow-hidden cursor-default z-10 ${getBookingColor(b.roomId)}`}
                            style={{
                              top: `${topPx}px`,
                              height: `${heightPx}px`,
                              left: `calc(${leftPct}% + 2px)`,
                              width: `calc(${widthPct}% - 4px)`,
                            }}
                            data-testid={`week-booking-${b.id}`}
                          >
                            <div className="font-medium truncate">{b.title}</div>
                            {heightPx > 28 && (
                              <div className="truncate opacity-75">{b.room.name}</div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="start">
                          <BookingTooltipContent booking={b} />
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView({
  currentDate,
  bookings,
  facilityFilter,
}: {
  currentDate: Date;
  bookings: BookingWithDetails[];
  facilityFilter: string;
}) {
  const filtered = facilityFilter === "all"
    ? bookings
    : bookings.filter((b) => b.facility.id === facilityFilter);

  const dayBookings = getBookingsForDay(filtered, currentDate);
  const hours = computeHours(dayBookings);

  return (
    <div className="border rounded-md overflow-hidden" data-testid="calendar-day-view">
      <div className="p-3 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium ${
            isToday(currentDate) ? "bg-primary text-primary-foreground" : ""
          }`}>
            {currentDate.getDate()}
          </span>
          <span className="text-sm font-medium">
            {currentDate.toLocaleDateString("en-US", { weekday: "long" })}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {dayBookings.length} booking{dayBookings.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>
      <div className="overflow-y-auto max-h-[600px]">
        {hours.map((hour) => {
          const hourBookings = dayBookings.filter((b) => {
            return getLocalHour(b.startTime) === hour;
          });

          return (
            <div key={hour} className="flex border-b last:border-b-0">
              <div className="w-16 flex-shrink-0 p-2 text-xs text-muted-foreground text-right pr-3 pt-1">
                {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
              </div>
              <div className="flex-1 min-h-[56px] border-l p-1 space-y-1">
                {hourBookings.map((b) => (
                  <div
                    key={b.id}
                    className={`rounded border px-3 py-2 ${getBookingColor(b.roomId)}`}
                    data-testid={`day-booking-${b.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm">{b.title}</div>
                        <div className="flex items-center gap-3 mt-1 text-xs opacity-80 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            {formatTime(b.startTime)} - {formatTime(b.endTime)}
                            {" "}({getBrowserTimezoneAbbr()})
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {b.room.name} - {b.facility.name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3 flex-shrink-0" />
                            {b.user.displayName}
                          </span>
                          {b.meetingType && b.meetingType !== "none" && (
                            <span className="flex items-center gap-1">
                              {getMeetingTypeIcon(b.meetingType)}
                              <span className="capitalize">{b.meetingType}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
            <CardContent><Skeleton className="h-8 w-16" /></CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-[500px] w-full" />
    </div>
  );
}

export default function Dashboard() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [facilityFilter, setFacilityFilter] = useState("all");

  const { data: facilities, isLoading: facLoading } = useQuery<Facility[]>({
    queryKey: ["/api/facilities"],
  });
  const { data: rooms, isLoading: roomsLoading } = useQuery<RoomWithFacility[]>({
    queryKey: ["/api/rooms"],
  });
  const { data: todayBookings, isLoading: todayLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ["/api/bookings/today"],
  });

  const rangeStart = useMemo(() => {
    const d = new Date(currentDate);
    if (viewMode === "month") {
      d.setDate(1);
      d.setDate(d.getDate() - d.getDay());
    } else if (viewMode === "week") {
      d.setDate(d.getDate() - d.getDay());
    }
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentDate, viewMode]);

  const rangeEnd = useMemo(() => {
    const d = new Date(currentDate);
    if (viewMode === "month") {
      d.setMonth(d.getMonth() + 1, 0);
      d.setDate(d.getDate() + (6 - d.getDay()));
    } else if (viewMode === "week") {
      d.setDate(d.getDate() - d.getDay() + 6);
    }
    d.setHours(23, 59, 59, 999);
    return d;
  }, [currentDate, viewMode]);

  const { data: bookings, isLoading: bookingsLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ["/api/bookings/range", rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/range?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`);
      if (!res.ok) throw new Error("Failed to fetch bookings");
      return res.json();
    },
  });

  const isLoading = facLoading || roomsLoading || todayLoading;

  if (isLoading) return <DashboardSkeleton />;

  const totalRooms = rooms?.length || 0;
  const now = new Date();
  const availableRooms = rooms?.filter((room) => {
    const hasCurrentBooking = todayBookings?.some(
      (b) => b.roomId === room.id && b.status === "confirmed" && new Date(b.startTime) <= now && new Date(b.endTime) > now
    );
    return !hasCurrentBooking;
  }).length || 0;

  const confirmedToday = todayBookings?.filter((b) => b.status === "confirmed").length || 0;

  function navigatePrev() {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else if (viewMode === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  }

  function navigateNext() {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    else if (viewMode === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  function handleDayClick(date: Date) {
    setCurrentDate(date);
    setViewMode("day");
  }

  const headerText = viewMode === "month"
    ? formatMonthYear(currentDate)
    : viewMode === "week"
      ? formatWeekRange(getWeekDates(currentDate))
      : formatDayHeader(currentDate);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Conference room calendar and availability overview"
        actions={
          <Link href="/book">
            <Button data-testid="button-new-booking">
              <CalendarPlus className="w-4 h-4 mr-2" />
              Book a Room
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Facilities"
          value={facilities?.length || 0}
          icon={<Building2 className="w-4 h-4" />}
          subtitle="Active locations"
        />
        <StatCard
          title="Total Rooms"
          value={totalRooms}
          icon={<DoorOpen className="w-4 h-4" />}
          subtitle="Across all facilities"
        />
        <StatCard
          title="Available Now"
          value={availableRooms}
          icon={<Clock className="w-4 h-4" />}
          subtitle={`${totalRooms - availableRooms} currently in use`}
        />
        <StatCard
          title="Today's Bookings"
          value={confirmedToday}
          icon={<CalendarPlus className="w-4 h-4" />}
          subtitle="Confirmed meetings"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrev} data-testid="button-calendar-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={goToToday} data-testid="button-calendar-today">
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={navigateNext} data-testid="button-calendar-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold ml-2" data-testid="text-calendar-header">{headerText}</h2>
        </div>

        <div className="flex items-center gap-2">
          <Select value={facilityFilter} onValueChange={setFacilityFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-calendar-facility">
              <SelectValue placeholder="All Facilities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Facilities</SelectItem>
              {facilities?.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center rounded-md border">
            <Button
              variant={viewMode === "month" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("month")}
              className="rounded-r-none"
              data-testid="button-view-month"
            >
              Month
            </Button>
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("week")}
              className="rounded-none border-x"
              data-testid="button-view-week"
            >
              Week
            </Button>
            <Button
              variant={viewMode === "day" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("day")}
              className="rounded-l-none"
              data-testid="button-view-day"
            >
              Day
            </Button>
          </div>
        </div>
      </div>

      {bookingsLoading ? (
        <Skeleton className="h-[500px] w-full" />
      ) : viewMode === "month" ? (
        <MonthView
          currentDate={currentDate}
          bookings={bookings || []}
          facilityFilter={facilityFilter}
          onDayClick={handleDayClick}
        />
      ) : viewMode === "week" ? (
        <WeekView
          currentDate={currentDate}
          bookings={bookings || []}
          facilityFilter={facilityFilter}
          onDayClick={handleDayClick}
        />
      ) : (
        <DayView
          currentDate={currentDate}
          bookings={bookings || []}
          facilityFilter={facilityFilter}
        />
      )}
    </div>
  );
}
