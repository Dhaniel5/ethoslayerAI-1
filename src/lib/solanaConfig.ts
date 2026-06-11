// Solana network + AUDD configuration.
// Overridable via Vite env vars at build time.
import { clusterApiUrl, PublicKey } from "@solana/web3.js";

export type Cluster = "mainnet-beta" | "devnet" | "testnet";

export const SOLANA_CLUSTER: Cluster =
  (import.meta.env.VITE_SOLANA_CLUSTER as Cluster) || "mainnet-beta";

export const SOLANA_RPC_URL: string =
  import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl(SOLANA_CLUSTER);

// Canonical AUDD mint on Solana mainnet. Override with VITE_AUDD_MINT if needed.
export const AUDD_MINT_ADDRESS: string =
  import.meta.env.VITE_AUDD_MINT || "cgnTSU2dKAVqp7cnGrqgijRsHGEffjpyAo3WCi9LTAH";

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
