import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, ShieldCheck, Wallet, Calendar, Coins, CheckCircle2 } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import WalletConnectButton from "@/components/WalletConnectButton";
import TokenAnalysisCard from "@/components/escrow/TokenAnalysisCard";
import { StatusBadge, TrustBadge } from "@/components/escrow/StatusBadges";
import { getPublicEscrow, payeeAcceptEscrow, payeeRequestAudd, maskAddr, type PublicEscrow } from "@/lib/escrow";
import { useToast } from "@/hooks/use-toast";

export default function PublicEscrowView() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { publicKey, connected } = useWallet();
  const [escrow, setEscrow] = useState<PublicEscrow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setEscrow(await getPublicEscrow(id));
    } catch {
      setEscrow(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const accept = async () => {
    if (!id || !publicKey) return;
    setBusy(true);
    try {
      await payeeAcceptEscrow(id, publicKey.toBase58());
      toast({ title: "Escrow accepted", description: "The payer has been notified." });
      await load();
    } catch (e: any) {
      toast({ title: "Could not accept escrow", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const requestAudd = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await payeeRequestAudd(id);
      toast({ title: "AUDD requested", description: "The payer has been flagged for AUDD settlement." });
      await load();
    } catch (e: any) {
      toast({ title: "Could not send request", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-3xl">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !escrow ? (
            <Card className="glass-card"><CardContent className="p-10 text-center text-sm text-muted-foreground">
              This escrow link is invalid or has been removed.
            </CardContent></Card>
          ) : (
            <div className="space-y-5">
              <div className="glass-card p-5 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h1 className="font-display text-xl font-bold">Escrow Agreement</h1>
                  <StatusBadge status={escrow.status} />
                  {escrow.trust_level && <TrustBadge level={escrow.trust_level} score={escrow.trust_score ?? undefined} />}
                </div>
                {escrow.description ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{escrow.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No job description provided.</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <Info icon={<Wallet className="h-3.5 w-3.5" />} label="Payer wallet" value={maskAddr(escrow.payer_wallet)} mono />
                  <Info icon={<Coins className="h-3.5 w-3.5" />} label="Amount" value={`${Number(escrow.amount_audd).toLocaleString()} AUDD`} />
                  <Info
                    icon={<Coins className="h-3.5 w-3.5" />}
                    label="Token"
                    value={escrow.token_label || (escrow.token_mint ? maskAddr(escrow.token_mint) : "AUDD")}
                    mono={!escrow.token_label && !!escrow.token_mint}
                  />
                  <Info
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    label="Deadline"
                    value={escrow.expires_at ? new Date(escrow.expires_at).toLocaleDateString() : "No deadline"}
                  />
                </div>
              </div>

              {escrow.milestones.length > 0 && (
                <div className="glass-card p-5">
                  <p className="text-sm font-semibold mb-3">Milestones</p>
                  <div className="space-y-2">
                    {escrow.milestones.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs border-b border-border/40 pb-2 last:border-0">
                        <span className="flex items-center gap-2">
                          {m.approved && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                          {m.title}
                        </span>
                        <span className="font-mono">{Number(m.amount_audd).toLocaleString()} AUDD</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {escrow.ai_analysis && <TokenAnalysisCard analysis={escrow.ai_analysis} />}

              {(() => {
                const isOpen =
                  ["pending", "locked"].includes(escrow.status) &&
                  (!escrow.expires_at || new Date(escrow.expires_at) > new Date());
                const walletMismatch =
                  connected && publicKey
                    ? publicKey.toBase58() === escrow.payer_wallet
                      ? "This is the payer wallet — connect the receiver wallet to accept."
                      : escrow.receiver_wallet && publicKey.toBase58() !== escrow.receiver_wallet
                        ? "Connected wallet is not the receiver wallet specified by the payer."
                        : null
                    : null;

                return (
                  <div className="glass-card p-5 space-y-3">
                    {escrow.payee_accepted ? (
                      <p className="text-sm text-emerald-400 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Accepted by payee {escrow.payee_wallet ? `(${maskAddr(escrow.payee_wallet)})` : ""}
                      </p>
                    ) : !isOpen ? (
                      <p className="text-sm text-muted-foreground">
                        This escrow is no longer open for acceptance ({escrow.status}).
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          You only need to connect your wallet to accept. No registration or account required.
                        </p>
                        {walletMismatch && (
                          <p className="text-xs text-amber-400">{walletMismatch}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          {!connected ? (
                            <WalletConnectButton />
                          ) : (
                            <Button onClick={accept} disabled={busy || !!walletMismatch} className="gap-1.5">
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              Accept Escrow
                            </Button>
                          )}
                          <Button variant="outline" onClick={requestAudd} disabled={busy || escrow.payee_requested_audd}>
                            {escrow.payee_requested_audd ? "AUDD requested" : "Request AUDD instead"}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Info({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">{icon}{label}</div>
      <p className={`text-sm ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</p>
    </div>
  );
}
