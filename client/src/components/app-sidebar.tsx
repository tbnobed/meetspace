import { useLocation, Link } from "wouter";
import { LayoutDashboard, CalendarPlus, CalendarDays, DoorOpen, Building2, Users, ClipboardList, Settings, LogOut, List, Webhook } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import sidebarLogo from "@assets/MeetSpace_noText_1770928191478.png";

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Rooms", url: "/meetings", icon: List },
  { title: "Book a Room", url: "/book", icon: CalendarPlus },
  { title: "My Bookings", url: "/bookings", icon: ClipboardList },
];

const adminNav = [
  { title: "Rooms", url: "/admin/rooms", icon: DoorOpen },
  { title: "Facilities", url: "/admin/facilities", icon: Building2 },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Webhooks", url: "/admin/webhooks", icon: Webhook },
  { title: "Audit Log", url: "/admin/audit", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const isSiteAdmin = user?.role === "site_admin";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <img src={sidebarLogo} alt="MeetSpace" className="h-20 object-contain" data-testid="img-sidebar-logo" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>
              <span className="flex items-center gap-2">
                Administration
                <Badge variant="secondary" className="text-[10px]">Admin</Badge>
              </span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url || location.startsWith(item.url + "/")}>
                      <Link href={item.url} data-testid={`nav-admin-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4">
        {user && (
          <div className="space-y-3">
            <div className="text-xs">
              <p className="font-medium truncate" data-testid="text-user-name">{user.displayName}</p>
              <p className="text-muted-foreground truncate">{user.email}</p>
              {isSiteAdmin && (
                <Badge variant="outline" className="text-[10px] mt-1 border-primary/50">Site Admin</Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={async () => {
                await logout();
                window.location.href = "/auth";
              }}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-2">
          MeetSpace Manager v1.0
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
