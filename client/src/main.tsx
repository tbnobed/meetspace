import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if ("serviceWorker" in navigator) {
  const isTabletPage = window.location.pathname.startsWith("/tablet") || window.location.pathname.startsWith("/kiosk");
  if (isTabletPage) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/tablet" }).catch(() => {});
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/manifest.json";
      document.head.appendChild(link);
      const metaTags = [
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black" },
        { name: "apple-mobile-web-app-title", content: "MeetSpace Kiosk" },
        { name: "mobile-web-app-capable", content: "yes" },
      ];
      metaTags.forEach(({ name, content }) => {
        const meta = document.createElement("meta");
        meta.name = name;
        meta.content = content;
        document.head.appendChild(meta);
      });
      const sizes = ["152x152", "167x167", "180x180"];
      sizes.forEach((size) => {
        const link = document.createElement("link");
        link.rel = "apple-touch-icon";
        link.sizes = size;
        link.href = "/icons/icon-192x192.png";
        document.head.appendChild(link);
      });
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((r) => r.unregister());
    });
    if ("caches" in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }
  }
}

createRoot(document.getElementById("root")!).render(<App />);
