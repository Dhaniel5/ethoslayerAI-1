import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Loader2, Smartphone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPushStatus, requestPushPermission, saveDeviceToken, type PushStatus } from "@/lib/push";
import { PUSH_TOKEN_KEY, secureGet } from "@/lib/native";
import { useToast } from "@/hooks/use-toast";

const Row = ({ ok, label, detail }: { ok: boolean; label: string; detail: string }) => (
  <div className="flex items-start gap-2 text-sm">
    {ok ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
    ) : (
      <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
    )}
    <div>
      <p className="font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  </div>
);

export default function MobileStatusCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => setStatus(await getPushStatus());
  useEffect(() => { load(); }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const ok = await requestPushPermission();
      if (ok) {
        // Give the registration listener a moment to store the token.
        await new Promise((r) => setTimeout(r, 1200));
        const token = await secureGet(PUSH_TOKEN_KEY);
        if (token) await saveDeviceToken(token);
      }
      await load();
      toast({
        title: ok ? "Notifications enabled" : "Notifications not enabled",
        description: ok
          ? "This phone will receive escrow updates."
          : "You can turn them on later in your phone's settings.",
        variant: ok ? "default" : "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <Card className="glass-card"><CardContent className="p-6 flex justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardContent className="p-6 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" /> Mobile app
        </p>

        <Row
          ok={status.native}
          label={status.native ? `Running inside the app (${status.platform})` : "Running in a web browser"}
          detail={status.native
            ? "Native features are available on this device."
            : "Notifications only work in the installed iOS/Android app."}
        />
        <Row
          ok={status.permission === "granted"}
          label={`Notification permission: ${status.permission}`}
          detail="Your phone must allow notifications before updates can arrive."
        />
        <Row
          ok={!!status.token}
          label={status.token ? "This phone has a delivery address" : "No delivery address yet"}
          detail={status.token ? `${status.token.slice(0, 10)}…${status.token.slice(-6)}` : "Enable notifications to create one."}
        />
        <Row
          ok={status.registeredInCloud}
          label={status.registeredInCloud ? "Linked to your account" : "Not linked to your account yet"}
          detail="Escrow and dispute updates are sent to phones linked to your account."
        />

        {status.native && status.permission !== "granted" && (
          <Button size="sm" onClick={enable} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Enable notifications
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
