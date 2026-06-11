import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
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
  const { publicKey, disconnect, connecting, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const { toast } = useToast();

  if (!publicKey) {
    return (
      <Button
        size={size}
        variant={variant}
        onClick={() => setVisible(true)}
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
