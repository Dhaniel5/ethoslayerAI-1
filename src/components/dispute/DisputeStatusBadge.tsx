import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Handshake, Gavel, XCircle, Search } from "lucide-react";
import type { DisputeStatus } from "@/lib/disputes";

const map: Record<DisputeStatus, { label: string; cls: string; Icon: typeof AlertTriangle }> = {
  open: { label: "Open", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30", Icon: AlertTriangle },
  under_review: { label: "Under Review", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30", Icon: Search },
  negotiating: { label: "Negotiating", cls: "bg-primary/10 text-primary border-primary/30", Icon: Handshake },
  resolved: { label: "Resolved", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground border-border", Icon: XCircle },
  escalated: { label: "Escalated", cls: "bg-destructive/10 text-destructive border-destructive/30", Icon: Gavel },
};

export function DisputeStatusBadge({ status, size = "sm" }: { status: DisputeStatus; size?: "sm" | "lg" }) {
  const s = map[status];
  return (
    <Badge
      variant="outline"
      className={cn("font-medium gap-1.5", s.cls, size === "lg" && "text-sm px-3 py-1")}
    >
      <s.Icon className={size === "lg" ? "h-4 w-4" : "h-3 w-3"} />
      {s.label}
    </Badge>
  );
}
