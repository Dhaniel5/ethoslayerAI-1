// Solana network + AUDD configuration.
// Overridable via Vite env vars at build time.
import { clusterApiUrl, PublicKey } from "@solana/web3.js";

export type Cluster = "mainnet-beta" | "devnet" | "testnet";

export const SOLANA_CLUSTER: Cluster =
  (import.meta.env.VITE_SOLANA_CLUSTER as Cluster) || "devnet";

export const SOLANA_RPC_URL: string =
  import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl(SOLANA_CLUSTER);

const DEFAULT_CLUSTER_RPC_URL = clusterApiUrl(SOLANA_CLUSTER);

// Try the configured RPC first, then the public cluster RPC. This prevents an
// invalid/forbidden custom endpoint from blocking escrow transactions entirely.
export const SOLANA_RPC_ENDPOINTS: string[] = Array.from(
  new Set([SOLANA_RPC_URL, DEFAULT_CLUSTER_RPC_URL].filter(Boolean)),
);

// Default test AUDD mint on Solana devnet. Override with VITE_AUDD_MINT for mainnet or a different test mint.
export const AUDD_MINT_ADDRESS: string =
  import.meta.env.VITE_AUDD_MINT || "B9peANWbJrZvJhKY2T5iUY64iT41k7rsfF2BSeZMong6";

// Vault wallet that holds locked AUDD between lock and release.
// The connected wallet must equal this address to release / approve milestones.
export const ESCROW_VAULT_ADDRESS: string =
  import.meta.env.VITE_ESCROW_VAULT || "FBW1vwhEVr9oN3KXY13JCHzCHzY4UoNsqUAtH88hiTBp";

// AUDD has 6 decimals on Solana.
export const AUDD_DECIMALS = 6;

export function tryPublicKey(addr: string): PublicKey | null {
  try { return new PublicKey(addr); } catch { return null; }
}

export const AUDD_MINT = tryPublicKey(AUDD_MINT_ADDRESS);
export const ESCROW_VAULT = tryPublicKey(ESCROW_VAULT_ADDRESS);

export function explorerTxUrl(signature: string): string {
  const cluster = SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

export function explorerAddrUrl(address: string): string {
  const cluster = SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`;
  return `https://explorer.solana.com/address/${address}${cluster}`;
}
