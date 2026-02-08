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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EQUIPMENT_OPTIONS, getTimezoneAbbr } from "@/lib/constants";
import { Plus, DoorOpen, Users, Building2, Pencil } from "lucide-react";
import type { Facility, RoomWithFacility } from "@shared/schema";

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

export default function AdminRooms() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRoom, setEditRoom] = useState<RoomWithFacility | undefined>();

  const { data: rooms, isLoading: roomsLoading } = useQuery<RoomWithFacility[]>({ queryKey: ["/api/rooms"] });
  const { data: facilities } = useQuery<Facility[]>({ queryKey: ["/api/facilities"] });

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
          <Button onClick={handleAdd} data-testid="button-add-room">
            <Plus className="w-4 h-4 mr-2" />
            Add Room
          </Button>
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
    </div>
  );
}
