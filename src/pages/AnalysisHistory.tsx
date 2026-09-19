import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ScanSearch, Loader2 } from "lucide-react";
import { listAnalysisHistory, type AnalysisHistoryEntry } from "@/lib/analysisHistory";
import { getScoreColor } from "@/lib/mockData";
import { cn } from "@/lib/utils";

export default function AnalysisHistory() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AnalysisHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAnalysisHistory().then(setEntries).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="flex items-center gap-3 px-5 pt-6 pb-2">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back"
          className="h-9 w-9 rounded-full glass-card flex items-center justify-center text-foreground/80">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-lg font-bold text-foreground">Analysis History</h1>
      </div>
      <p className="px-5 text-sm text-muted-foreground pb-5">Every token scan you've run, most recent first.</p>

      <div className="px-5">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : entries.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <ScanSearch className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No scans yet.</p>
            <button type="button" onClick={() => navigate("/analyze")} className="text-xs font-medium text-primary">
              Analyze a token
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {entries.map((e, i) => {
              const color = getScoreColor(e.integrity_score ?? 0);
              return (
                <motion.button
                  key={e.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => navigate(`/analyze?mint=${e.mint_address}`)}
                  className="w-full text-left glass-card p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-foreground truncate">{e.token_name || "Unknown token"}</span>
                      {e.token_symbol && <span className="text-xs text-muted-foreground font-mono">{e.token_symbol}</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 font-mono truncate">{e.mint_address}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(e.analyzed_at).toLocaleString()}</p>
                  </div>
                  <span className={cn("font-display text-lg font-bold shrink-0", `text-${color}`)}>
                    {e.integrity_score ?? "—"}
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
