import type { TokenAnalysis } from "./mockData";
import { supabase } from "@/integrations/supabase/client";

export async function fetchTokenAnalysis(mintAddress: string): Promise<TokenAnalysis> {
  const { data, error } = await supabase.functions.invoke('solana-rpc', {
    body: { mintAddress },
  });

  if (error) {
    console.error("Edge function error:", error);
    throw new Error(error.message || "Failed to analyze token");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as TokenAnalysis;
}
