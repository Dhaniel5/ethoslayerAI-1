import { motion } from "framer-motion";
import { AlertTriangle, Users } from "lucide-react";
import type { TokenAnalysis } from "@/lib/mockData";
import { cn } from "@/lib/utils";

interface Props {
  analysis: TokenAnalysis;
}

function parsePercent(val: string): number {
  const n = parseFloat(val.replace("%", ""));
  return isNaN(n) ? 0 : n;
}

const GovernanceHealthModule = ({ analysis }: Props) => {
  const topHolderMetric = analysis.governanceMetrics.find((m) =>
    m.label.toLowerCase().includes("dominance") || m.label.toLowerCase().includes("top holder")
  );
  const holderCountMetric = analysis.governanceMetrics.find((m) =>
    m.label.toLowerCase().includes("holder count") || m.label.toLowerCase().includes("holder")
  );

  const supplyMetric = analysis.metrics.find((m) =>
    m.label.toLowerCase().includes("supply concentration")
  );
  const top5Pct = supplyMetric ? parsePercent(supplyMetric.value) : 0;
  const topHolderPct = topHolderMetric ? parsePercent(topHolderMetric.value) : 0;

  const holders = [
    { label: "Largest Holder", pct: topHolderPct },
    { label: "Top 5 Holders", pct: top5Pct },
    { label: "Remaining Holders", pct: Math.max(0, 100 - top5Pct) },
  ];

  const highCapture = top5Pct > 60 || topHolderPct > 30;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        Governance Health Overview
      </h3>

      <div className="glass-card p-5 space-y-5">
        {/* Bar visualization */}
        <div className="space-y-3">
          {holders.map((h, i) => (
            <div key={h.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">{h.label}</span>
                <span className="font-mono text-foreground">{h.pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(h.pct, 100)}%` }}
                  transition={{ duration: 0.8, delay: i * 0.15 }}
                  className={cn(
                    "h-full rounded-full",
                    i === 0 ? "bg-danger" : i === 1 ? "bg-moderate" : "bg-healthy"
                  )}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Governance metrics summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground">Holder Count (Top 20)</p>
            <p className="font-display font-semibold text-foreground">
              {holderCountMetric?.value || "N/A"}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground">Governance Score</p>
            <p className="font-display font-semibold text-foreground">{analysis.governanceScore}/100</p>
          </div>
        </div>

        {/* Warning */}
        {highCapture && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start gap-3 p-3 rounded-lg bg-danger/10 border border-danger/30"
          >
            <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-danger">High governance capture risk</p>
              <p className="text-xs text-muted-foreground mt-1">
                A small number of wallets control a disproportionate share of the supply, 
                enabling them to dominate governance decisions and potentially act against 
                community interests.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </motion.section>
  );
};

export default GovernanceHealthModule;
