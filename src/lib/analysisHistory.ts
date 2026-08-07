import { supabase } from "@/integrations/supabase/client";
import type { TokenAnalysis } from "./mockData";

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
    manipulation_score: Math.round(analysis.manipulationScore ?? 0),
    analysis_data: analysis as any,
  });

  if (error) console.error("Failed to record analysis:", error.message);
}
