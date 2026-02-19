import { useState } from "react";
import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

interface ValueToggle {
  id: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

const VALUES: ValueToggle[] = [
  {
    id: "centralized-control",
    label: "Avoid Centralized Token Control",
    description: "Flag tokens where top 5 wallets hold >50% of supply.",
    defaultEnabled: true,
  },
  {
    id: "mint-authority",
    label: "Require Revoked Mint Authority",
    description: "Warn when mint authority is still active and can inflate supply.",
    defaultEnabled: true,
  },
  {
    id: "liquidity-lock",
    label: "Require Liquidity Lock",
    description: "Flag tokens without locked or vested liquidity pools.",
    defaultEnabled: false,
  },
  {
    id: "distributed-governance",
    label: "Prefer Distributed Governance",
    description: "Warn when top 3 voters control >50% of voting power.",
    defaultEnabled: true,
  },
  {
    id: "upgradeable-contracts",
    label: "Avoid Upgradeable Contracts",
    description: "Flag tokens with active upgrade authority on their program.",
    defaultEnabled: false,
  },
];

const ValuesPage = () => {
  const [values, setValues] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(VALUES.map((v) => [v.id, v.defaultEnabled]))
  );

  const toggle = (id: string) => {
    setValues((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-display text-2xl font-bold">Ethos Preference Engine</h1>
              <span className="text-xs font-medium bg-secondary/20 text-secondary px-2 py-0.5 rounded-full">
                Beta
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-8">
              Customize your ethical criteria. Your preferences will dynamically adjust
              warnings and scores across all analyses.
            </p>

            <div className="space-y-4">
              {VALUES.map((v, i) => (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="glass-card p-5 flex items-center gap-4"
                >
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-foreground">{v.label}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{v.description}</p>
                  </div>
                  <Switch
                    checked={values[v.id]}
                    onCheckedChange={() => toggle(v.id)}
                  />
                </motion.div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground/50 mt-8 text-center">
              Preferences are stored locally. Cloud sync coming with wallet connection.
            </p>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ValuesPage;
