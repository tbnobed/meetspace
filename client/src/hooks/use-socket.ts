import { useEffect } from "react";
import { io } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";

const socket = io({
  transports: ["websocket", "polling"],
});

export function useSocket() {
  useEffect(() => {
    function onBookingsUpdated() {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/range"] });
    }

    function onFacilitiesUpdated() {
      queryClient.invalidateQueries({ queryKey: ["/api/facilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
    }

    function onRoomsUpdated() {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
    }

    function onUsersUpdated() {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    }

    socket.on("bookings:updated", onBookingsUpdated);
    socket.on("facilities:updated", onFacilitiesUpdated);
    socket.on("rooms:updated", onRoomsUpdated);
    socket.on("users:updated", onUsersUpdated);

    return () => {
      socket.off("bookings:updated", onBookingsUpdated);
      socket.off("facilities:updated", onFacilitiesUpdated);
      socket.off("rooms:updated", onRoomsUpdated);
      socket.off("users:updated", onUsersUpdated);
    };
  }, []);
}
