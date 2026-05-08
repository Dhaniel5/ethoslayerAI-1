// Watchlist — persisted in Supabase for authenticated users
import { supabase } from "@/integrations/supabase/client";

export interface WatchlistEntry {
  mint: string;
  name: string;
  symbol: string;
  integrityScore: number;
  previousScore: number | null;
  lastUpdated: string;
}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("watchlist")
    .select("*")
    .eq("user_id", user.id)
    .order("last_updated", { ascending: false });
  if (error || !data) return [];
  return data.map((r: any) => ({
    mint: r.mint_address,
    name: r.token_name ?? "",
    symbol: r.token_symbol ?? "",
    integrityScore: r.integrity_score ?? 0,
    previousScore: r.previous_score ?? null,
    lastUpdated: r.last_updated,
  }));
}

export async function saveToWatchlist(entry: {
  mint: string; name: string; symbol: string; integrityScore: number;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("watchlist")
    .select("integrity_score")
    .eq("user_id", user.id)
    .eq("mint_address", entry.mint)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("watchlist")
      .update({
        token_name: entry.name,
        token_symbol: entry.symbol,
        integrity_score: entry.integrityScore,
        last_updated: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("mint_address", entry.mint);
  } else {
    await supabase.from("watchlist").insert({
      user_id: user.id,
      mint_address: entry.mint,
      token_name: entry.name,
      token_symbol: entry.symbol,
      integrity_score: entry.integrityScore,
    });
  }
}

export async function removeFromWatchlist(mint: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("watchlist")
    .delete()
    .eq("user_id", user.id)
    .eq("mint_address", mint);
}

export async function isInWatchlist(mint: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("watchlist")
    .select("id")
    .eq("user_id", user.id)
    .eq("mint_address", mint)
    .maybeSingle();
  return !!data;
}
