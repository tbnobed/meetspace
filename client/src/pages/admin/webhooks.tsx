import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Webhook, RefreshCw, Trash2, CheckCircle2, XCircle, AlertCircle, Clock, Loader2, Radio, Zap } from "lucide-react";

interface GraphSubscriptionWithDetails {
  id: string;
  roomId: string;
  roomEmail: string;
  subscriptionId: string;
  expirationDateTime: string;
  clientState: string;
  status: string;
  lastNotificationAt: string | null;
  lastError: string | null;
  createdAt: string;
  roomName: string;
  facilityName: string;
  isExpired: boolean;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMs < 0) {
    const futureMins = Math.floor(-diffMs / 60000);
    const futureHours = Math.floor(-diffMs / 3600000);
    const futureDays = Math.floor(-diffMs / 86400000);
    if (futureDays > 0) return `in ${futureDays}d`;
    if (futureHours > 0) return `in ${futureHours}h`;
    return `in ${futureMins}m`;
  }

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return "just now";
}

function StatusBadge({ status, isExpired }: { status: string; isExpired: boolean }) {
  if (isExpired) {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="w-3 h-3" />
        Expired
      </Badge>
    );
  }
  if (status === "active") {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <AlertCircle className="w-3 h-3" />
      {status}
    </Badge>
  );
}

export default function AdminWebhooks() {
  const { toast } = useToast();

  const { data: graphStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/graph/status"],
  });

  const { data: subscriptions, isLoading } = useQuery<GraphSubscriptionWithDetails[]>({
    queryKey: ["/api/graph/subscriptions"],
    refetchInterval: 30000,
  });

  const subscribeAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/graph/subscriptions/subscribe-all");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/graph/subscriptions"] });
      toast({
        title: "Subscriptions Updated",
        description: `${data.success}/${data.total} rooms subscribed successfully`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const removeAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/graph/subscriptions");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/graph/subscriptions"] });
      toast({
        title: "Subscriptions Removed",
        description: `Removed ${data.count} subscriptions`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/graph/subscriptions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/graph/subscriptions"] });
      toast({ title: "Subscription removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  if (!graphStatus?.configured) {
    return (
      <div>
        <PageHeader
          title="Calendar Webhooks"
          description="Automatic calendar sync with Microsoft 365"
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Webhook className="w-12 h-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">Microsoft Graph Not Configured</p>
              <p className="text-sm text-muted-foreground mt-1">
                Set up MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_TENANT_ID to enable webhook subscriptions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeCount = subscriptions?.filter(s => s.status === "active" && !s.isExpired).length || 0;
  const expiredCount = subscriptions?.filter(s => s.isExpired).length || 0;
  const totalCount = subscriptions?.length || 0;

  return (
    <div>
      <PageHeader
        title="Calendar Webhooks"
        description="Automatic real-time calendar sync with Microsoft 365"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => removeAllMutation.mutate()}
              disabled={removeAllMutation.isPending || totalCount === 0}
              data-testid="button-remove-all-subs"
            >
              {removeAllMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Remove All
            </Button>
            <Button
              onClick={() => subscribeAllMutation.mutate()}
              disabled={subscribeAllMutation.isPending}
              data-testid="button-subscribe-all"
            >
              {subscribeAllMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Subscribe All Rooms
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                <Radio className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-active-subs">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Active Subscriptions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-destructive/10">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-expired-subs">{expiredCount}</p>
                <p className="text-xs text-muted-foreground">Expired</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted">
                <Webhook className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-subs">{totalCount}</p>
                <p className="text-xs text-muted-foreground">Total Subscriptions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4">
          <p className="text-xs text-muted-foreground mb-3 px-2">
            Webhook subscriptions automatically sync calendar changes from Microsoft 365 room mailboxes. Subscriptions expire after ~3 days and are auto-renewed hourly.
          </p>

          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : subscriptions && subscriptions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>Facility</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Last Notification</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((sub) => (
                    <TableRow key={sub.id} data-testid={`row-sub-${sub.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{sub.roomName}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{sub.roomEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{sub.facilityName}</TableCell>
                      <TableCell>
                        <StatusBadge status={sub.status} isExpired={sub.isExpired} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          {formatRelativeTime(sub.expirationDateTime)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(sub.lastNotificationAt)}
                      </TableCell>
                      <TableCell>
                        {sub.lastError ? (
                          <span className="text-xs text-destructive truncate max-w-[150px] block" title={sub.lastError}>
                            {sub.lastError.substring(0, 40)}...
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMutation.mutate(sub.id)}
                          disabled={removeMutation.isPending}
                          data-testid={`button-remove-sub-${sub.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Webhook className="w-10 h-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">No Active Subscriptions</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click "Subscribe All Rooms" to start receiving automatic calendar updates from Microsoft 365.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-6">
          <h3 className="text-sm font-medium mb-2">Self-Hosted Setup Notes</h3>
          <div className="text-xs text-muted-foreground space-y-1.5">
            <p>For webhook subscriptions to work, Microsoft must be able to reach your server via a public HTTPS URL.</p>
            <p>Set the <code className="bg-muted px-1 py-0.5 rounded text-foreground">WEBHOOK_BASE_URL</code> environment variable to your server's public URL (e.g., <code className="bg-muted px-1 py-0.5 rounded text-foreground">https://meetspace.yourcompany.com</code>).</p>
            <p>On Ubuntu, use Nginx as a reverse proxy with Let's Encrypt for SSL. The webhook endpoint is <code className="bg-muted px-1 py-0.5 rounded text-foreground">/api/graph/webhook</code>.</p>
            <p>Subscriptions auto-renew hourly and expire after ~3 days if the server is offline.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
