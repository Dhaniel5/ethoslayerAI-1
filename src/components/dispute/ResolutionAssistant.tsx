import { useState } from "react";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Analysis {
  summary: string;
  keyFacts: string[];
  obligations: string[];
  evidenceSummary: string;
  options: string[];
}

export default function ResolutionAssistant({ disputeId }: { disputeId: string }) {
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("dispute-assistant", {
        body: { dispute_id: disputeId },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error && !(data as any)?.analysis) throw new Error((data as any).error);
      setAnalysis((data as any).analysis as Analysis);
    } catch (e: any) {
      toast({ title: "Assistant unavailable", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold">Resolution Assistant</h3>
              <p className="text-xs text-muted-foreground">
                Neutral summary and fair options. It never picks a winner and never moves funds.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={run} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analysis ? "Refresh" : "Analyse dispute"}
          </Button>
        </div>

        {analysis && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">{analysis.summary}</p>

            {analysis.keyFacts?.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Key facts</p>
                <ul className="space-y-1 list-disc pl-5">
                  {analysis.keyFacts.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}

            {analysis.obligations?.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">What the agreement required</p>
                <ul className="space-y-1 list-disc pl-5">
                  {analysis.obligations.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}

            {analysis.evidenceSummary && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Evidence</p>
                <p className="text-muted-foreground">{analysis.evidenceSummary}</p>
              </div>
            )}

            {analysis.options?.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Possible fair outcomes</p>
                <ul className="space-y-1 list-disc pl-5">
                  {analysis.options.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Suggestions only — both parties must agree before anything is settled.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
