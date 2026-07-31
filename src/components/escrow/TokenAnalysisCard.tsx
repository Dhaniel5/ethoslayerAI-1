import { Loader2, Sparkles } from "lucide-react";
import type { TokenAnalysis } from "@/lib/tokenAnalysis";

const styles: Record<string, string> = {
  Safe: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Caution: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "High Risk": "bg-destructive/15 text-destructive border-destructive/30",
};

export default function TokenAnalysisCard({
  analysis,
  loading,
}: {
  analysis?: TokenAnalysis | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border p-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running AI token analysis…
      </div>
    );
  }
  if (!analysis) return null;

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">AI Token Risk Analysis</p>
        </div>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
            styles[analysis.riskLevel] ?? styles.Caution
          }`}
        >
          {analysis.riskLevel}
        </span>
      </div>

      <p className="text-sm font-bold">{analysis.summary}</p>

      {analysis.details.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          {analysis.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}

      {analysis.recommendation && (
        <p className="text-xs text-foreground/90">
          <span className="font-semibold">Recommendation: </span>
          {analysis.recommendation}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground/70">AI-generated analysis. Not financial advice.</p>
    </div>
  );
}
