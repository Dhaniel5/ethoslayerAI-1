import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, ShieldCheck, CheckCircle2, AlertTriangle, Loader2, X, Copy, Clock, ExternalLink,
} from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  approveMilestone, disputeEscrow, getEscrow, releaseEscrow, releaseViaCustodialVault,
  type EscrowRow, type MilestoneRow, type EventRow, shortAddr,
} from "@/lib/escrow";
import { explorerTxUrl, ESCROW_VAULT_ADDRESS } from "@/lib/solanaConfig";
import { StatusBadge, TrustBadge } from "@/components/escrow/StatusBadges";
import { useToast } from "@/hooks/use-toast";

export default function EscrowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const [escrow, setEscrow] = useState<EscrowRow | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [disputeReason, setDisputeReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const isVaultConnected =
    connected && publicKey?.toBase58() === ESCROW_VAULT_ADDRESS;

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await getEscrow(id);
      setEscrow(r.escrow); setMilestones(r.milestones); setEvents(r.events);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!escrow) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 pt-24 pb-16 container mx-auto px-6 max-w-3xl">
          <p>Escrow not found.</p>
          <Button onClick={() => navigate("/settlement")} className="mt-4">Back</Button>
        </main>
      </div>
    );
  }

  const requireVaultSigner = () => {
    if (!isVaultConnected || !publicKey || !signTransaction) {
      throw new Error(`Connect the vault wallet (${shortAddr(ESCROW_VAULT_ADDRESS)}) to sign.`);
    }
    return { connection, signer: { publicKey, signTransaction } };
  };

  const handleRelease = async () => {
    setActionLoading(true);
    try {
      const chain = requireVaultSigner();
      await releaseEscrow(escrow.id, Number(escrow.amount_audd), escrow.receiver_wallet, chain);
      toast({ title: "Funds released", description: "AUDD transferred on-chain to the receiver." });
      load();
    } catch (e: any) {
      toast({ title: "Release failed", description: e.message, variant: "destructive" });
    } finally { setActionLoading(false); }
  };
  const handleApproveMilestone = async (m: MilestoneRow) => {
    setActionLoading(true);
    try {
      const chain = requireVaultSigner();
      await approveMilestone(escrow.id, m.id, escrow.receiver_wallet, chain);
      toast({ title: "Milestone approved", description: `${m.amount_audd} AUDD released on-chain.` });
      load();
    } catch (e: any) {
      toast({ title: "Approval failed", description: e.message, variant: "destructive" });
    } finally { setActionLoading(false); }
  };
  const handleDispute = async () => {
    try {
      await disputeEscrow(escrow.id, disputeReason || "No reason provided");
      toast({ title: "Dispute raised", description: "Release is paused pending resolution." });
      setDisputeReason("");
      load();
    } catch (e: any) {
      toast({ title: "Dispute failed", description: e.message, variant: "destructive" });
    }
  };

  const isReleasable = escrow.status === "locked" || escrow.status === "in_review";
  const isDisputable = ["locked", "in_review", "pending"].includes(escrow.status);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-4xl">
          <Button variant="ghost" size="sm" onClick={() => navigate("/settlement")} className="mb-4 gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="glass-card">
              <CardContent className="p-6">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Escrow amount</p>
                    <p className="font-display text-3xl font-bold">
                      {Number(escrow.amount_audd).toLocaleString()} <span className="text-base text-muted-foreground">AUDD</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={escrow.status} />
                    {escrow.trust_level && <TrustBadge level={escrow.trust_level} score={escrow.trust_score ?? undefined} />}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <WalletRow label="Payer" value={escrow.payer_wallet} />
                  <WalletRow label="Receiver" value={escrow.receiver_wallet} />
                </div>

                {escrow.description && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">Agreement</p>
                    <p className="text-sm">{escrow.description}</p>
                  </div>
                )}

                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Created {new Date(escrow.created_at).toLocaleString()}</span>
                  {escrow.expires_at && <span>Expires {new Date(escrow.expires_at).toLocaleDateString()}</span>}
                </div>

                {/* Actions */}
                <div className="mt-6 space-y-2">
                  {isReleasable && !isVaultConnected && (
                    <p className="text-xs text-amber-300">
                      Release requires the vault wallet ({shortAddr(ESCROW_VAULT_ADDRESS)}). Connect it via the wallet button to release funds.
                    </p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {isReleasable && escrow.condition_type === "approval" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button className="gap-1.5" disabled={!isVaultConnected || actionLoading}>
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
                            <AlertDialogAction onClick={handleRelease}>Confirm release</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    {isDisputable && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
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
                            <AlertDialogAction onClick={handleDispute}>Submit dispute</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Milestones */}
          {milestones.length > 0 && (
            <Card className="glass-card mt-6">
              <CardContent className="p-6">
                <p className="font-display font-semibold mb-4">Milestones</p>
                <div className="space-y-2">
                  {milestones.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                      {m.approved ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{m.title}</p>
                        <p className="text-xs text-muted-foreground">{Number(m.amount_audd).toLocaleString()} AUDD</p>
                      </div>
                      {!m.approved && isReleasable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApproveMilestone(m)}
                          disabled={!isVaultConnected || actionLoading}
                        >
                          Approve &amp; release
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Trust factors */}
          {Array.isArray(escrow.trust_factors) && escrow.trust_factors.length > 0 && (
            <Card className="glass-card mt-6">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <p className="font-display font-semibold">EthosLayer AI Trust Analysis</p>
                </div>
                <div className="space-y-1.5">
                  {escrow.trust_factors.map((f: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      {f.impact === "positive" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                      ) : f.impact === "negative" ? (
                        <X className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                      ) : (
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground mt-1.5 ml-1 shrink-0" />
                      )}
                      <div>
                        <span className="font-medium">{f.label}.</span>{" "}
                        <span className="text-muted-foreground">{f.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card className="glass-card mt-6">
            <CardContent className="p-6">
              <p className="font-display font-semibold mb-4">Activity</p>
              <div className="space-y-3">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-3 text-sm">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <p className="capitalize font-medium">{ev.event_type.replace("_", " ")}
                        {ev.amount_audd && <span className="text-muted-foreground ml-1">· {Number(ev.amount_audd).toLocaleString()} AUDD</span>}
                      </p>
                      {ev.note && <p className="text-xs text-muted-foreground">{ev.note}</p>}
                      {ev.tx_signature && (
                        <a
                          href={explorerTxUrl(ev.tx_signature)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary/80 hover:text-primary font-mono inline-flex items-center gap-1 mt-0.5"
                        >
                          <ExternalLink className="h-3 w-3" />
                          tx {ev.tx_signature.slice(0, 8)}…{ev.tx_signature.slice(-6)}
                        </a>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{new Date(ev.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function WalletRow({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs truncate">{shortAddr(value)}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(value); toast({ title: "Copied" }); }}
          className="text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
