import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Shield, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useState } from "react";
import type { ScoreBreakdown, ScoreComponent } from "@/lib/scoreBreakdown";
import { cn } from "@/lib/utils";

const statusConfig = {
  Safe: { icon: CheckCircle2, class: "text-healthy", bg: "bg-healthy/10 border-healthy/30" },
  Warning: { icon: AlertTriangle, class: "text-moderate", bg: "bg-moderate/10 border-moderate/30" },
  Risk: { icon: XCircle, class: "text-danger", bg: "bg-danger/10 border-danger/30" },
};

function ComponentRow({ comp, index }: { comp: ScoreComponent; index: number }) {
  const cfg = statusConfig[comp.status];
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn("flex items-start gap-3 p-3 rounded-lg border", cfg.bg)}
    >
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", cfg.class)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{comp.label}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn("text-xs font-semibold", cfg.class)}>{comp.status}</span>
            <span className="text-xs text-muted-foreground">({comp.weight}%)</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{comp.explanation}</p>
      </div>
    </motion.div>
  );
}

function BreakdownCard({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <div className="space-y-2">
      <h4 className="font-display text-sm font-semibold text-foreground mb-3">
        {breakdown.label}: <span className="gradient-text">{breakdown.total}</span>/100
      </h4>
      {breakdown.components.map((c, i) => (
        <ComponentRow key={c.label} comp={c} index={i} />
      ))}
    </div>
  );
}

interface Props {
  breakdowns: ScoreBreakdown[];
}

const ScoreTransparencyPanel = ({ breakdowns }: Props) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-display font-semibold text-foreground">How This Score Is Calculated</span>
        </div>
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-6 border-t border-border/50 pt-4">
              {breakdowns.map((b) => (
                <BreakdownCard key={b.label} breakdown={b} />
              ))}
              <p className="text-xs text-muted-foreground/50 text-center font-mono">
                Scores are derived from on-chain data. Weights are calibrated to ethical risk research.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ScoreTransparencyPanel;
