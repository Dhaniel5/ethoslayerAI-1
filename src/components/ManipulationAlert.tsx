import { motion } from "framer-motion";
import { AlertTriangle, TrendingUp, Users, MessageSquare } from "lucide-react";

interface ManipulationAlertProps {
  risk: "Low" | "Moderate" | "High";
  insights: string[];
}

const riskConfig = {
  Low: { color: "text-healthy", bg: "bg-healthy/10 border-healthy/30", icon: "🟢" },
  Moderate: { color: "text-moderate", bg: "bg-moderate/10 border-moderate/30", icon: "🟡" },
  High: { color: "text-danger", bg: "bg-danger/10 border-danger/30", icon: "🔴" },
};

const insightIcons = [Users, TrendingUp, MessageSquare];

const ManipulationAlert = ({ risk, insights }: ManipulationAlertProps) => {
  const config = riskConfig[risk];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className={`glass-card p-6 border ${config.bg}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <AlertTriangle className={`h-5 w-5 ${config.color}`} />
        <h3 className="font-display text-lg font-semibold">Manipulation Detection</h3>
        <span className={`ml-auto text-sm font-semibold ${config.color}`}>
          {config.icon} {risk} Risk
        </span>
      </div>

      <div className="space-y-3">
        {insights.map((insight, i) => {
          const Icon = insightIcons[i % insightIcons.length];
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.15 }}
              className="flex items-start gap-3 text-sm text-muted-foreground"
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0 text-foreground/40" />
              <span>{insight}</span>
            </motion.div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground/60 mt-4 italic">
        Detection powered by on-chain clustering analysis. AI enhancement coming soon.
      </p>
    </motion.div>
  );
};

export default ManipulationAlert;
