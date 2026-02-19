import { motion } from "framer-motion";
import { getScoreColor } from "@/lib/mockData";

interface ScoreGaugeProps {
  score: number;
  label: string;
  size?: number;
}

const ScoreGauge = ({ score, label, size = 160 }: ScoreGaugeProps) => {
  const color = getScoreColor(score);
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const colorMap = {
    healthy: "hsl(152, 70%, 50%)",
    moderate: "hsl(45, 90%, 55%)",
    danger: "hsl(0, 72%, 55%)",
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="transform -rotate-90" style={{ width: size, height: size }}>
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="hsl(222, 30%, 16%)"
            strokeWidth="8"
          />
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={colorMap[color]}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            style={{
              filter: `drop-shadow(0 0 8px ${colorMap[color]}40)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className={`font-display text-3xl font-bold ${
              color === "healthy" ? "text-healthy" : color === "moderate" ? "text-moderate" : "text-danger"
            }`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            {score}
          </motion.span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
};

export default ScoreGauge;
