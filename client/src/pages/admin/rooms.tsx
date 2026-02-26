import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EQUIPMENT_OPTIONS, getTimezoneAbbr } from "@/lib/constants";
import { Plus, DoorOpen, Users, Building2, Pencil, RefreshCw, Cloud, Mail, CheckCircle2, Loader2, Download, Calendar, Wifi, WifiOff } from "lucide-react";
import type { Facility, RoomWithFacility } from "@shared/schema";

interface GraphSubscriptionInfo {
  id: string;
  roomId: string;
  roomEmail: string;
  status: string;
  lastNotificationAt: string | null;
  expirationDateTime: string;
  roomName: string;
  facilityName: string;
  isExpired: boolean;
  lastError: string | null;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const roomFormSchema = z.object({
  name: z.string().min(1, "Room name is required"),
  facilityId: z.string().min(1, "Facility is required"),
  capacity: z.coerce.number().min(1, "Capacity must be at least 1").max(500),
  floor: z.string().optional(),
  equipment: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

type RoomFormValues = z.infer<typeof roomFormSchema>;

function RoomFormDialog({ room, facilities, open, onOpenChange }: {
  room?: RoomWithFacility;
  facilities: Facility[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!room;

  const form = useForm<RoomFormValues>({
    resolver: zodResolver(roomFormSchema),
    defaultValues: {
      name: room?.name || "",
      facilityId: room?.facilityId || "",
      capacity: room?.capacity || 10,
      floor: room?.floor || "",
      equipment: room?.equipment || [],
      isActive: room?.isActive ?? true,
    },
  });

  useEffect(() => {
    form.reset({
      name: room?.name || "",
      facilityId: room?.facilityId || "",
      capacity: room?.capacity || 10,
      floor: room?.floor || "",
      equipment: room?.equipment || [],
      isActive: room?.isActive ?? true,
    });
  }, [room, form]);

  const mutation = useMutation({
    mutationFn: async (values: RoomFormValues) => {
      if (isEdit) {
        return apiRequest("PATCH", `/api/rooms/${room.id}`, values);
      }
      return apiRequest("POST", "/api/rooms", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: isEdit ? "Room updated" : "Room created" });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Room" : "Add New Room"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Conference Room A" {...field} data-testid="input-room-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="facilityId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Facility</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-room-facility">
                        <SelectValue placeholder="Select facility" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {facilities.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name} ({getTimezoneAbbr(f.timezone)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} data-testid="input-room-capacity" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="floor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Floor (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 2nd Floor" {...field} data-testid="input-room-floor" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="equipment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Equipment</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {EQUIPMENT_OPTIONS.map((eq) => (
                      <label
                        key={eq}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={field.value.includes(eq)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              field.onChange([...field.value, eq]);
                            } else {
                              field.onChange(field.value.filter((v) => v !== eq));
                            }
                          }}
                          data-testid={`checkbox-equipment-${eq.toLowerCase().replace(/[\s/]+/g, "-")}`}
                        />
                        {eq}
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-save-room">
              {mutation.isPending ? "Saving..." : isEdit ? "Update Room" : "Create Room"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface GraphRoom {
  id: string;
  displayName: string;
  emailAddress: string;
  capacity: number;
  building: string | null;
  floorLabel: string | null;
}

function SyncDialog({ facilities, open, onOpenChange }: {
  facilities: Facility[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [selectedFacility, setSelectedFacility] = useState("");
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/graph/test");
      return res.json();
    },
  });

  const { data: graphRooms, isLoading: graphRoomsLoading, refetch: fetchGraphRooms } = useQuery<GraphRoom[]>({
    queryKey: ["/api/graph/rooms"],
    enabled: false,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/graph/sync-rooms", {
        facilityId: selectedFacility,
        roomMappings: selectedRooms.length > 0 ? selectedRooms : undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Sync Complete", description: data.message });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleTest = async () => {
    try {
      const result = await testMutation.mutateAsync();
      if (result.success) {
        toast({ title: "Connection Successful", description: result.message });
        fetchGraphRooms();
      } else {
        toast({ title: "Connection Failed", description: result.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Connection Failed", description: error.message || "Could not connect to Microsoft Graph", variant: "destructive" });
    }
  };

  const toggleRoom = (email: string) => {
    setSelectedRooms((prev) =>
      prev.includes(email) ? prev.filter((r) => r !== email) : [...prev, email]
    );
  };

  const toggleAll = () => {
    if (!graphRooms) return;
    if (selectedRooms.length === graphRooms.length) {
      setSelectedRooms([]);
    } else {
      setSelectedRooms(graphRooms.map((r) => r.emailAddress));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5" />
            Sync Rooms from Microsoft 365
          </DialogTitle>
          <DialogDescription>
            Import conference rooms from your organization's Microsoft 365 directory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testMutation.isPending}
              data-testid="button-test-graph"
            >
              {testMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
              Test Connection
            </Button>
            {testMutation.data?.success && (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Connected
              </Badge>
            )}
          </div>

          {graphRooms && graphRooms.length > 0 && (
            <>
              <div>
                <label className="text-sm font-medium">Assign to Facility</label>
                <Select value={selectedFacility} onValueChange={setSelectedFacility}>
                  <SelectTrigger className="mt-1" data-testid="select-sync-facility">
                    <SelectValue placeholder="Select facility for imported rooms" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">
                    Microsoft 365 Rooms ({graphRooms.length})
                  </label>
                  <Button variant="ghost" size="sm" onClick={toggleAll} data-testid="button-toggle-all-rooms">
                    {selectedRooms.length === graphRooms.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                  {graphRooms.map((gr) => (
                    <label
                      key={gr.emailAddress}
                      className="flex items-center gap-2 p-1.5 rounded-md cursor-pointer hover-elevate"
                      data-testid={`checkbox-graph-room-${gr.emailAddress}`}
                    >
                      <Checkbox
                        checked={selectedRooms.includes(gr.emailAddress)}
                        onCheckedChange={() => toggleRoom(gr.emailAddress)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{gr.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {gr.emailAddress}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                        {gr.capacity > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Users className="w-3 h-3" />
                            {gr.capacity}
                          </span>
                        )}
                        {gr.building && <span>{gr.building}</span>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => syncMutation.mutate()}
                disabled={!selectedFacility || syncMutation.isPending}
                data-testid="button-sync-rooms"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Sync {selectedRooms.length > 0 ? `${selectedRooms.length} Selected` : "All"} Rooms
              </Button>
            </>
          )}

          {graphRoomsLoading && (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}

          {graphRooms && graphRooms.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No room resources found in your Microsoft 365 organization.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportEventsDialog({ facilities, open, onOpenChange }: {
  facilities: Facility[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [selectedFacility, setSelectedFacility] = useState("all");
  const [daysAhead, setDaysAhead] = useState("30");

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/graph/import-events", {
        facilityId: selectedFacility === "all" ? undefined : selectedFacility,
        daysAhead: parseInt(daysAhead) || 30,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Import Complete", description: data.message });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Import Failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Import Events from Outlook
          </DialogTitle>
          <DialogDescription>
            Pull meetings from Microsoft 365 room calendars into the app. Events already in the system will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Facility</label>
            <Select value={selectedFacility} onValueChange={setSelectedFacility}>
              <SelectTrigger className="mt-1" data-testid="select-import-facility">
                <SelectValue placeholder="All facilities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Facilities</SelectItem>
                {facilities.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Time Range</label>
            <Select value={daysAhead} onValueChange={setDaysAhead}>
              <SelectTrigger className="mt-1" data-testid="select-import-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Next 7 days</SelectItem>
                <SelectItem value="14">Next 14 days</SelectItem>
                <SelectItem value="30">Next 30 days</SelectItem>
                <SelectItem value="60">Next 60 days</SelectItem>
                <SelectItem value="90">Next 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Only rooms synced from Microsoft 365 (with an M365 email) will be checked. Duplicate and conflicting events are automatically skipped.
          </p>

          <Button
            className="w-full"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
            data-testid="button-import-events"
          >
            {importMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {importMutation.isPending ? "Importing..." : "Import Events"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminRooms() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editRoom, setEditRoom] = useState<RoomWithFacility | undefined>();

  const { data: rooms, isLoading: roomsLoading } = useQuery<RoomWithFacility[]>({ queryKey: ["/api/rooms"] });
  const { data: facilities } = useQuery<Facility[]>({ queryKey: ["/api/facilities"] });
  const { data: graphStatus } = useQuery<{ configured: boolean }>({ queryKey: ["/api/graph/status"] });
  const { data: subscriptions } = useQuery<GraphSubscriptionInfo[]>({
    queryKey: ["/api/graph/subscriptions"],
    enabled: !!graphStatus?.configured,
  });

  const subsByRoomId = new Map<string, GraphSubscriptionInfo>();
  subscriptions?.forEach((sub) => subsByRoomId.set(sub.roomId, sub));

  const handleEdit = (room: RoomWithFacility) => {
    setEditRoom(room);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditRoom(undefined);
    setDialogOpen(true);
  };

  if (roomsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Room Management"
        description="Configure conference rooms across all facilities"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {graphStatus?.configured && (
              <>
                <Button variant="outline" onClick={() => setImportDialogOpen(true)} data-testid="button-open-import">
                  <Download className="w-4 h-4 mr-2" />
                  Import Events
                </Button>
                <Button variant="outline" onClick={() => setSyncDialogOpen(true)} data-testid="button-open-sync">
                  <Cloud className="w-4 h-4 mr-2" />
                  Sync Rooms
                </Button>
              </>
            )}
            <Button onClick={handleAdd} data-testid="button-add-room">
              <Plus className="w-4 h-4 mr-2" />
              Add Room
            </Button>
          </div>
        }
      />

      {rooms && rooms.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Facility</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Equipment</TableHead>
                  {graphStatus?.configured && <TableHead>Last Sync</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => (
                  <TableRow key={room.id} data-testid={`row-room-${room.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <DoorOpen className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{room.name}</span>
                        {room.msGraphRoomEmail && (
                          <Badge variant="secondary" className="text-[10px] gap-0.5">
                            <Cloud className="w-2.5 h-2.5" />
                            M365
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        {room.facility.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        {room.capacity}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{room.floor || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {room.equipment?.slice(0, 2).map((eq) => (
                          <Badge key={eq} variant="secondary" className="text-[10px]">{eq}</Badge>
                        ))}
                        {(room.equipment?.length || 0) > 2 && (
                          <Badge variant="secondary" className="text-[10px]">+{(room.equipment?.length || 0) - 2}</Badge>
                        )}
                      </div>
                    </TableCell>
                    {graphStatus?.configured && (
                      <TableCell>
                        {room.msGraphRoomEmail ? (() => {
                          const sub = subsByRoomId.get(room.id);
                          if (!sub) {
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <WifiOff className="w-3 h-3" />
                                    No subscription
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent><p className="text-xs">No webhook subscription for this room</p></TooltipContent>
                              </Tooltip>
                            );
                          }
                          if (sub.lastNotificationAt) {
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400" data-testid={`text-last-sync-${room.id}`}>
                                    <Wifi className="w-3 h-3" />
                                    {formatRelativeTime(sub.lastNotificationAt)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Last sync: {new Date(sub.lastNotificationAt).toLocaleString()}</p>
                                  <p className="text-xs text-muted-foreground">Status: {sub.status}</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          }
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                  <Wifi className="w-3 h-3" />
                                  Listening
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Webhook active, no events received yet</p>
                                <p className="text-xs text-muted-foreground">Status: {sub.status}</p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })() : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant={room.isActive ? "default" : "secondary"} className="text-[10px]">
                        {room.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(room)} data-testid={`button-edit-room-${room.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <DoorOpen className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-sm mb-3">No rooms configured yet</p>
            <Button onClick={handleAdd} variant="outline" size="sm" data-testid="button-add-first-room">
              <Plus className="w-4 h-4 mr-2" />
              Add First Room
            </Button>
          </CardContent>
        </Card>
      )}

      <RoomFormDialog
        room={editRoom}
        facilities={facilities || []}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {graphStatus?.configured && (
        <>
          <SyncDialog
            facilities={facilities || []}
            open={syncDialogOpen}
            onOpenChange={setSyncDialogOpen}
          />
          <ImportEventsDialog
            facilities={facilities || []}
            open={importDialogOpen}
            onOpenChange={setImportDialogOpen}
          />
        </>
      )}
    </div>
  );
}
