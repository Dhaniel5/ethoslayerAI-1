import { motion } from "framer-motion";
import { getStatusColor, getStatusBg, type TokenMetric } from "@/lib/mockData";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface MetricCardProps {
  metric: TokenMetric;
  index: number;
}

const statusIcons = {
  healthy: CheckCircle2,
  moderate: AlertTriangle,
  danger: XCircle,
};

const MetricCard = ({ metric, index }: MetricCardProps) => {
  const Icon = statusIcons[metric.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      className={`glass-card p-4 border ${getStatusBg(metric.status)}`}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-foreground">{metric.label}</h4>
        <Icon className={`h-4 w-4 ${getStatusColor(metric.status)}`} />
      </div>
      <p className={`text-lg font-display font-semibold ${getStatusColor(metric.status)}`}>
        {metric.value}
      </p>
      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
        {metric.description}
      </p>
    </motion.div>
  );
};

export default MetricCard;
