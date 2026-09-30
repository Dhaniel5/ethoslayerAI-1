import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { ArrowLeft, Wallet, ExternalLink, Copy, LogOut, Smartphone, MoreHorizontal } from "lucide-react";
import { explorerAddrUrl } from "@/lib/solanaConfig";
import { useToast } from "@/hooks/use-toast";
import { isNative } from "@/lib/native";
import { shortPubkey } from "@/components/WalletConnectButton";

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  if (isNative()) return true;
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent);
}

export default function WalletConnect() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { publicKey, disconnect, connecting, wallet, wallets, select, connect } = useWallet();
  const { setVisible } = useWalletModal();
  const [pendingWallet, setPendingWallet] = useState<WalletName | null>(null);

  const findWallet = useCallback(
    (name: string) =>
      wallets.find(
        (w) => w.adapter.name === name &&
          (w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable),
      ),
    [wallets],
  );

  const mobileWalletAdapter = wallets.find((w) => w.adapter.name.includes("Mobile Wallet Adapter"));

  useEffect(() => {
    if (!pendingWallet || !wallet || wallet.adapter.name !== pendingWallet || publicKey) return;
    let cancelled = false;
    connect()
      .catch((err) => {
        if (cancelled) return;
        toast({
          title: "Wallet connection failed",
          description: err instanceof Error ? err.message : "The wallet did not approve the connection.",
          variant: "destructive",
        });
      })
      .finally(() => { if (!cancelled) setPendingWallet(null); });
    return () => { cancelled = true; };
  }, [connect, pendingWallet, publicKey, toast, wallet]);

  const connectNamed = (name: string) => {
    const entry = wallets.find((w) => w.adapter.name === name);
    if (!entry) { setVisible(true); return; }
    const walletName = entry.adapter.name as WalletName;
    select(walletName);
    setPendingWallet(walletName);
  };

  const options = [
    { name: "Phantom", sub: "Most popular Solana wallet", available: Boolean(findWallet("Phantom")) || isMobileBrowser() },
    { name: "Solflare", sub: "Advanced features", available: Boolean(findWallet("Solflare")) || isMobileBrowser() },
  ];

  if (publicKey) {
    const addr = publicKey.toBase58();
    return (
      <div className="min-h-screen bg-background pb-6">
        <div className="flex items-center gap-3 px-5 pt-6 pb-4">
          <button type="button" onClick={() => navigate(-1)} aria-label="Back"
            className="h-9 w-9 rounded-full glass-card flex items-center justify-center text-foreground/80">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="font-display text-lg font-bold text-foreground">Wallet</h1>
        </div>

        <div className="px-5 space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
                <Wallet className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{wallet?.adapter.name}</p>
                <p className="text-xs font-mono text-muted-foreground truncate">{shortPubkey(addr)}</p>
              </div>
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <SettingsRow
              icon={Copy}
              label="Copy address"
              onClick={() => { navigator.clipboard.writeText(addr); toast({ title: "Address copied" }); }}
            />
            <SettingsRow icon={ExternalLink} label="View on Explorer" href={explorerAddrUrl(addr)} />
            <SettingsRow icon={LogOut} label="Disconnect" danger onClick={() => disconnect()} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="flex items-center gap-3 px-5 pt-6 pb-2">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back"
          className="h-9 w-9 rounded-full glass-card flex items-center justify-center text-foreground/80">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-lg font-bold text-foreground">Connect Wallet</h1>
      </div>
      <p className="px-5 text-sm text-muted-foreground pb-5">Choose your preferred wallet to continue.</p>

      <div className="px-5 space-y-3">
        {options.map((o, i) => (
          <motion.button
            key={o.name}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            disabled={connecting}
            onClick={() => connectNamed(o.name)}
            className="w-full glass-card p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Wallet className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{o.name}</p>
              <p className="text-xs text-muted-foreground">{o.sub}</p>
            </div>
          </motion.button>
        ))}

        {mobileWalletAdapter && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => connectNamed(mobileWalletAdapter.adapter.name)}
            className="w-full glass-card p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
          >
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Smartphone className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Mobile Wallet Adapter (Android)</p>
              <p className="text-xs text-muted-foreground">Connect to Seeker and supported wallets</p>
            </div>
          </motion.button>
        )}

        <motion.button
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={() => setVisible(true)}
          className="w-full glass-card p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
        >
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <MoreHorizontal className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">More wallets</p>
            <p className="text-xs text-muted-foreground">Any other Solana wallet installed on this device</p>
          </div>
        </motion.button>
      </div>
    </div>
  );
}

function SettingsRow({
  icon: Icon, label, onClick, href, danger,
}: { icon: typeof Wallet; label: string; onClick?: () => void; href?: string; danger?: boolean }) {
  const content = (
    <>
      <Icon className={`h-4 w-4 ${danger ? "text-destructive" : "text-muted-foreground"}`} />
      <span className={`flex-1 text-sm ${danger ? "text-destructive" : "text-foreground"}`}>{label}</span>
    </>
  );
  const cls = "w-full flex items-center gap-3 px-4 py-3.5 border-b border-border/50 last:border-b-0 active:bg-muted/40 transition-colors";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  );
}
