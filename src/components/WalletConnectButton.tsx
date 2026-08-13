import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { Wallet, LogOut, Copy, ExternalLink, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { explorerAddrUrl } from "@/lib/solanaConfig";
import { useToast } from "@/hooks/use-toast";

export function shortPubkey(pk: string) {
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

const PUBLIC_APP_ORIGIN = "https://ethoslayer.lovable.app";

function getPhantomProvider() {
  if (typeof window === "undefined") return null;
  const phantom = (window as any).phantom?.solana;
  const solana = (window as any).solana;
  if (phantom?.isPhantom) return phantom;
  if (solana?.isPhantom) return solana;
  return null;
}

function getSolflareProvider() {
  if (typeof window === "undefined") return null;
  const sf = (window as any).solflare;
  return sf?.isSolflare ? sf : null;
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return (
    /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * The deeplink target must be a URL the wallet's in-app browser can load on its own.
 * Inside the Lovable preview iframe `window.location.href` is a sandboxed preview URL,
 * so fall back to the published origin with the same path.
 */
function deeplinkTargetUrl() {
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const isFramed = window.self !== window.top;
  const isPreviewHost = /lovableproject\.com|id-preview/.test(window.location.hostname);
  if (isFramed || isPreviewHost) return `${PUBLIC_APP_ORIGIN}${path}`;
  return window.location.href;
}

/** Navigate the top-most window so the deeplink is not swallowed by an iframe. */
function hardNavigate(url: string) {
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = url;
      return;
    }
  } catch {
    // cross-origin top — fall through
  }
  try {
    window.location.href = url;
  } catch {
    window.open(url, "_blank");
  }
}

function openInPhantom() {
  const target = encodeURIComponent(deeplinkTargetUrl());
  const ref = encodeURIComponent(PUBLIC_APP_ORIGIN);
  hardNavigate(`https://phantom.app/ul/browse/${target}?ref=${ref}`);
}

function openInSolflare() {
  const target = encodeURIComponent(deeplinkTargetUrl());
  const ref = encodeURIComponent(PUBLIC_APP_ORIGIN);
  hardNavigate(`https://solflare.com/ul/v1/browse/${target}?ref=${ref}`);
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
  const [injected, setInjected] = useState(() => ({
    phantom: Boolean(getPhantomProvider()),
    solflare: Boolean(getSolflareProvider()),
  }));

  const isMobile = isMobileBrowser();

  // Wallet in-app browsers inject their provider slightly after first paint.
  // Poll briefly so the button doesn't wrongly think "no wallet installed".
  useEffect(() => {
    if (injected.phantom && injected.solflare) return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      const next = {
        phantom: Boolean(getPhantomProvider()),
        solflare: Boolean(getSolflareProvider()),
      };
      setInjected((prev) =>
        prev.phantom === next.phantom && prev.solflare === next.solflare ? prev : next,
      );
      if ((next.phantom && next.solflare) || tries > 20) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [injected.phantom, injected.solflare]);

  const findWallet = useCallback(
    (name: string) =>
      wallets.find(
        (w) =>
          w.adapter.name === name &&
          (w.readyState === WalletReadyState.Installed ||
            w.readyState === WalletReadyState.Loadable),
      ),
    [wallets],
  );

  const phantomWallet = findWallet("Phantom");
  const solflareWallet = findWallet("Solflare");
  const phantomReady = injected.phantom || Boolean(phantomWallet);
  const solflareReady = injected.solflare || Boolean(solflareWallet);
  const mobileWalletAdapter = wallets.find((w) => w.adapter.name.includes("Mobile Wallet Adapter"));

  useEffect(() => {
    if (!pendingWallet || !wallet || wallet.adapter.name !== pendingWallet || publicKey) return;

    let cancelled = false;
    connect()
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "The wallet did not approve the connection.";
        toast({
          title: "Wallet connection failed",
          description: message,
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setPendingWallet(null);
      });

    return () => {
      cancelled = true;
    };
  }, [connect, pendingWallet, publicKey, toast, wallet]);

  const connectNamed = (name?: string) => {
    const entry = name ? wallets.find((w) => w.adapter.name === name) : undefined;
    if (!entry) return false;
    const walletName = entry.adapter.name as WalletName;
    select(walletName);
    setPendingWallet(walletName);
    return true;
  };

  const handleDesktopConnect = () => {
    if (phantomReady && connectNamed("Phantom")) return;
    if (solflareReady && connectNamed("Solflare")) return;
    setVisible(true);
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
