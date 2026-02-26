import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { useSocket } from "@/hooks/use-socket";
import Dashboard from "@/pages/dashboard";
import BookRoom from "@/pages/book-room";
import MyBookings from "@/pages/my-bookings";
import AdminRooms from "@/pages/admin/rooms";
import AdminFacilities from "@/pages/admin/facilities";
import AdminUsers from "@/pages/admin/users";
import AdminAuditLog from "@/pages/admin/audit-log";
import AdminWebhooks from "@/pages/admin/webhooks";
import AdminTablets from "@/pages/admin/tablets";
import AllMeetings from "@/pages/all-meetings";
import AuthPage from "@/pages/auth";
import TabletLogin from "@/pages/tablet-login";
import KioskDisplay from "@/pages/kiosk";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full mt-4" /></div>;
  if (!user) return <Redirect to="/auth" />;
  return <Component />;
}

function AdminRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full mt-4" /></div>;
  if (!user) return <Redirect to="/auth" />;
  if (user.role !== "admin") return <Redirect to="/" />;
  return <Component />;
}

function AuthenticatedLayout() {
  const { user, isLoading } = useAuth();
  useSocket();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (!user) return <Redirect to="/auth" />;

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 px-3 py-2 border-b sticky top-0 bg-background z-50">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <ScrollArea className="flex-1">
            <main className="p-3 sm:p-6 w-full">
              <Switch>
                <Route path="/">{() => <ProtectedRoute component={Dashboard} />}</Route>
                <Route path="/rooms">{() => <ProtectedRoute component={AllMeetings} />}</Route>
                <Route path="/book" component={BookRoom} />
                <Route path="/bookings">{() => <ProtectedRoute component={MyBookings} />}</Route>
                <Route path="/admin/rooms">{() => <AdminRoute component={AdminRooms} />}</Route>
                <Route path="/admin/facilities">{() => <AdminRoute component={AdminFacilities} />}</Route>
                <Route path="/admin/users">{() => <AdminRoute component={AdminUsers} />}</Route>
                <Route path="/admin/audit">{() => <AdminRoute component={AdminAuditLog} />}</Route>
                <Route path="/admin/webhooks">{() => <AdminRoute component={AdminWebhooks} />}</Route>
                <Route path="/admin/tablets">{() => <AdminRoute component={AdminTablets} />}</Route>
                <Route component={NotFound} />
              </Switch>
            </main>
          </ScrollArea>
        </div>
      </div>
    </SidebarProvider>
  );
}

function GuestBookPage() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen"><Skeleton className="h-12 w-48" /></div>;
  if (user) return <AuthenticatedLayout />;
  return <BookRoom />;
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/tablet" component={TabletLogin} />
      <Route path="/kiosk" component={KioskDisplay} />
      <Route path="/book" component={GuestBookPage} />
      <Route>{() => <AuthenticatedLayout />}</Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Router />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
