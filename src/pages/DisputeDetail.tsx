import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Gavel, Handshake, Loader2, Undo2, Wallet } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DisputeStatusBadge } from "@/components/dispute/DisputeStatusBadge";
import DisputeConversation from "@/components/dispute/DisputeConversation";
import DisputeEvidencePanel from "@/components/dispute/DisputeEvidencePanel";
import ResolutionAssistant from "@/components/dispute/ResolutionAssistant";
import ProposeResolutionDialog from "@/components/dispute/ProposeResolutionDialog";
import {
  escalateDispute, eventLabel, getDispute, isDisputeClosed, partyRole, respondToProposal,
  settleDispute, withdrawDispute, type DisputeBundle,
} from "@/lib/disputes";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function DisputeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<DisputeBundle | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);

  const load = async () => {
    if (!id) return;
    const [bundle, auth] = await Promise.all([getDispute(id), supabase.auth.getUser()]);
    setUserId(auth.data.user?.id ?? null);
    setData(bundle);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!data?.dispute) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 pt-24 container mx-auto px-6 max-w-3xl">
          <p>Dispute not found.</p>
          <Button className="mt-4" onClick={() => navigate("/disputes")}>Back to disputes</Button>
        </main>
      </div>
    );
  }

  const { dispute, escrow, messages, evidence, proposals, events } = data;
  const role = partyRole(escrow, userId);
  const closed = isDisputeClosed(dispute.status);
  const total = Number(escrow?.amount_audd ?? 0);
  const token = (escrow as any)?.token_label ?? "AUDD";
  const pending = proposals.find((p) => p.status === "pending");
  const accepted = proposals.find((p) => p.status === "accepted");
  const canSettle = dispute.status === "resolved" && !dispute.resolution_tx;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ title: ok }); await load(); }
    catch (e: any) { toast({ title: "Action failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-4xl space-y-5">
          <Button variant="ghost" size="sm" onClick={() => navigate("/disputes")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          <Card className="glass-card">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">{dispute.ref}</p>
                  <h1 className="text-xl font-bold">
                    {total.toLocaleString()} {token} in dispute
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">{dispute.reason}</p>
                </div>
                <DisputeStatusBadge status={dispute.status} size="lg" />
              </div>
              {escrow?.description && (
                <p className="text-sm text-muted-foreground border-t border-border/50 pt-3">{escrow.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                You are the {role === "buyer" ? "client / buyer" : role === "seller" ? "freelancer / seller" : "observer"} in this agreement.
                Funds stay locked in escrow until both parties agree.
              </p>
            </CardContent>
          </Card>

          {pending && (
            <Card className="glass-card border-primary/40">
              <CardContent className="p-6 space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Handshake className="h-4 w-4 text-primary" /> Proposed resolution
                </p>
                <p className="text-sm">
                  Buyer receives <strong>{Number(pending.amount_buyer).toLocaleString()} {token}</strong>,
                  seller receives <strong>{Number(pending.amount_seller).toLocaleString()} {token}</strong>.
                </p>
                {pending.note && <p className="text-sm text-muted-foreground">{pending.note}</p>}
                {role && pending.proposed_by_role !== role && !closed && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy}
                      onClick={() => act(() => respondToProposal(pending.id, "accept"), "Resolution accepted")}>
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy}
                      onClick={() => act(() => respondToProposal(pending.id, "reject"), "Resolution rejected")}>
                      Reject
                    </Button>
                  </div>
                )}
                {role && pending.proposed_by_role === role && (
                  <p className="text-xs text-muted-foreground">Waiting for the other party to respond.</p>
                )}
              </CardContent>
            </Card>
          )}

          {accepted && (
            <Card className="glass-card border-emerald-500/30">
              <CardContent className="p-6 space-y-3">
                <p className="text-sm font-semibold">Agreed outcome</p>
                <p className="text-sm">
                  Buyer {Number(accepted.amount_buyer).toLocaleString()} {token} · Seller{" "}
                  {Number(accepted.amount_seller).toLocaleString()} {token}
                </p>
                {canSettle && role && (
                  <Button size="sm" disabled={busy} className="gap-1.5"
                    onClick={() => act(() => settleDispute(dispute.id, dispute.escrow_id), "Settlement executed on-chain")}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Settle on-chain
                  </Button>
                )}
                {dispute.resolution_tx && (
                  <p className="text-xs text-muted-foreground break-all">Settled · {dispute.resolution_tx}</p>
                )}
              </CardContent>
            </Card>
          )}

          {!closed && role && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setProposeOpen(true)} className="gap-1.5">
                <Handshake className="h-4 w-4" /> Propose resolution
              </Button>
              {dispute.opened_by === userId && (
                <Button size="sm" variant="outline" disabled={busy} className="gap-1.5"
                  onClick={() => act(() => withdrawDispute(dispute.id), "Dispute withdrawn")}>
                  <Undo2 className="h-4 w-4" /> Withdraw dispute
                </Button>
              )}
              {dispute.status !== "escalated" && (
                <Button size="sm" variant="outline" disabled={busy} className="gap-1.5"
                  onClick={() => act(() => escalateDispute(dispute.id), "Dispute escalated for review")}>
                  <Gavel className="h-4 w-4" /> Escalate for review
                </Button>
              )}
            </div>
          )}

          <ResolutionAssistant disputeId={dispute.id} />

          <Card className="glass-card">
            <CardContent className="p-6">
              <Tabs defaultValue="messages">
                <TabsList className="mb-4">
                  <TabsTrigger value="messages">Conversation</TabsTrigger>
                  <TabsTrigger value="evidence">Evidence</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>
                <TabsContent value="messages">
                  <DisputeConversation
                    disputeId={dispute.id} messages={messages} role={role}
                    canPost={!!role && !closed} onSent={load}
                  />
                </TabsContent>
                <TabsContent value="evidence">
                  <DisputeEvidencePanel
                    disputeId={dispute.id} evidence={evidence} canSubmit={!!role && !closed} onAdded={load}
                  />
                </TabsContent>
                <TabsContent value="timeline">
                  {events.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No activity yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {events.map((ev) => (
                        <div key={ev.id} className="flex gap-3 text-sm">
                          <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                          <div>
                            <p className="font-medium">{eventLabel(ev.event_type)}</p>
                            {ev.note && <p className="text-muted-foreground">{ev.note}</p>}
                            <p className="text-[11px] text-muted-foreground/70">
                              {new Date(ev.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />

      <ProposeResolutionDialog
        open={proposeOpen} onOpenChange={setProposeOpen}
        disputeId={dispute.id} total={total} token={token} onDone={load}
      />
    </div>
  );
}
