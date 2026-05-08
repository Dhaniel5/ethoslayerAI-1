import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Bookmark, ArrowUp, ArrowDown, Minus, Trash2, AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getWatchlist, removeFromWatchlist, type WatchlistEntry } from "@/lib/watchlist";
import { getScoreColor } from "@/lib/mockData";
import { cn } from "@/lib/utils";

const Watchlist = () => {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    getWatchlist().then(setEntries);
  }, []);

  const handleRemove = async (mint: string) => {
    await removeFromWatchlist(mint);
    setEntries(await getWatchlist());
  };

  const scoreDelta = (e: WatchlistEntry) => {
    if (e.previousScore === null) return null;
    return e.integrityScore - e.previousScore;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-3 mb-2">
              <Bookmark className="h-6 w-6 text-primary" />
              <h1 className="font-display text-2xl font-bold">Watchlist</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-8">
              Track tokens you care about. Scores update each time you re-analyze.
            </p>
          </motion.div>

          {entries.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-10 text-center">
              <Bookmark className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-sm mb-4">No tokens saved yet.</p>
              <Button onClick={() => navigate("/analyze")} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                <Search className="h-4 w-4" /> Analyze a Token
              </Button>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {entries.map((e, i) => {
                const delta = scoreDelta(e);
                const bigDrop = delta !== null && delta <= -15;
                const color = getScoreColor(e.integrityScore);

                return (
                  <motion.div
                    key={e.mint}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn("glass-card p-4 flex items-center gap-4", bigDrop && "border-danger/40")}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-foreground truncate">{e.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{e.symbol}</span>
                      </div>
                      <p className="text-xs text-muted-foreground/60 font-mono truncate">{e.mint}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Updated {new Date(e.lastUpdated).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-center">
                        <span className={cn("font-display text-xl font-bold", `text-${color}`)}>
                          {e.integrityScore}
                        </span>
                        {delta !== null && (
                          <div className={cn("flex items-center gap-0.5 text-xs justify-center", delta > 0 ? "text-healthy" : delta < 0 ? "text-danger" : "text-muted-foreground")}>
                            {delta > 0 ? <ArrowUp className="h-3 w-3" /> : delta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {Math.abs(delta)}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/analyze?mint=${e.mint}`)}
                          className="text-xs text-primary hover:text-primary/80"
                        >
                          Re-scan
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleRemove(e.mint)} className="text-muted-foreground hover:text-danger">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {bigDrop && (
                      <div className="absolute -top-1 -right-1">
                        <AlertTriangle className="h-4 w-4 text-danger" />
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {entries.some((e) => { const d = scoreDelta(e); return d !== null && d <= -15; }) && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-3 p-3 rounded-lg bg-danger/10 border border-danger/30">
                  <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
                  <p className="text-sm text-danger">
                    One or more tokens have had a significant integrity score decrease since your last check.
                  </p>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Watchlist;
