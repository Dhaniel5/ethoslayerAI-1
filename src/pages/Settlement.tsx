import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Plus, Shield, History, ArrowRight, Coins, Wallet, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listEscrows, shortAddr, type EscrowRow } from "@/lib/escrow";
import { StatusBadge, TrustBadge } from "@/components/escrow/StatusBadges";
import CreateEscrowDialog from "@/components/escrow/CreateEscrowDialog";

export default function Settlement() {
  const navigate = useNavigate();
  const [escrows, setEscrows] = useState<EscrowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try { setEscrows(await listEscrows()); } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const totals = {
    active: escrows.filter((e) => ["locked", "pending", "in_review"].includes(e.status)).length,
    locked: escrows
      .filter((e) => ["locked", "in_review"].includes(e.status))
      .reduce((s, e) => s + Number(e.amount_audd), 0),
    released: escrows
      .filter((e) => e.status === "released")
      .reduce((s, e) => s + Number(e.amount_audd), 0),
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-start justify-between flex-wrap gap-4 mb-2">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Shield className="h-6 w-6 text-primary" />
                  <h1 className="font-display text-2xl font-bold">Settlement &amp; Escrow</h1>
                </div>
                <p className="text-sm text-muted-foreground max-w-xl">
                  Programmable AUDD escrow on Solana, coordinated by EthosLayer's trust intelligence.
                  Funds are locked in contract — not custodied by us.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate("/settlement/history")} className="gap-1.5">
                  <History className="h-4 w-4" /> History
                </Button>
                <Button onClick={() => setOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" /> New Escrow
                </Button>
              </div>
            </div>
          </motion.div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 mb-6">
            <StatCard icon={<Wallet className="h-4 w-4" />} label="Active escrows" value={totals.active.toString()} />
            <StatCard icon={<Coins className="h-4 w-4" />} label="AUDD locked" value={totals.locked.toLocaleString()} />
            <StatCard icon={<Coins className="h-4 w-4" />} label="AUDD released" value={totals.released.toLocaleString()} />
          </div>

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : escrows.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-10 text-center">
                <Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-4">No escrows yet. Create your first AUDD settlement contract.</p>
                <Button onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Create Escrow</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {escrows.map((e, i) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => navigate(`/settlement/${e.id}`)}
                  className="glass-card p-4 flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-display font-semibold">
                        {Number(e.amount_audd).toLocaleString()} AUDD
                      </span>
                      <StatusBadge status={e.status} />
                      {e.trust_level && <TrustBadge level={e.trust_level} score={e.trust_score ?? undefined} />}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {shortAddr(e.payer_wallet)} → {shortAddr(e.receiver_wallet)}
                    </p>
                    {e.description && (
                      <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">{e.description}</p>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />

      <CreateEscrowDialog open={open} onOpenChange={setOpen} onCreated={refresh} />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">{icon}{label}</div>
      <p className="font-display text-xl font-bold">{value}</p>
    </div>
  );
}
