import { supabase } from "@/integrations/supabase/client";

export type RiskLevel = "Safe" | "Caution" | "High Risk";

export interface TokenAnalysis {
  riskLevel: RiskLevel;
  summary: string;
  details: string[];
  recommendation: string;
  token?: string;
  mint?: string;
}

export const INSUFFICIENT_ANALYSIS: TokenAnalysis = {
  riskLevel: "Caution",
  summary: "Insufficient data — proceed with caution.",
  details: ["No reliable market data was found for this token."],
  recommendation: "Verify the mint address independently before accepting this escrow.",
};

export const COMMON_TOKENS = [
  { label: "SOL", mint: "So11111111111111111111111111111111111111112" },
  { label: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { label: "AUDD (devnet test)", mint: "B9peANWbJrZvJhKY2T5iUY64iT41k7rsfF2BSeZMong6" },
];

export async function analyzeToken(mintAddress: string, label?: string): Promise<TokenAnalysis> {
  const { data, error } = await supabase.functions.invoke("analyze-token", {
    body: { mintAddress, label },
  });
  if (error) throw new Error(error.message || "Token analysis failed");
  const a = (data as any)?.analysis;
  if (!a || !a.summary) return { ...INSUFFICIENT_ANALYSIS, mint: mintAddress, token: label };
  return {
    riskLevel: (["Safe", "Caution", "High Risk"].includes(a.riskLevel) ? a.riskLevel : "Caution") as RiskLevel,
    summary: String(a.summary),
    details: Array.isArray(a.details) ? a.details.map(String).slice(0, 5) : [],
    recommendation: String(a.recommendation ?? ""),
    token: label,
    mint: mintAddress,
  };
}
