import { motion } from "framer-motion";
import { BookOpen, Scale, Database, AlertCircle, Shield } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const sections = [
  {
    icon: Scale,
    title: "What EthosLayer Measures",
    content: `EthosLayer evaluates Solana tokens across three core dimensions:

**Token Integrity (0–100)** assesses the structural security of a token — including mint authority status, supply concentration, freeze authority, metadata availability, and contract upgradeability.

**Governance Health (0–100)** examines the distribution of power among token holders, detecting centralization risks such as dominant wallets, low holder counts, and absence of governance programs.

**Manipulation Risk (Low / Moderate / High)** identifies on-chain patterns associated with market manipulation, including wallet clustering, abnormal liquidity movements, and social sentiment anomalies.`,
  },
  {
    icon: BookOpen,
    title: "How Scores Are Weighted",
    content: `Each dimension is broken into weighted components:

**Token Integrity Score**
- Mint Authority Status — 25%
- Supply Concentration — 25%
- Upgrade / Freeze Authority — 20%
- Token Age & History — 15%
- Metadata Transparency — 15%

**Governance Health Score**
- Governance Program Detection — 30%
- Holder Distribution — 30%
- Top Holder Dominance — 25%
- Participation Rate — 15%

**Manipulation Risk Score**
- Wallet Clustering Analysis — 35%
- Liquidity Patterns — 30%
- Social Sentiment Correlation — 20%
- Volume Anomalies — 15%

Each component produces a status (Safe / Warning / Risk) and contributes proportionally to the overall score.`,
  },
  {
    icon: Database,
    title: "Data Sources",
    content: `All data is sourced directly from the Solana blockchain via RPC calls:

- **getAccountInfo** — Retrieves mint account data including authority status, decimals, and supply.
- **getTokenLargestAccounts** — Returns the top token holders for concentration analysis.
- **Helius DAS API** — Enriches token data with metadata (name, symbol, images).

EthosLayer does not rely on third-party scoring services. All analysis logic is transparent and runs on the data described above.

Social sentiment and DAO participation metrics are planned for future integration.`,
  },
  {
    icon: AlertCircle,
    title: "Limitations",
    content: `EthosLayer has the following known limitations:

- **Token Age** analysis is approximate and under active development.
- **Governance detection** currently checks for SPL Governance programs only; other governance frameworks may not be detected.
- **Large-cap tokens** (e.g., USDC, SOL) may have limited holder concentration data due to RPC response size limits.
- **Social sentiment** and **pump detection** modules are not yet active.
- **DAO voting data** requires integration with specific governance platforms and is not universally available.
- Scores reflect a snapshot at the time of analysis and may change as on-chain conditions evolve.`,
  },
  {
    icon: Shield,
    title: "Disclaimer",
    content: `**EthosLayer is not financial advice.**

The scores, ratings, and insights provided are for educational and informational purposes only. They are intended to promote transparency in the Web3 ecosystem and should not be interpreted as investment recommendations.

Users should always conduct their own research (DYOR) before participating in any token, protocol, or governance structure.

EthosLayer is a product of **Sphere Of Web3** and is committed to responsible, transparent analysis of blockchain data.`,
  },
];

const Methodology = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
            <h1 className="font-display text-3xl font-bold mb-2">Methodology</h1>
            <p className="text-muted-foreground">
              How EthosLayer evaluates token integrity, governance health, and manipulation risk.
            </p>
          </motion.div>

          <div className="space-y-8">
            {sections.map((s, i) => (
              <motion.article
                key={s.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="glass-card p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="font-display text-lg font-semibold">{s.title}</h2>
                </div>
                <div className="prose prose-sm prose-invert max-w-none text-muted-foreground leading-relaxed whitespace-pre-line text-sm">
                  {s.content.split(/\*\*(.*?)\*\*/g).map((part, j) =>
                    j % 2 === 1 ? (
                      <strong key={j} className="text-foreground font-medium">{part}</strong>
                    ) : (
                      <span key={j}>{part}</span>
                    )
                  )}
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Methodology;
