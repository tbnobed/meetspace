import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import {
  CalendarPlus,
  X,
  Pencil,
  DoorOpen,
  Building2,
  Users,
  Clock,
  ClipboardList,
} from "lucide-react";
import type { AuditLog, User } from "@shared/schema";

type AuditLogWithUser = AuditLog & { user?: Pick<User, "id" | "displayName" | "email"> };

const actionConfig: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  booking_created: { label: "Booking Created", icon: <CalendarPlus className="w-3.5 h-3.5" />, variant: "default" },
  booking_cancelled: { label: "Booking Cancelled", icon: <X className="w-3.5 h-3.5" />, variant: "destructive" },
  booking_modified: { label: "Booking Modified", icon: <Pencil className="w-3.5 h-3.5" />, variant: "secondary" },
  room_created: { label: "Room Created", icon: <DoorOpen className="w-3.5 h-3.5" />, variant: "default" },
  room_updated: { label: "Room Updated", icon: <Pencil className="w-3.5 h-3.5" />, variant: "secondary" },
  room_deleted: { label: "Room Deleted", icon: <X className="w-3.5 h-3.5" />, variant: "destructive" },
  facility_created: { label: "Facility Created", icon: <Building2 className="w-3.5 h-3.5" />, variant: "default" },
  facility_updated: { label: "Facility Updated", icon: <Pencil className="w-3.5 h-3.5" />, variant: "secondary" },
  facility_deleted: { label: "Facility Deleted", icon: <X className="w-3.5 h-3.5" />, variant: "destructive" },
  user_created: { label: "User Created", icon: <Users className="w-3.5 h-3.5" />, variant: "default" },
  user_updated: { label: "User Updated", icon: <Pencil className="w-3.5 h-3.5" />, variant: "secondary" },
};

export default function AdminAuditLog() {
  const { data: logs, isLoading } = useQuery<AuditLogWithUser[]>({ queryKey: ["/api/audit-logs"] });

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
        title="Audit Log"
        description="Track all system changes and user actions"
      />

      {logs && logs.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const config = actionConfig[log.action] || { label: log.action, icon: <Clock className="w-3.5 h-3.5" />, variant: "secondary" as const };
                    return (
                      <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                        <TableCell>
                          <Badge variant={config.variant} className="text-[10px] gap-1">
                            {config.icon}
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.user?.displayName || "System"}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{log.entityType}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                            {log.details || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-sm">No audit entries yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
