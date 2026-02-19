import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScoreGauge from "@/components/ScoreGauge";
import MetricCard from "@/components/MetricCard";
import ManipulationAlert from "@/components/ManipulationAlert";
import WalletBanner from "@/components/WalletBanner";
import { DEMO_TOKEN, type TokenAnalysis } from "@/lib/mockData";

const AnalyzePage = () => {
  const [searchParams] = useSearchParams();
  const [mintAddress, setMintAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<TokenAnalysis | null>(null);

  useEffect(() => {
    if (searchParams.get("demo") === "true") {
      setMintAddress(DEMO_TOKEN.mint);
      runAnalysis(DEMO_TOKEN.mint);
    }
  }, [searchParams]);

  const runAnalysis = async (address?: string) => {
    const addr = address || mintAddress;
    if (!addr.trim()) return;
    setLoading(true);
    setAnalysis(null);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 2000));
    setAnalysis({ ...DEMO_TOKEN, mint: addr });
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-4xl">
          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <h1 className="font-display text-2xl font-bold mb-2">Token Integrity Scan</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Enter a Solana token mint address to analyze its ethical profile.
            </p>

            <div className="flex gap-3">
              <Input
                placeholder="Enter Solana Token Mint Address"
                value={mintAddress}
                onChange={(e) => setMintAddress(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground/50 font-mono text-sm"
                onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
              />
              <Button
                onClick={() => runAnalysis()}
                disabled={loading || !mintAddress.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 shrink-0"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Analyze
              </Button>
            </div>
          </motion.div>

          {/* Loading */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-20"
              >
                <div className="h-16 w-16 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-4" />
                <p className="text-muted-foreground text-sm">Analyzing on-chain data...</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results */}
          <AnimatePresence>
            {analysis && !loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-10"
              >
                {/* Token header */}
                <div className="glass-card p-6 flex flex-col sm:flex-row items-center gap-6">
                  <div className="flex-1 text-center sm:text-left">
                    <h2 className="font-display text-xl font-bold">{analysis.name}</h2>
                    <p className="text-sm text-muted-foreground font-mono">{analysis.symbol}</p>
                    <p className="text-xs text-muted-foreground/60 font-mono mt-1 break-all">{analysis.mint}</p>
                  </div>
                  <div className="flex gap-8">
                    <ScoreGauge score={analysis.integrityScore} label="Integrity" />
                    <ScoreGauge score={analysis.governanceScore} label="Governance" />
                  </div>
                </div>

                {/* Token Integrity Metrics */}
                <section>
                  <h3 className="font-display text-lg font-semibold mb-4">Token Integrity Metrics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysis.metrics.map((m, i) => (
                      <MetricCard key={m.label} metric={m} index={i} />
                    ))}
                  </div>
                </section>

                {/* Governance Health */}
                <section>
                  <h3 className="font-display text-lg font-semibold mb-4">Governance Health</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysis.governanceMetrics.map((m, i) => (
                      <MetricCard key={m.label} metric={m} index={i} />
                    ))}
                  </div>
                </section>

                {/* Manipulation Detection */}
                <ManipulationAlert
                  risk={analysis.manipulationRisk}
                  insights={analysis.manipulationInsights}
                />

                {/* Wallet Banner */}
                <WalletBanner />

                {/* AI Placeholders */}
                <div className="glass-card p-6 border border-dashed border-border/60">
                  <p className="text-xs text-muted-foreground/50 font-mono text-center">
                    {/* TODO: Wallet behavior AI • Social sentiment AI • DAO voting assistant • Pump detection */}
                    AI-powered deep analysis modules — coming soon
                  </p>
                </div>
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
