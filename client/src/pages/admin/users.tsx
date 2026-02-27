import { useState, useEffect, useRef } from "react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
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
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Users, Shield, Pencil, Trash2, CheckCircle, Clock, Mail, Send, MapPin, ChevronsUpDown, Check, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { User, SecurityGroup } from "@shared/schema";

type UserWithDetails = User & { securityGroupNames?: string[] };

const userFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  displayName: z.string().min(1, "Display name is required"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "user", "site_admin"]),
  password: z.string().optional(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

function MultiSelectGroups({ groups, selectedIds, onToggle, onRemove }: {
  groups: SecurityGroup[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  const selectedGroups = groups.filter((g) => selectedIds.includes(g.id));

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className="flex items-center justify-between w-full min-h-[40px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        data-testid="button-security-groups-dropdown"
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selectedGroups.length > 0 ? selectedGroups.map((g) => (
            <Badge
              key={g.id}
              variant="secondary"
              className="text-xs flex items-center gap-1"
              data-testid={`badge-group-${g.id}`}
            >
              {g.name}
              <X
                className="w-3 h-3 cursor-pointer hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onRemove(g.id); }}
                data-testid={`remove-group-${g.id}`}
              />
            </Badge>
          )) : (
            <span className="text-muted-foreground">Select security groups...</span>
          )}
        </div>
        <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50 ml-2" />
      </button>
      {dropdownOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-[200px] overflow-y-auto">
          {groups.length > 0 ? groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => onToggle(group.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent cursor-pointer text-left"
              data-testid={`option-group-${group.id}`}
            >
              <div className="w-4 h-4 flex items-center justify-center">
                {selectedIds.includes(group.id) && <Check className="w-4 h-4 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{group.name}</div>
                {group.description && (
                  <div className="text-xs text-muted-foreground truncate">{group.description}</div>
                )}
              </div>
            </button>
          )) : (
            <p className="text-xs text-muted-foreground text-center py-3">No security groups created yet</p>
          )}
        </div>
      )}
    </div>
  );
}

function UserFormDialog({ user, open, onOpenChange }: {
  user?: UserWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!user;
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const { data: allGroups = [] } = useQuery<SecurityGroup[]>({
    queryKey: ["/api/security-groups"],
    enabled: open,
  });

  const { data: userGroupIds } = useQuery<string[]>({
    queryKey: ["/api/users", user?.id, "security-groups"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user!.id}/security-groups`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: open && isEdit && !!user?.id,
  });

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      username: user?.username || "",
      displayName: user?.displayName || "",
      email: user?.email || "",
      role: (user?.role as "admin" | "user" | "site_admin") || "user",
      password: "",
    },
  });

  useEffect(() => {
    form.reset({
      username: user?.username || "",
      displayName: user?.displayName || "",
      email: user?.email || "",
      role: (user?.role as "admin" | "user" | "site_admin") || "user",
      password: "",
    });
    if (userGroupIds) {
      setSelectedGroupIds(userGroupIds);
    } else if (!isEdit) {
      setSelectedGroupIds([]);
    }
  }, [user, open, userGroupIds]);

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const mutation = useMutation({
    mutationFn: async (values: UserFormValues) => {
      const body: Record<string, any> = { ...values, securityGroupIds: selectedGroupIds };
      if (isEdit) {
        if (!body.password) {
          delete body.password;
        }
        delete body.username;
        return apiRequest("PATCH", `/api/users/${user.id}`, body);
      }
      if (!body.password || body.password.length < 6) {
        throw new Error("Password must be at least 6 characters for new users");
      }
      return apiRequest("POST", "/api/users", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/security-groups"] });
      toast({ title: isEdit ? "User updated" : "User created" });
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
          <DialogTitle>{isEdit ? "Edit User" : "Add New User"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            {!isEdit && (
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., jsmith" {...field} data-testid="input-user-username" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., John Smith" {...field} data-testid="input-user-displayname" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john@company.com" {...field} data-testid="input-user-email" />
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
                  <FormLabel>{isEdit ? "Password (leave blank to keep current)" : "Password"}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={isEdit ? "Leave blank to keep current" : "Min. 6 characters"} {...field} data-testid="input-user-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-user-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="site_admin">Site Admin</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <Label className="text-sm font-medium">Security Groups</Label>
              <p className="text-xs text-muted-foreground mb-2">Assign groups to control which rooms this user can book</p>
              <MultiSelectGroups
                groups={allGroups}
                selectedIds={selectedGroupIds}
                onToggle={toggleGroup}
                onRemove={(id) => setSelectedGroupIds((prev) => prev.filter((g) => g !== id))}
              />
            </div>
            <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-save-user">
              {mutation.isPending ? "Saving..." : isEdit ? "Update User" : "Create User"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const inviteFormSchema = z.object({
  email: z.string().email("Valid email is required"),
  displayName: z.string().min(1, "Display name is required"),
  role: z.enum(["admin", "user", "site_admin"]),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

function InviteUserDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      displayName: "",
      role: "user",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        email: "",
        displayName: "",
        role: "user",
      });
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (values: InviteFormValues) => {
      return apiRequest("POST", "/api/users/invite", values);
    },
    onSuccess: async (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      const data = await response.json();
      if (data.emailSent) {
        toast({ title: "Invite sent", description: `An invitation email has been sent to ${form.getValues("email")}` });
      } else {
        toast({ title: "User created", description: "User was created but the invite email could not be sent. Check your SendGrid configuration.", variant: "destructive" });
      }
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Invite User via Email
            </div>
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="user@company.com" {...field} data-testid="input-invite-email" />
                  </FormControl>
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
                    <Input placeholder="e.g., Jane Doe" {...field} data-testid="input-invite-displayname" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-invite-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="site_admin">Site Admin</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">Room access is managed via Security Groups</p>
                </FormItem>
              )}
            />
            <p className="text-xs text-muted-foreground">A temporary password will be generated and sent to the user along with their login credentials.</p>
            <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-send-invite">
              <Send className="w-4 h-4 mr-2" />
              {mutation.isPending ? "Sending Invite..." : "Send Invite"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function getRoleBadge(role: string) {
  switch (role) {
    case "admin":
      return (
        <Badge variant="default" className="text-[10px]">
          <Shield className="w-3 h-3 mr-1" />
          Admin
        </Badge>
      );
    case "site_admin":
      return (
        <Badge variant="outline" className="text-[10px] border-primary/50">
          <MapPin className="w-3 h-3 mr-1" />
          Site Admin
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-[10px]">
          User
        </Badge>
      );
  }
}

export default function AdminUsers() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserWithDetails | undefined>();
  const [deleteUser, setDeleteUser] = useState<UserWithDetails | undefined>();
  const { toast } = useToast();

  const { data: users, isLoading } = useQuery<UserWithDetails[]>({ queryKey: ["/api/users"] });

  const approveMutation = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      return apiRequest("PATCH", `/api/users/${id}`, { approved });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted" });
      setDeleteUser(undefined);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setDeleteUser(undefined);
    },
  });

  const handleEdit = (user: UserWithDetails) => {
    setEditUser(user);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditUser(undefined);
    setDialogOpen(true);
  };

  if (isLoading) {
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
        title="User Management"
        description="Add, edit, and manage user accounts"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setInviteDialogOpen(true)} data-testid="button-invite-user">
              <Mail className="w-4 h-4 mr-2" />
              Invite via Email
            </Button>
            <Button onClick={handleAdd} data-testid="button-add-user">
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </div>
        }
      />

      {users && users.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Security Groups</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-xs">
                            {user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm" data-testid={`text-user-display-${user.id}`}>{user.displayName}</p>
                          <p className="text-xs text-muted-foreground">@{user.username}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      {getRoleBadge(user.role)}
                    </TableCell>
                    <TableCell>
                      {user.approved ? (
                        <Badge variant="secondary" className="text-[10px]" data-testid={`badge-approved-${user.id}`}>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Approved
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] border-yellow-500/50 text-yellow-700 dark:text-yellow-400" data-testid={`badge-pending-${user.id}`}>
                            <Clock className="w-3 h-3 mr-1" />
                            Pending
                          </Badge>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => approveMutation.mutate({ id: user.id, approved: true })}
                            disabled={approveMutation.isPending}
                            data-testid={`button-approve-user-${user.id}`}
                          >
                            Approve
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.securityGroupNames && user.securityGroupNames.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {user.securityGroupNames.map((name) => (
                            <Badge key={name} variant="outline" className="text-[10px] whitespace-nowrap w-fit">
                              <Shield className="w-3 h-3 mr-1 flex-shrink-0" />
                              {name}
                            </Badge>
                          ))}
                        </div>
                      ) : user.role === "admin" ? (
                        <span className="text-xs text-muted-foreground italic">All access</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No groups</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(user)} data-testid={`button-edit-user-${user.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteUser(user)} data-testid={`button-delete-user-${user.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
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
            <Users className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-sm mb-3">No users found</p>
            <Button onClick={handleAdd} variant="outline" size="sm" data-testid="button-add-first-user">
              <Plus className="w-4 h-4 mr-2" />
              Add First User
            </Button>
          </CardContent>
        </Card>
      )}

      <UserFormDialog
        user={editUser}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <InviteUserDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
      />

      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteUser?.displayName}</strong> (@{deleteUser?.username})? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
