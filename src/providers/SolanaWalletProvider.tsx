import { ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import {
  SolanaMobileWalletAdapter,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-adapter-mobile";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { SOLANA_CLUSTER, SOLANA_RPC_URL } from "@/lib/solanaConfig";
import "@solana/wallet-adapter-react-ui/styles.css";

export default function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const network =
    SOLANA_CLUSTER === "mainnet-beta"
      ? WalletAdapterNetwork.Mainnet
      : SOLANA_CLUSTER === "devnet"
      ? WalletAdapterNetwork.Devnet
      : WalletAdapterNetwork.Testnet;

  const wallets = useMemo(
    () => [
      new SolanaMobileWalletAdapter({
        addressSelector: {
          select: (addresses: string[]) => Promise.resolve(addresses[0]),
        },
        appIdentity: {
          name: "EthosLayer",
          uri: typeof window !== "undefined" ? window.location.origin : "https://ethoslayer.lovable.app",
          icon: "/favicon.ico",
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        chain: SOLANA_CLUSTER === "mainnet-beta" ? "solana:mainnet" : "solana:devnet",
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
    [network],
  );

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
