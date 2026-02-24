import { motion } from "framer-motion";
import { Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import type { TokenAnalysis } from "@/lib/mockData";
import { ETHOS_VALUES, type EthosId, getEthosPrefs } from "@/lib/ethos";
import { cn } from "@/lib/utils";

interface AlignmentResult {
  ethosLabel: string;
  aligned: boolean;
  message: string;
}

function computeAlignment(analysis: TokenAnalysis): AlignmentResult[] {
  const prefs = getEthosPrefs();
  const active = ETHOS_VALUES.filter((v) => prefs[v.id]);
  if (active.length === 0) return [];

  const results: AlignmentResult[] = [];

  const supplyMetric = analysis.metrics.find((m) => m.label.toLowerCase().includes("supply concentration"));
  const mintMetric = analysis.metrics.find((m) => m.label.toLowerCase().includes("mint authority"));
  const freezeMetric = analysis.metrics.find((m) => m.label.toLowerCase().includes("freeze") || m.label.toLowerCase().includes("upgrade"));
  const metadataMetric = analysis.metrics.find((m) => m.label.toLowerCase().includes("metadata"));

  for (const v of active) {
    switch (v.id as EthosId) {
      case "decentralization": {
        const concentrated = supplyMetric?.status === "danger";
        results.push({
          ethosLabel: v.label,
          aligned: !concentrated,
          message: concentrated
            ? "This token conflicts with your preference for decentralization due to concentrated supply ownership."
            : "Token supply distribution aligns with your decentralization values.",
        });
        break;
      }
      case "transparency": {
        const transparent = metadataMetric?.status === "healthy";
        results.push({
          ethosLabel: v.label,
          aligned: !!transparent,
          message: transparent
            ? "Aligned with your transparency preference — full metadata is available on-chain."
            : "Limited metadata transparency may conflict with your values.",
        });
        break;
      }
      case "fair-distribution": {
        const fair = supplyMetric?.status === "healthy";
        results.push({
          ethosLabel: v.label,
          aligned: !!fair,
          message: fair
            ? "Supply distribution is balanced, aligning with fair distribution values."
            : "Supply is unevenly distributed, which may conflict with your fair distribution preference.",
        });
        break;
      }
      case "active-governance": {
        const good = analysis.governanceScore >= 60;
        results.push({
          ethosLabel: v.label,
          aligned: good,
          message: good
            ? "Governance health score suggests active participation, aligning with your values."
            : "Low governance activity may conflict with your preference for active governance.",
        });
        break;
      }
      case "long-term": {
        const mintSafe = mintMetric?.status === "healthy";
        const freezeSafe = freezeMetric?.status === "healthy";
        const sustainable = mintSafe && freezeSafe;
        results.push({
          ethosLabel: v.label,
          aligned: !!sustainable,
          message: sustainable
            ? "Revoked authorities and locked controls support long-term sustainability."
            : "Active mint or freeze authority may pose long-term sustainability concerns.",
        });
        break;
      }
    }
  }

  return results;
}

interface Props {
  analysis: TokenAnalysis;
}

const EthosAlignment = ({ analysis }: Props) => {
  const results = computeAlignment(analysis);
  if (results.length === 0) return null;

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-secondary" />
        Ethos Alignment
      </h3>

      <div className="space-y-2">
        {results.map((r, i) => (
          <motion.div
            key={r.ethosLabel}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className={cn(
              "glass-card p-4 flex items-start gap-3 border",
              r.aligned ? "border-healthy/30" : "border-moderate/30"
            )}
          >
            {r.aligned ? (
              <CheckCircle2 className="h-4 w-4 text-healthy mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-moderate mt-0.5 shrink-0" />
            )}
            <div>
              <span className={cn("text-xs font-semibold", r.aligned ? "text-healthy" : "text-moderate")}>
                {r.ethosLabel}
              </span>
              <p className="text-sm text-muted-foreground mt-0.5">{r.message}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
};

export default EthosAlignment;
