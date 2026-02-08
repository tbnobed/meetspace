import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScrollArea } from "@/components/ui/scroll-area";
import Dashboard from "@/pages/dashboard";
import BookRoom from "@/pages/book-room";
import MyBookings from "@/pages/my-bookings";
import AdminRooms from "@/pages/admin/rooms";
import AdminFacilities from "@/pages/admin/facilities";
import AdminUsers from "@/pages/admin/users";
import AdminAuditLog from "@/pages/admin/audit-log";
import CalendarView from "@/pages/calendar";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/calendar" component={CalendarView} />
      <Route path="/book" component={BookRoom} />
      <Route path="/bookings" component={MyBookings} />
      <Route path="/admin/rooms" component={AdminRooms} />
      <Route path="/admin/facilities" component={AdminFacilities} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/audit" component={AdminAuditLog} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 min-w-0">
                <header className="flex items-center justify-between gap-2 p-2 border-b sticky top-0 bg-background z-50">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <ThemeToggle />
                </header>
                <ScrollArea className="flex-1">
                  <main className="p-6 max-w-7xl mx-auto w-full">
                    <Router />
                  </main>
                </ScrollArea>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
