import { supabase } from "@/integrations/supabase/client";
import type { TokenAnalysis } from "./mockData";

export interface AnalysisHistoryEntry {
  id: string;
  mint_address: string;
  token_name: string | null;
  token_symbol: string | null;
  integrity_score: number | null;
  governance_score: number | null;
  manipulation_score: number | null;
  analyzed_at: string;
}

export async function recordAnalysis(analysis: TokenAnalysis) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("analysis_history").insert({
    user_id: user.id,
    mint_address: analysis.mint,
    token_name: analysis.name ?? null,
    token_symbol: analysis.symbol ?? null,
    integrity_score: Math.round(analysis.integrityScore ?? 0),
    governance_score: Math.round(analysis.governanceScore ?? 0),
    manipulation_score:
      analysis.manipulationRisk === "High" ? 80 : analysis.manipulationRisk === "Moderate" ? 50 : 20,
    analysis_data: analysis as any,
  });

  if (error) console.error("Failed to record analysis:", error.message);
}

/** Every scan the current user has run, most recent first. Real data from `analysis_history`. */
export async function listAnalysisHistory(limit = 50): Promise<AnalysisHistoryEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("analysis_history")
    .select("id, mint_address, token_name, token_symbol, integrity_score, governance_score, manipulation_score, analyzed_at")
    .eq("user_id", user.id)
    .order("analyzed_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("Failed to load analysis history:", error.message); return []; }
  return data ?? [];
}
