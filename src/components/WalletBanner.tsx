import { motion } from "framer-motion";
import { Wallet } from "lucide-react";
import WalletConnectButton from "@/components/WalletConnectButton";
import { useWallet } from "@solana/wallet-adapter-react";
import { explorerAddrUrl } from "@/lib/solanaConfig";

const WalletBanner = () => {
  const { publicKey } = useWallet();

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
        <h4 className="font-display font-semibold text-foreground">
          {publicKey ? "Wallet connected" : "Connect Your Wallet"}
        </h4>
        <p className="text-sm text-muted-foreground">
          {publicKey ? (
            <>
              Signed in as{" "}
              <a
                href={explorerAddrUrl(publicKey.toBase58())}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-primary hover:underline"
              >
                {publicKey.toBase58().slice(0, 8)}…{publicKey.toBase58().slice(-4)}
              </a>
              . You can now create AUDD escrows.
            </>
          ) : (
            "Analyze your portfolio integrity and create AUDD settlement contracts on Solana."
          )}
        </p>
      </div>
      <WalletConnectButton size="default" variant="default" />
    </motion.div>
  );
};

export default WalletBanner;
