// Watchlist — persisted in localStorage

export interface WatchlistEntry {
  mint: string;
  name: string;
  symbol: string;
  integrityScore: number;
  previousScore: number | null;
  lastUpdated: string; // ISO
}

const KEY = "ethoslayer_watchlist";

export function getWatchlist(): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveToWatchlist(entry: Omit<WatchlistEntry, "previousScore" | "lastUpdated">) {
  const list = getWatchlist();
  const existing = list.find((e) => e.mint === entry.mint);
  if (existing) {
    existing.previousScore = existing.integrityScore;
    existing.integrityScore = entry.integrityScore;
    existing.name = entry.name;
    existing.symbol = entry.symbol;
    existing.lastUpdated = new Date().toISOString();
  } else {
    list.push({ ...entry, previousScore: null, lastUpdated: new Date().toISOString() });
  }
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function removeFromWatchlist(mint: string) {
  const list = getWatchlist().filter((e) => e.mint !== mint);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function isInWatchlist(mint: string): boolean {
  return getWatchlist().some((e) => e.mint === mint);
}
