import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, Tablet, Monitor } from "lucide-react";
import type { Facility, RoomWithFacility, RoomTablet, Room } from "@shared/schema";

const tabletFormSchema = z.object({
  roomId: z.string().min(1, "Room is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  displayName: z.string().min(1, "Display name is required"),
  isActive: z.boolean().default(true),
});

type TabletFormValues = z.infer<typeof tabletFormSchema>;

type TabletWithDetails = Omit<RoomTablet, "password"> & { room: Room; facility: Facility };

function TabletFormDialog({ tablet, rooms, open, onOpenChange }: {
  tablet?: TabletWithDetails;
  rooms: RoomWithFacility[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!tablet;

  const form = useForm<TabletFormValues>({
    resolver: zodResolver(isEdit ? tabletFormSchema.extend({ password: z.string().optional() }) : tabletFormSchema),
    defaultValues: {
      roomId: tablet?.roomId || "",
      username: tablet?.username || "",
      password: "",
      displayName: tablet?.displayName || "",
      isActive: tablet?.isActive ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: TabletFormValues) => {
      const payload: Record<string, unknown> = { ...values };
      if (isEdit && !values.password) {
        delete payload.password;
      }
      if (isEdit) {
        return apiRequest("PATCH", `/api/tablets/${tablet.id}`, payload);
      }
      return apiRequest("POST", "/api/tablets", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tablets"] });
      toast({ title: isEdit ? "Tablet updated" : "Tablet created" });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const roomsByFacility: Record<string, RoomWithFacility[]> = {};
  rooms.forEach((room) => {
    const key = room.facility?.name || "Unknown";
    if (!roomsByFacility[key]) roomsByFacility[key] = [];
    roomsByFacility[key].push(room);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Tablet" : "Add Tablet Login"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update tablet credentials and settings." : "Create credentials for a room's tablet kiosk display."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="roomId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-tablet-room">
                        <SelectValue placeholder="Select a room" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(roomsByFacility).map(([facilityName, facilityRooms]) => (
                        <div key={facilityName}>
                          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{facilityName}</div>
                          {facilityRooms.map((room) => (
                            <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Lobby Tablet" {...field} data-testid="input-tablet-display-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., tablet-conf-a" {...field} data-testid="input-tablet-username" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEdit ? "New Password (leave blank to keep)" : "Password"}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={isEdit ? "Leave blank to keep current" : "Enter password"} {...field} data-testid="input-tablet-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <FormLabel className="cursor-pointer">Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-tablet-active" />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-save-tablet">
              {mutation.isPending ? "Saving..." : isEdit ? "Update Tablet" : "Create Tablet"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminTablets() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTablet, setEditTablet] = useState<TabletWithDetails | undefined>();

  const { data: tablets, isLoading: tabletsLoading } = useQuery<TabletWithDetails[]>({
    queryKey: ["/api/tablets"],
  });

  const { data: rooms } = useQuery<RoomWithFacility[]>({
    queryKey: ["/api/rooms"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/tablets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tablets"] });
      toast({ title: "Tablet deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div>
      <PageHeader
        title="Tablet Kiosks"
        description="Manage tablet display credentials for conference room kiosks"
        actions={
          <Button
            onClick={() => { setEditTablet(undefined); setDialogOpen(true); }}
            data-testid="button-add-tablet"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Tablet
          </Button>
        }
      />

      {tabletsLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !tablets?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Monitor className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-1">No tablet kiosks configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create tablet login credentials to enable room kiosk displays.
            </p>
            <Button
              onClick={() => { setEditTablet(undefined); setDialogOpen(true); }}
              data-testid="button-add-tablet-empty"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Tablet
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Facility</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tablets.map((tablet) => (
                  <TableRow key={tablet.id} data-testid={`row-tablet-${tablet.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Tablet className="w-4 h-4 text-muted-foreground" />
                        {tablet.displayName}
                      </div>
                    </TableCell>
                    <TableCell>{tablet.room?.name || "Unknown"}</TableCell>
                    <TableCell>{tablet.facility?.name || "Unknown"}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded" data-testid={`text-tablet-username-${tablet.id}`}>
                        {tablet.username}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tablet.isActive ? "default" : "secondary"} data-testid={`badge-tablet-status-${tablet.id}`}>
                        {tablet.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setEditTablet(tablet); setDialogOpen(true); }}
                          data-testid={`button-edit-tablet-${tablet.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this tablet?")) {
                              deleteMutation.mutate(tablet.id);
                            }
                          }}
                          data-testid={`button-delete-tablet-${tablet.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <TabletFormDialog
        tablet={editTablet}
        rooms={rooms || []}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTablet(undefined);
        }}
      />
    </div>
  );
}
