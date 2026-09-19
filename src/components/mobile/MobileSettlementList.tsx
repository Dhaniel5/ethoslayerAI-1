import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Shield, History, Scale, Loader2 } from "lucide-react";
import { listEscrows, shortAddr, type EscrowRow } from "@/lib/escrow";
import { StatusBadge, TrustBadge } from "@/components/escrow/StatusBadges";

const MobileSettlementList = () => {
  const navigate = useNavigate();
  const [escrows, setEscrows] = useState<EscrowRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setEscrows(await listEscrows()); } finally { setLoading(false); }
    })();
  }, []);

  const totals = {
    active: escrows.filter((e) => ["locked", "pending", "in_review"].includes(e.status)).length,
    locked: escrows.filter((e) => ["locked", "in_review"].includes(e.status)).reduce((s, e) => s + Number(e.amount_audd), 0),
    released: escrows.filter((e) => e.status === "released").reduce((s, e) => s + Number(e.amount_audd), 0),
  };

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="flex items-center justify-between px-5 pt-6 pb-4">
        <h1 className="font-display text-lg font-bold text-foreground">Agreements</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/disputes")}
            aria-label="Disputes"
            className="h-9 w-9 rounded-full glass-card flex items-center justify-center text-foreground/80"
          >
            <Scale className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/settlement/history")}
            aria-label="History"
            className="h-9 w-9 rounded-full glass-card flex items-center justify-center text-foreground/80"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/settlement/new")}
            aria-label="New escrow"
            className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-5">
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <StatCard label="Active" value={totals.active.toString()} />
          <StatCard label="Locked" value={totals.locked.toLocaleString()} />
          <StatCard label="Released" value={totals.released.toLocaleString()} />
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : escrows.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No agreements yet.</p>
            <button type="button" onClick={() => navigate("/settlement/new")} className="text-xs font-medium text-primary">
              Create your first escrow
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {escrows.map((e, i) => (
              <motion.button
                key={e.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/settlement/${e.id}`)}
                className="w-full text-left glass-card p-4 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-display font-semibold text-foreground">
                    {Number(e.amount_audd).toLocaleString()} AUDD
                  </span>
                  <StatusBadge status={e.status} />
                </div>
                {e.description && <p className="text-xs text-muted-foreground/90 line-clamp-1 mb-1">{e.description}</p>}
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {shortAddr(e.payer_wallet)} → {shortAddr(e.receiver_wallet)}
                  </p>
                  {e.trust_level && <TrustBadge level={e.trust_level} score={e.trust_score ?? undefined} />}
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-3">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className="font-display text-sm font-bold text-foreground truncate">{value}</p>
    </div>
  );
}

export default MobileSettlementList;
