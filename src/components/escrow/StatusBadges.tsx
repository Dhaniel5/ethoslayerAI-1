import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EscrowStatus } from "@/lib/escrow";
import type { TrustLevel } from "@/lib/trustScore";

const statusMap: Record<EscrowStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-muted text-muted-foreground border-border" },
  locked: { label: "Locked", cls: "bg-primary/10 text-primary border-primary/30" },
  in_review: { label: "In Review", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  released: { label: "Released", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  disputed: { label: "Disputed", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  expired: { label: "Expired", cls: "bg-muted text-muted-foreground border-border" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({ status }: { status: EscrowStatus }) {
  const s = statusMap[status];
  return <Badge variant="outline" className={cn("font-medium", s.cls)}>{s.label}</Badge>;
}

const trustMap: Record<TrustLevel, { label: string; cls: string }> = {
  low: { label: "Low Trust", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  medium: { label: "Medium Trust", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  high: { label: "High Trust", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
};

export function TrustBadge({ level, score }: { level: TrustLevel; score?: number }) {
  const t = trustMap[level];
  return (
    <Badge variant="outline" className={cn("font-medium", t.cls)}>
      {t.label}{score !== undefined ? ` · ${score}` : ""}
    </Badge>
  );
}
