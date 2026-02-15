import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tablet, Download, Share } from "lucide-react";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as any).standalone === true;
}

function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes("Mac") && "ontouchend" in document);
    if (isIOS) setShowIOSHint(true);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isStandalone() || dismissed) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setDismissed(true);
  };

  if (deferredPrompt) {
    return (
      <div className="w-full max-w-sm mb-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Install as App</p>
                <p className="text-xs text-muted-foreground">Add to home screen for full-screen kiosk mode</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleInstall} data-testid="button-install-app">Install</Button>
                <Button size="sm" variant="ghost" onClick={() => setDismissed(true)} data-testid="button-dismiss-install">Later</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showIOSHint) {
    return (
      <div className="w-full max-w-sm mb-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start gap-3">
              <Share className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Install as App</p>
                <p className="text-xs text-muted-foreground">
                  Tap the <strong>Share</strong> button in Safari, then <strong>Add to Home Screen</strong> for full-screen kiosk mode
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDismissed(true)} data-testid="button-dismiss-ios-hint">OK</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}

export default function TabletLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/tablet/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Login failed");
      }
      window.location.href = "/kiosk";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <InstallBanner />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Tablet className="w-10 h-10 text-primary" />
          </div>
          <CardTitle className="text-xl">Tablet Kiosk Login</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to display the room kiosk</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" data-testid="text-tablet-login-error">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tablet username"
                required
                data-testid="input-tablet-login-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                data-testid="input-tablet-login-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="button-tablet-login-submit">
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
