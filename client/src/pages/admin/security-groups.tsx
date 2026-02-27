import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
} from "@/components/ui/alert-dialog";
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Users,
  DoorOpen,
  Search,
  Loader2,
} from "lucide-react";
import type { User, RoomWithFacility, SecurityGroup } from "@shared/schema";

type GroupWithCounts = SecurityGroup & { memberCount: number; roomCount: number };
type GroupDetail = SecurityGroup & { memberIds: string[]; roomIds: string[] };

function CreateEditDialog({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: GroupWithCounts;
}) {
  const [name, setName] = useState(group?.name || "");
  const [description, setDescription] = useState(group?.description || "");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      if (group) {
        return apiRequest("PATCH", `/api/security-groups/${group.id}`, { name, description });
      }
      return apiRequest("POST", "/api/security-groups", { name, description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security-groups"] });
      toast({ title: group ? "Group updated" : "Group created" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? "Edit Security Group" : "Create Security Group"}</DialogTitle>
          <DialogDescription>
            {group ? "Update the group name and description." : "Create a new security group to manage room access."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Executive Team"
              data-testid="input-group-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-description">Description</Label>
            <Textarea
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of this group's purpose"
              data-testid="input-group-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-group">
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending} data-testid="button-save-group">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {group ? "Save Changes" : "Create Group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageMembersDialog({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupWithCounts;
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { toast } = useToast();

  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: detail } = useQuery<GroupDetail>({
    queryKey: ["/api/security-groups", group.id],
    enabled: open,
  });

  if (detail && !loaded) {
    setSelectedIds(detail.memberIds);
    setLoaded(true);
  }

  if (!open && loaded) {
    setLoaded(false);
  }

  const mutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/security-groups/${group.id}/members`, { userIds: selectedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security-groups"] });
      toast({ title: "Members updated" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filteredUsers = users.filter(
    (u) =>
      u.role !== "admin" &&
      (u.displayName.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.username.toLowerCase().includes(search.toLowerCase()))
  );

  const toggleUser = (userId: string) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Members — {group.name}</DialogTitle>
          <DialogDescription>Select users to include in this security group. Admins always have full access and are not listed.</DialogDescription>
        </DialogHeader>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-members"
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[40vh] border rounded-md p-2">
          {filteredUsers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
          )}
          {filteredUsers.map((user) => (
            <label
              key={user.id}
              className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent cursor-pointer"
              data-testid={`member-row-${user.id}`}
            >
              <Checkbox
                checked={selectedIds.includes(user.id)}
                onCheckedChange={() => toggleUser(user.id)}
                data-testid={`checkbox-member-${user.id}`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user.displayName}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">{user.role}</Badge>
            </label>
          ))}
        </div>
        <div className="text-sm text-muted-foreground">
          {selectedIds.length} user{selectedIds.length !== 1 ? "s" : ""} selected
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-members">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-members">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Members
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageRoomsDialog({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupWithCounts;
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { toast } = useToast();

  const { data: rooms = [] } = useQuery<RoomWithFacility[]>({ queryKey: ["/api/rooms"] });
  const { data: detail } = useQuery<GroupDetail>({
    queryKey: ["/api/security-groups", group.id],
    enabled: open,
  });

  if (detail && !loaded) {
    setSelectedIds(detail.roomIds);
    setLoaded(true);
  }

  if (!open && loaded) {
    setLoaded(false);
  }

  const mutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/security-groups/${group.id}/rooms`, { roomIds: selectedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security-groups"] });
      toast({ title: "Rooms updated" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filteredRooms = rooms.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.facility.name.toLowerCase().includes(search.toLowerCase())
  );

  const facilitiesMap = new Map<string, { name: string; rooms: RoomWithFacility[] }>();
  filteredRooms.forEach((r) => {
    if (!facilitiesMap.has(r.facilityId)) {
      facilitiesMap.set(r.facilityId, { name: r.facility.name, rooms: [] });
    }
    facilitiesMap.get(r.facilityId)!.rooms.push(r);
  });

  const toggleRoom = (roomId: string) => {
    setSelectedIds((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Rooms — {group.name}</DialogTitle>
          <DialogDescription>Select which rooms members of this group can book.</DialogDescription>
        </DialogHeader>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search rooms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-rooms"
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 min-h-0 max-h-[40vh] border rounded-md p-2">
          {Array.from(facilitiesMap.entries()).map(([facId, fac]) => (
            <div key={facId}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-2">
                {fac.name}
              </div>
              {fac.rooms.map((room) => (
                <label
                  key={room.id}
                  className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent cursor-pointer"
                  data-testid={`room-row-${room.id}`}
                >
                  <Checkbox
                    checked={selectedIds.includes(room.id)}
                    onCheckedChange={() => toggleRoom(room.id)}
                    data-testid={`checkbox-room-${room.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{room.name}</div>
                    <div className="text-xs text-muted-foreground">Capacity: {room.capacity}</div>
                  </div>
                </label>
              ))}
            </div>
          ))}
          {facilitiesMap.size === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No rooms found</p>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {selectedIds.length} room{selectedIds.length !== 1 ? "s" : ""} selected
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-rooms">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-rooms">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Rooms
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminSecurityGroups() {
  const { data: groups = [], isLoading } = useQuery<GroupWithCounts[]>({
    queryKey: ["/api/security-groups"],
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<GroupWithCounts | null>(null);
  const [membersGroup, setMembersGroup] = useState<GroupWithCounts | null>(null);
  const [roomsGroup, setRoomsGroup] = useState<GroupWithCounts | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GroupWithCounts | null>(null);
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/security-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security-groups"] });
      toast({ title: "Group deleted" });
      setDeleteGroup(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-security-groups">
            <Shield className="w-6 h-6" />
            Security Groups
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage room access by creating groups and assigning users and rooms to them.
            Users must be in a security group to book rooms. Admins bypass all restrictions.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-create-group">
          <Plus className="w-4 h-4 mr-2" />
          New Group
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Security Groups</h3>
            <p className="text-sm text-muted-foreground mb-4">
              All rooms are currently open to everyone. Create a security group to restrict access to specific rooms.
            </p>
            <Button onClick={() => setCreateOpen(true)} data-testid="button-create-group-empty">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Group
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {groups.map((group) => (
          <Card key={group.id} data-testid={`card-group-${group.id}`}>
            <CardContent className="flex items-center justify-between py-4 px-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-base" data-testid={`text-group-name-${group.id}`}>{group.name}</h3>
                </div>
                {group.description && (
                  <p className="text-sm text-muted-foreground mb-2">{group.description}</p>
                )}
                <div className="flex gap-3">
                  <Badge variant="secondary" className="gap-1" data-testid={`badge-members-${group.id}`}>
                    <Users className="w-3 h-3" />
                    {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                  </Badge>
                  <Badge variant="secondary" className="gap-1" data-testid={`badge-rooms-${group.id}`}>
                    <DoorOpen className="w-3 h-3" />
                    {group.roomCount} room{group.roomCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMembersGroup(group)}
                  data-testid={`button-manage-members-${group.id}`}
                >
                  <Users className="w-4 h-4 mr-1" />
                  Members
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRoomsGroup(group)}
                  data-testid={`button-manage-rooms-${group.id}`}
                >
                  <DoorOpen className="w-4 h-4 mr-1" />
                  Rooms
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditGroup(group)}
                  data-testid={`button-edit-group-${group.id}`}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteGroup(group)}
                  data-testid={`button-delete-group-${group.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CreateEditDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editGroup && (
        <CreateEditDialog
          open={!!editGroup}
          onOpenChange={(open) => { if (!open) setEditGroup(null); }}
          group={editGroup}
        />
      )}
      {membersGroup && (
        <ManageMembersDialog
          open={!!membersGroup}
          onOpenChange={(open) => { if (!open) setMembersGroup(null); }}
          group={membersGroup}
        />
      )}
      {roomsGroup && (
        <ManageRoomsDialog
          open={!!roomsGroup}
          onOpenChange={(open) => { if (!open) setRoomsGroup(null); }}
          group={roomsGroup}
        />
      )}

      <AlertDialog open={!!deleteGroup} onOpenChange={(open) => { if (!open) setDeleteGroup(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Security Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteGroup?.name}"? This will remove all member and room assignments. Users will lose access to any rooms that were only accessible through this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteGroup && deleteMutation.mutate(deleteGroup.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
