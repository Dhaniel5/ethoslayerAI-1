import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, History as HistoryIcon, Loader2, ExternalLink } from "lucide-react";
import { listAllEvents, shortAddr, type EscrowRow, type EventRow } from "@/lib/escrow";
import { explorerTxUrl } from "@/lib/solanaConfig";
import { StatusBadge } from "@/components/escrow/StatusBadges";

const MobileTransactionHistory = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<(EventRow & { escrow: EscrowRow })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAllEvents().then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="flex items-center gap-3 px-5 pt-6 pb-2">
        <button type="button" onClick={() => navigate("/settlement")} aria-label="Back"
          className="h-9 w-9 rounded-full glass-card flex items-center justify-center text-foreground/80">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-lg font-bold text-foreground">Transaction History</h1>
      </div>
      <p className="px-5 text-sm text-muted-foreground pb-5">
        Every escrow lock, release, milestone approval, and dispute event on Solana.
      </p>

      <div className="px-5">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <HistoryIcon className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((r, i) => (
              <motion.button
                key={r.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => navigate(`/settlement/${r.escrow_id}`)}
                className="w-full text-left glass-card p-4 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-foreground capitalize">{r.event_type.replace("_", " ")}</span>
                  <StatusBadge status={r.escrow.status} />
                </div>
                {r.amount_audd && (
                  <p className="text-sm text-foreground font-display font-medium">{Number(r.amount_audd).toLocaleString()} AUDD</p>
                )}
                <p className="text-[11px] text-muted-foreground font-mono truncate mt-1">
                  {shortAddr(r.escrow.payer_wallet)} → {shortAddr(r.escrow.receiver_wallet)}
                </p>
                <div className="flex items-center justify-between mt-1.5">
                  {r.tx_signature ? (
                    <a
                      href={explorerTxUrl(r.tx_signature)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] text-primary inline-flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {r.tx_signature.slice(0, 6)}…{r.tx_signature.slice(-4)}
                    </a>
                  ) : <span />}
                  <span className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileTransactionHistory;
