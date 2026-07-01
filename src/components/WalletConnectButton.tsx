import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { Wallet, LogOut, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { explorerAddrUrl } from "@/lib/solanaConfig";
import { useToast } from "@/hooks/use-toast";

export function shortPubkey(pk: string) {
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

interface Props {
  size?: "sm" | "default";
  variant?: "default" | "ghost" | "outline";
}

export default function WalletConnectButton({ size = "sm", variant = "outline" }: Props) {
  const { publicKey, disconnect, connecting, wallet, wallets, select, connect } = useWallet();
  const { setVisible } = useWalletModal();
  const { toast } = useToast();
  const [pendingWallet, setPendingWallet] = useState<WalletName | null>(null);

  const isMobile =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent);
  const hasPhantomExt =
    typeof window !== "undefined" && Boolean((window as any).phantom?.solana);
  const phantomWallet = wallets.find((w) => w.adapter.name === "Phantom");
  const phantomReady =
    hasPhantomExt ||
    phantomWallet?.readyState === WalletReadyState.Installed ||
    phantomWallet?.readyState === WalletReadyState.Loadable;

  useEffect(() => {
    if (!pendingWallet || !wallet || wallet.adapter.name !== pendingWallet || publicKey) return;

    let cancelled = false;
    connect()
      .catch((err) => {
        if (cancelled) return;
        toast({
          title: "Wallet connection failed",
          description: err instanceof Error ? err.message : "Phantom did not approve the connection.",
          variant: "destructive",
        });
        setVisible(true);
      })
      .finally(() => {
        if (!cancelled) setPendingWallet(null);
      });

    return () => {
      cancelled = true;
    };
  }, [connect, pendingWallet, publicKey, setVisible, toast, wallet]);

  const handleConnect = () => {
    // On mobile browsers without the Phantom in-app browser, deeplink into Phantom's
    // browser pre-loaded with the current URL — the wallet modal alone can't reach
    // a non-installed extension.
    if (isMobile && !hasPhantomExt) {
      const url = encodeURIComponent(window.location.href);
      const ref = encodeURIComponent(window.location.origin);
      window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
      return;
    }

    if (phantomReady) {
      const phantomName = "Phantom" as WalletName;
      select(phantomName);
      setPendingWallet(phantomName);
      return;
    }

    setVisible(true);
    toast({
      title: "Phantom not detected",
      description: "Install the Phantom browser extension, or open this site inside the Phantom mobile app browser.",
    });
  };

  if (!publicKey) {
    return (
      <Button
        size={size}
        variant={variant}
        onClick={handleConnect}
        disabled={connecting}
        className="gap-1.5"
      >
        <Wallet className="h-3.5 w-3.5" />
        {connecting ? "Connecting…" : "Connect Wallet"}
      </Button>
    );
  }

  const addr = publicKey.toBase58();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} className="gap-1.5 font-mono">
          <Wallet className="h-3.5 w-3.5" />
          {shortPubkey(addr)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          <p>Connected via {wallet?.adapter.name}</p>
          <p className="font-mono mt-0.5 break-all">{addr}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(addr);
            toast({ title: "Address copied" });
          }}
          className="gap-2 cursor-pointer"
        >
          <Copy className="h-3.5 w-3.5" /> Copy address
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2 cursor-pointer">
          <a href={explorerAddrUrl(addr)} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> View on Explorer
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => disconnect()}
          className="gap-2 cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
