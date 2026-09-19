import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Loader2, ExternalLink, Share2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/escrow/StatusBadges";
import type { EscrowRow, MilestoneRow, EventRow } from "@/lib/escrow";
import { shortAddr, escrowShareLink } from "@/lib/escrow";
import { explorerTxUrl } from "@/lib/solanaConfig";
import { useToast } from "@/hooks/use-toast";

const STAGE_ORDER: EscrowRow["status"][] = ["pending", "locked", "in_review", "released"];

function stageProgress(status: EscrowRow["status"]) {
  if (status === "disputed" || status === "escalated") return 60;
  if (status === "cancelled" || status === "expired") return 100;
  const idx = STAGE_ORDER.indexOf(status);
  return idx === -1 ? 0 : Math.round(((idx + 1) / STAGE_ORDER.length) * 100);
}

function daysLeftLabel(expiresAt: string | null) {
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "Expired";
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

interface Props {
  escrow: EscrowRow;
  milestones: MilestoneRow[];
  events: EventRow[];
  disputeId: string | null;
  actionLoading: boolean;
  releasedTx: string | null;
  disputeReason: string;
  setDisputeReason: (v: string) => void;
  isReleasable: boolean;
  isDisputable: boolean;
  onRelease: () => void;
  onApproveMilestone: (m: MilestoneRow) => void;
  onDispute: () => void;
  onDismissReleaseScreen: () => void;
}

export default function MobileEscrowDetail({
  escrow, milestones, events, disputeId, actionLoading, releasedTx,
  disputeReason, setDisputeReason, isReleasable, isDisputable,
  onRelease, onApproveMilestone, onDispute, onDismissReleaseScreen,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Screen 7: full-screen success after a release just happened.
  if (releasedTx) {
    return (
      <div className="min-h-screen bg-background flex flex-col px-5 pt-10 pb-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-auto h-16 w-16 rounded-full bg-emerald-500/15 flex items-center justify-center mb-5"
        >
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </motion.div>
        <h1 className="font-display text-xl font-bold text-foreground text-center">Payment Released!</h1>
        <p className="text-sm text-muted-foreground text-center mt-1.5">
          The funds have been successfully released to the recipient.
        </p>

        <div className="glass-card p-5 mt-8 text-center">
          <p className="font-display text-3xl font-bold text-foreground">
            {Number(escrow.amount_audd).toLocaleString()} <span className="text-base text-muted-foreground">AUDD</span>
          </p>
        </div>

        <div className="glass-card p-4 mt-3">
          <p className="text-xs text-muted-foreground mb-1">Transaction Hash</p>
          <a
            href={explorerTxUrl(releasedTx)}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-mono text-primary inline-flex items-center gap-1.5"
          >
            {releasedTx.slice(0, 6)}…{releasedTx.slice(-6)} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-auto pt-6 space-y-2">
          <Button asChild className="w-full">
            <a href={explorerTxUrl(releasedTx)} target="_blank" rel="noreferrer">View on Explorer</a>
          </Button>
          <Button variant="outline" className="w-full" onClick={onDismissReleaseScreen}>Done</Button>
        </div>
      </div>
    );
  }

  const days = daysLeftLabel(escrow.expires_at);

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="flex items-center justify-between px-5 pt-6 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => navigate("/settlement")} aria-label="Back"
            className="h-9 w-9 rounded-full glass-card flex items-center justify-center text-foreground/80 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">Agreement #{escrow.id.slice(0, 8).toUpperCase()}</p>
            <StatusBadge status={escrow.status} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(escrowShareLink(escrow.id));
            toast({ title: "Share link copied" });
          }}
          aria-label="Share"
          className="h-9 w-9 rounded-full glass-card flex items-center justify-center text-foreground/80 shrink-0"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5 space-y-4">
        <div>
          <h1 className="font-display text-lg font-bold text-foreground">{escrow.description || "Escrow agreement"}</h1>
          <p className="font-display text-2xl font-bold text-foreground mt-1">
            {Number(escrow.amount_audd).toLocaleString()} <span className="text-sm text-muted-foreground font-normal">AUDD</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Created {new Date(escrow.created_at).toLocaleDateString()}
            {days && ` · ${days}`}
          </p>
        </div>

        {/* Progress */}
        <div className="glass-card p-4">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all"
              style={{ width: `${stageProgress(escrow.status)}%` }}
            />
          </div>
        </div>

        {/* Parties */}
        <div className="glass-card p-4 space-y-3">
          <PartyRow label="Payer" value={escrow.payer_wallet} />
          <PartyRow label="Receiver" value={escrow.receiver_wallet} />
        </div>

        {/* Milestones */}
        {milestones.length > 0 && (
          <div className="glass-card p-4">
            <p className="text-sm font-semibold text-foreground mb-3">Milestones</p>
            <div className="space-y-2.5">
              {milestones.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  {m.approved ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{m.title}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{Number(m.amount_audd).toLocaleString()}</span>
                  {!m.approved && isReleasable && (
                    <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => onApproveMilestone(m)} disabled={actionLoading}>
                      Approve
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity */}
        {events.length > 0 && (
          <div className="glass-card p-4">
            <p className="text-sm font-semibold text-foreground mb-3">Transaction Activity</p>
            <div className="space-y-3">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground capitalize">{ev.event_type.replace("_", " ")}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</p>
                  </div>
                  {ev.tx_signature && (
                    <a href={explorerTxUrl(ev.tx_signature)} target="_blank" rel="noreferrer" className="text-primary shrink-0">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 mt-6 space-y-2">
        {isReleasable && escrow.condition_type === "approval" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="w-full gap-1.5" disabled={actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve Release
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Release {Number(escrow.amount_audd).toLocaleString()} AUDD?</AlertDialogTitle>
                <AlertDialogDescription>
                  This signs an on-chain SPL transfer from the vault to the receiver. Irreversible once confirmed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRelease}>Confirm release</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {isDisputable && !disputeId && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full gap-1.5 text-destructive border-destructive/30">
                <AlertTriangle className="h-4 w-4" /> Raise Dispute
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Raise a dispute</AlertDialogTitle>
                <AlertDialogDescription>
                  Release will be paused until the dispute is resolved. Briefly explain the issue.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="Reason for dispute…" rows={3} />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDispute}>Submit dispute</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {disputeId && (
          <Button variant="outline" className="w-full" onClick={() => navigate(`/disputes/${disputeId}`)}>
            View dispute
          </Button>
        )}
      </div>
    </div>
  );
}

function PartyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-mono text-foreground">{shortAddr(value)}</span>
    </div>
  );
}
