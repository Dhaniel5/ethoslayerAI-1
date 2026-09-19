import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Scale, Loader2 } from "lucide-react";
import { DisputeStatusBadge } from "@/components/dispute/DisputeStatusBadge";
import { listDisputes, type DisputeRow } from "@/lib/disputes";
import type { EscrowRow } from "@/lib/escrow";

const MobileDisputesList = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<(DisputeRow & { escrow: EscrowRow })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDisputes().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back"
          className="h-9 w-9 rounded-full glass-card flex items-center justify-center text-foreground/80">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-lg font-bold text-foreground">Disputes</h1>
      </div>
      <p className="px-5 text-sm text-muted-foreground pb-5">Every dispute you're part of, as buyer or seller.</p>

      <div className="px-5">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <Scale className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No disputes. Escrows only enter dispute when a party raises an issue.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((d, i) => (
              <motion.button
                key={d.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/disputes/${d.id}`)}
                className="w-full text-left glass-card p-4 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{d.ref}</p>
                    <p className="text-sm text-muted-foreground line-clamp-1">{d.reason}</p>
                  </div>
                  <DisputeStatusBadge status={d.status} />
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  {Number(d.escrow?.amount_audd ?? 0).toLocaleString()} {(d.escrow as any)?.token_label ?? "AUDD"} ·
                  {" "}updated {new Date(d.last_activity_at).toLocaleDateString()}
                </p>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileDisputesList;
