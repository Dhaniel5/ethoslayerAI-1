import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNative } from "@/lib/native";
import { escrowAppLink, isMobileWeb, openInApp, shouldAutoOpen } from "@/lib/deeplink";

/**
 * Shown on the public escrow page when it is opened in a mobile browser.
 * Tries to hand the link to the installed EthosLayer app, and leaves the
 * visitor on the website when the app isn't installed.
 */
export default function OpenInAppBanner({ escrowId }: { escrowId: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isNative() || !isMobileWeb() || !escrowId) return;
    setShow(true);
    if (shouldAutoOpen(escrowId)) void openInApp(escrowAppLink(escrowId));
  }, [escrowId]);

  if (!show) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Smartphone className="h-4 w-4 text-primary" />
        <span>Have the EthosLayer app?</span>
      </div>
      <Button size="sm" variant="secondary" onClick={() => openInApp(escrowAppLink(escrowId))}>
        Open in app
      </Button>
    </div>
  );
}
