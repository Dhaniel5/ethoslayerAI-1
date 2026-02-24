import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScoreGauge from "@/components/ScoreGauge";
import MetricCard from "@/components/MetricCard";
import ManipulationAlert from "@/components/ManipulationAlert";
import WalletBanner from "@/components/WalletBanner";
import ScoreTransparencyPanel from "@/components/ScoreTransparencyPanel";
import GovernanceHealthModule from "@/components/GovernanceHealthModule";
import EthosAlignment from "@/components/EthosAlignment";
import EthosOnboardingModal from "@/components/EthosOnboardingModal";
import { DEMO_TOKEN, type TokenAnalysis } from "@/lib/mockData";
import { fetchTokenAnalysis } from "@/lib/solana";
import { getIntegrityBreakdown, getGovernanceBreakdown, getManipulationBreakdown } from "@/lib/scoreBreakdown";
import { saveToWatchlist, isInWatchlist } from "@/lib/watchlist";
import { useToast } from "@/hooks/use-toast";

const AnalyzePage = () => {
  const [searchParams] = useSearchParams();
  const [mintAddress, setMintAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<TokenAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const mint = searchParams.get("mint");
    if (mint) {
      setMintAddress(mint);
      runAnalysis(mint);
    } else if (searchParams.get("demo") === "true") {
      setMintAddress(DEMO_TOKEN.mint);
      runAnalysis(DEMO_TOKEN.mint);
    }
  }, [searchParams]);

  useEffect(() => {
    if (analysis) setSaved(isInWatchlist(analysis.mint));
  }, [analysis]);

  const runAnalysis = async (address?: string) => {
    const addr = address || mintAddress;
    if (!addr.trim()) return;
    setLoading(true);
    setAnalysis(null);
    setError(null);
    try {
      const result = await fetchTokenAnalysis(addr);
      setAnalysis(result);
    } catch (err: any) {
      console.error("Solana fetch error:", err);
      const message = err?.message?.includes("Invalid public key")
        ? "Invalid Solana mint address. Please check and try again."
        : "Failed to fetch token data. The address may not be a valid SPL token, or RPC rate limits may apply.";
      setError(message);
      toast({ title: "Analysis Failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!analysis) return;
    saveToWatchlist({ mint: analysis.mint, name: analysis.name, symbol: analysis.symbol, integrityScore: analysis.integrityScore });
    setSaved(true);
    toast({ title: "Saved to Watchlist", description: `${analysis.name} has been added to your watchlist.` });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <EthosOnboardingModal onComplete={() => {}} />

      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-4xl">
          {/* Search */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
            <h1 className="font-display text-2xl font-bold mb-2">Token Integrity Scan</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Enter a Solana token mint address to analyze its ethical profile.
            </p>
            <div className="flex gap-3">
              <input
                placeholder="Enter Solana Token Mint Address"
                value={mintAddress}
                onChange={(e) => setMintAddress(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
              />
              <Button onClick={() => runAnalysis()} disabled={loading || !mintAddress.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 shrink-0">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Analyze
              </Button>
            </div>
          </motion.div>

          {/* Loading */}
          <AnimatePresence>
            {loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-20">
                <div className="h-16 w-16 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-4" />
                <p className="text-muted-foreground text-sm">Analyzing on-chain data...</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          {error && !loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6 border border-danger/30 text-center">
              <p className="text-danger text-sm">{error}</p>
            </motion.div>
          )}

          {/* Results */}
          <AnimatePresence>
            {analysis && !loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
                {/* Token header */}
                <div className="glass-card p-6 flex flex-col sm:flex-row items-center gap-6">
                  <div className="flex-1 text-center sm:text-left">
                    <div className="flex items-center gap-3 justify-center sm:justify-start">
                      <h2 className="font-display text-xl font-bold">{analysis.name}</h2>
                      <Button size="sm" variant="ghost" onClick={handleSave} disabled={saved} className="shrink-0 gap-1 text-xs">
                        {saved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <Bookmark className="h-4 w-4" />}
                        {saved ? "Saved" : "Save"}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">{analysis.symbol}</p>
                    <p className="text-xs text-muted-foreground/60 font-mono mt-1 break-all">{analysis.mint}</p>
                  </div>
                  <div className="flex gap-8">
                    <ScoreGauge score={analysis.integrityScore} label="Integrity" />
                    <ScoreGauge score={analysis.governanceScore} label="Governance" />
                  </div>
                </div>

                {/* Score Transparency */}
                <ScoreTransparencyPanel
                  breakdowns={[
                    getIntegrityBreakdown(analysis),
                    getGovernanceBreakdown(analysis),
                    getManipulationBreakdown(analysis),
                  ]}
                />

                {/* Token Integrity Metrics */}
                <section>
                  <h3 className="font-display text-lg font-semibold mb-4">Token Integrity Metrics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysis.metrics.map((m, i) => (
                      <MetricCard key={m.label} metric={m} index={i} />
                    ))}
                  </div>
                </section>

                {/* Governance Health Module */}
                <GovernanceHealthModule analysis={analysis} />

                {/* Standard Governance Metrics */}
                <section>
                  <h3 className="font-display text-lg font-semibold mb-4">Governance Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysis.governanceMetrics.map((m, i) => (
                      <MetricCard key={m.label} metric={m} index={i} />
                    ))}
                  </div>
                </section>

                {/* Manipulation Detection */}
                <ManipulationAlert risk={analysis.manipulationRisk} insights={analysis.manipulationInsights} />

                {/* Ethos Alignment */}
                <EthosAlignment analysis={analysis} />

                {/* Wallet Banner */}
                <WalletBanner />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AnalyzePage;
