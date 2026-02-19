import { motion } from "framer-motion";
import { Wallet, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const WalletBanner = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1 }}
      className="glass-card glow-border p-6 flex flex-col sm:flex-row items-center gap-4"
    >
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Wallet className="h-6 w-6 text-primary" />
      </div>
      <div className="flex-1 text-center sm:text-left">
        <h4 className="font-display font-semibold text-foreground">Connect Your Wallet</h4>
        <p className="text-sm text-muted-foreground">
          Analyze your portfolio integrity and governance exposure across all holdings.
        </p>
      </div>
      <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 shrink-0">
        Connect Wallet
        <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  );
};

export default WalletBanner;
