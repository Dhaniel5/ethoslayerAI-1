// Escrow service — Supabase data layer + real AUDD SPL transfers on Solana.
import { Connection, PublicKey } from "@solana/web3.js";
import { supabase } from "@/integrations/supabase/client";
import type { TrustResult } from "./trustScore";
import { AUDD_MINT, ESCROW_VAULT, ESCROW_VAULT_ADDRESS } from "./solanaConfig";
import { confirmSignature, sendAuddTransfer, uiAmountToBase, type SignAndSend } from "./solanaTx";
import {
  initializeEscrowOnChain,
  releaseEscrowOnChain,
  refundEscrowOnChain,
  raiseDisputeOnChain as raiseDisputeOnChainIx,
} from "./escrowProgram";

export type EscrowStatus =
  | "pending"
  | "locked"
  | "in_review"
  | "released"
  | "disputed"
  | "escalated"
  | "expired"
  | "cancelled";

export interface EscrowRow {
  id: string;
  user_id: string;
  payer_wallet: string;
  receiver_wallet: string;
  amount_audd: number;
  description: string | null;
  condition_type: "approval" | "milestones";
  status: EscrowStatus;
  trust_score: number | null;
  trust_level: "low" | "medium" | "high" | null;
  trust_factors: any;
  expires_at: string | null;
  released_at: string | null;
  disputed_at: string | null;
  created_at: string;
  updated_at: string;
  payee_user_id: string | null;
  payee_wallet: string | null;
  pre_dispute_status: EscrowStatus | null;
}

export interface MilestoneRow {
  id: string;
  escrow_id: string;
  title: string;
  amount_audd: number;
  position: number;
  approved: boolean;
  approved_at: string | null;
  created_at: string;
}

export interface EventRow {
  id: string;
  escrow_id: string;
  event_type:
    | "created"
    | "locked"
    | "milestone_approved"
    | "released"
    | "disputed"
    | "cancelled"
    | "expired"
    | "note";
  amount_audd: number | null;
  tx_signature: string | null;
  note: string | null;
  created_at: string;
}

export interface CreateEscrowInput {
  payer_wallet: string;
  receiver_wallet: string;
  amount_audd: number;
  description?: string;
  expires_at?: string | null;
  trust: TrustResult;
  token_mint?: string;
  token_label?: string;
  ai_analysis?: any;
  milestones?: { title: string; amount_audd: number }[];
}

/** Public shareable escrow link for the payee (no account required). */
export function escrowShareLink(id: string) {
  const base =
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ||
    (typeof window !== "undefined" ? window.location.origin : "https://ethoslayers.netlify.app");
  return `${base.replace(/\/$/, "")}/escrow/${id}`;
}

export interface ChainContext {
  connection: Connection;
  signer: SignAndSend;
}

function assertVault() {
  if (!ESCROW_VAULT) throw new Error("Escrow vault address is not configured.");
}

/**
 * Create an escrow by locking AUDD: payer signs an SPL transfer to the vault.
 * The connected wallet must be the payer.
 */
const DEFAULT_ESCROW_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function createEscrow(
  input: CreateEscrowInput,
  chain: ChainContext,
): Promise<EscrowRow> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in required");

  const signerKey = chain.signer.publicKey.toBase58();
  if (signerKey !== input.payer_wallet.trim()) {
    throw new Error("Connected wallet does not match the payer wallet.");
  }

  const hasMilestones = !!input.milestones && input.milestones.length > 0;

  // Milestone escrows need partial releases per milestone, which the
  // ethoslayer_escrow program doesn't support yet (it only does a single
  // full release/refund of the vault) — those still go through the
  // custodial vault path below until the program grows that capability.
  // Everything else (the common case) now actually locks funds on-chain,
  // in a program-owned PDA vault, instead of a backend-held wallet.
  if (!hasMilestones) {
    const seller = new PublicKey(input.receiver_wallet.trim());
    const mint = input.token_mint ? new PublicKey(input.token_mint) : AUDD_MINT;
    if (!mint) throw new Error("No token mint configured for this escrow.");

    const expirySeconds = input.expires_at
      ? Math.floor(new Date(input.expires_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + DEFAULT_ESCROW_LIFETIME_SECONDS;

    const { signature, escrowPda, nonce } = await initializeEscrowOnChain({
      connection: chain.connection,
      buyer: chain.signer,
      seller,
      mint,
      amount: uiAmountToBase(input.amount_audd),
      expiry: BigInt(expirySeconds),
    });

    const { data: escrow, error } = await supabase
      .from("escrows")
      .insert({
        user_id: auth.user.id,
        payer_wallet: input.payer_wallet.trim(),
        receiver_wallet: input.receiver_wallet.trim(),
        amount_audd: input.amount_audd,
        description: input.description ?? null,
        condition_type: "approval",
        status: "locked",
        trust_score: input.trust.score,
        trust_level: input.trust.level,
        trust_factors: input.trust.factors,
        expires_at: input.expires_at ?? new Date(expirySeconds * 1000).toISOString(),
        token_mint: mint.toBase58(),
        token_label: input.token_label ?? null,
        ai_analysis: input.ai_analysis ?? null,
        escrow_pda: escrowPda.toBase58(),
        escrow_nonce: nonce.toString(),
        onchain: true,
      })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("escrow_events").insert([
      { escrow_id: escrow.id, event_type: "created", amount_audd: input.amount_audd },
      {
        escrow_id: escrow.id,
        event_type: "locked",
        amount_audd: input.amount_audd,
        tx_signature: signature,
        note: `Locked on-chain in escrow PDA ${escrowPda.toBase58()}`,
      },
    ]);

    return escrow as EscrowRow;
  }

  // --- Milestone path: unchanged custodial-vault flow ---
  assertVault();
  const sig = await sendAuddTransfer(chain.connection, chain.signer, ESCROW_VAULT!, input.amount_audd);
  await confirmSignature(chain.connection, sig);

  const { data: escrow, error } = await supabase
    .from("escrows")
    .insert({
      user_id: auth.user.id,
      payer_wallet: input.payer_wallet.trim(),
      receiver_wallet: input.receiver_wallet.trim(),
      amount_audd: input.amount_audd,
      description: input.description ?? null,
      condition_type: "milestones",
      status: "locked",
      trust_score: input.trust.score,
      trust_level: input.trust.level,
      trust_factors: input.trust.factors,
      expires_at: input.expires_at ?? null,
      token_mint: input.token_mint ?? null,
      token_label: input.token_label ?? null,
      ai_analysis: input.ai_analysis ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  const rows = input.milestones!.map((m, i) => ({
    escrow_id: escrow.id,
    title: m.title,
    amount_audd: m.amount_audd,
    position: i,
  }));
  const { error: mErr } = await supabase.from("escrow_milestones").insert(rows);
  if (mErr) throw mErr;

  await supabase.from("escrow_events").insert([
    { escrow_id: escrow.id, event_type: "created", amount_audd: input.amount_audd },
    {
      escrow_id: escrow.id,
      event_type: "locked",
      amount_audd: input.amount_audd,
      tx_signature: sig,
      note: `Locked to vault ${ESCROW_VAULT_ADDRESS}`,
    },
  ]);

  return escrow as EscrowRow;
}

/**
 * Release locked AUDD from the vault to the receiver.
 * The connected wallet MUST be the vault wallet (it holds the funds).
 */
export async function releaseEscrow(
  escrowId: string,
  amount: number,
  receiverWallet: string,
  chain: ChainContext,
) {
  const { data: row, error: rowErr } = await supabase
    .from("escrows")
    .select("onchain, escrow_pda")
    .eq("id", escrowId)
    .single();
  if (rowErr) throw rowErr;

  let sig: string;
  if (row.onchain && row.escrow_pda) {
    // The program itself enforces who's allowed to call this (buyer while
    // not disputed, or the arbiter) — nothing to pre-check client-side.
    sig = await releaseEscrowOnChain({ connection: chain.connection, signer: chain.signer }, new PublicKey(row.escrow_pda));
  } else {
    assertVault();
    if (chain.signer.publicKey.toBase58() !== ESCROW_VAULT_ADDRESS) {
      throw new Error(
        `Release must be signed by the vault wallet (${ESCROW_VAULT_ADDRESS.slice(0, 8)}…). Connect that wallet to release funds.`,
      );
    }
    const receiver = new PublicKey(receiverWallet);
    sig = await sendAuddTransfer(chain.connection, chain.signer, receiver, amount);
    await confirmSignature(chain.connection, sig);
  }

  await supabase
    .from("escrows")
    .update({ status: "released", released_at: new Date().toISOString() })
    .eq("id", escrowId);
  await supabase.from("escrow_events").insert({
    escrow_id: escrowId,
    event_type: "released",
    amount_audd: amount,
    tx_signature: sig,
  });
  return sig;
}

/** Refunds an on-chain escrow back to the buyer. Only works for escrows
 * created on-chain (`onchain === true`) — see createEscrow. */
export async function refundEscrow(escrowId: string, chain: ChainContext) {
  const { data: row, error: rowErr } = await supabase
    .from("escrows")
    .select("onchain, escrow_pda, amount_audd")
    .eq("id", escrowId)
    .single();
  if (rowErr) throw rowErr;
  if (!row.onchain || !row.escrow_pda) {
    throw new Error("This escrow wasn't created on-chain, so it can't be refunded this way.");
  }

  const sig = await refundEscrowOnChain({ connection: chain.connection, signer: chain.signer }, new PublicKey(row.escrow_pda));

  await supabase.from("escrows").update({ status: "expired" }).eq("id", escrowId);
  await supabase.from("escrow_events").insert({
    escrow_id: escrowId,
    event_type: "cancelled",
    amount_audd: row.amount_audd,
    tx_signature: sig,
    note: "Refunded to buyer on-chain",
  });
  return sig;
}

/** Raises a dispute on the on-chain escrow itself (separate from the
 * off-chain `disputeEscrow` bookkeeping below — call both for an on-chain
 * escrow: this locks the program's release/refund to arbiter-only, the
 * other updates the row AI/dispute-review tooling reads). */
export async function raiseDisputeOnChain(escrowId: string, chain: ChainContext) {
  const { data: row, error: rowErr } = await supabase
    .from("escrows")
    .select("onchain, escrow_pda")
    .eq("id", escrowId)
    .single();
  if (rowErr) throw rowErr;
  if (!row.onchain || !row.escrow_pda) return null; // nothing on-chain to flag
  return raiseDisputeOnChainIx({ connection: chain.connection, signer: chain.signer, escrowPda: new PublicKey(row.escrow_pda) });
}

export async function approveMilestone(
  escrowId: string,
  milestoneId: string,
  receiverWallet: string,
  chain: ChainContext,
) {
  assertVault();
  if (chain.signer.publicKey.toBase58() !== ESCROW_VAULT_ADDRESS) {
    throw new Error(
      `Milestone release must be signed by the vault wallet (${ESCROW_VAULT_ADDRESS.slice(0, 8)}…).`,
    );
  }

  const { data: m, error: mErr } = await supabase
    .from("escrow_milestones")
    .select("*")
    .eq("id", milestoneId)
    .single();
  if (mErr) throw mErr;

  const receiver = new PublicKey(receiverWallet);
  const sig = await sendAuddTransfer(chain.connection, chain.signer, receiver, Number(m.amount_audd));
  await confirmSignature(chain.connection, sig);

  await supabase
    .from("escrow_milestones")
    .update({ approved: true, approved_at: new Date().toISOString() })
    .eq("id", milestoneId);

  await supabase.from("escrow_events").insert({
    escrow_id: escrowId,
    event_type: "milestone_approved",
    amount_audd: m.amount_audd,
    tx_signature: sig,
    note: m.title,
  });

  const { data: remaining } = await supabase
    .from("escrow_milestones")
    .select("id")
    .eq("escrow_id", escrowId)
    .eq("approved", false);
  if (!remaining || remaining.length === 0) {
    await supabase
      .from("escrows")
      .update({ status: "released", released_at: new Date().toISOString() })
      .eq("id", escrowId);
    await supabase.from("escrow_events").insert({
      escrow_id: escrowId,
      event_type: "released",
      note: "All milestones approved",
    });
  }
  return sig;
}

/**
 * Custodial release path — invokes the `release-escrow` edge function which
 * holds the vault keypair as a server secret and signs the SPL transfer.
 * Used when the vault wallet isn't connected in the browser.
 */
export async function releaseViaCustodialVault(
  escrowId: string,
  milestoneId?: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("release-escrow", {
    body: { escrow_id: escrowId, milestone_id: milestoneId ?? null },
  });
  if (error) throw new Error(error.message || "Custodial release failed");
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any).signature as string;
}

export async function disputeEscrow(escrowId: string, reason: string) {
  await supabase
    .from("escrows")
    .update({ status: "disputed", disputed_at: new Date().toISOString() })
    .eq("id", escrowId);
  await supabase.from("escrow_events").insert({
    escrow_id: escrowId,
    event_type: "disputed",
    note: reason,
  });
}

export async function listEscrows(): Promise<EscrowRow[]> {
  const { data, error } = await supabase
    .from("escrows")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EscrowRow[];
}

export async function getEscrow(id: string) {
  const [{ data: escrow, error: e1 }, { data: milestones, error: e2 }, { data: events, error: e3 }] =
    await Promise.all([
      supabase.from("escrows").select("*").eq("id", id).maybeSingle(),
      supabase.from("escrow_milestones").select("*").eq("escrow_id", id).order("position"),
      supabase.from("escrow_events").select("*").eq("escrow_id", id).order("created_at", { ascending: false }),
    ]);
  if (e1 || e2 || e3) throw e1 || e2 || e3;
  return {
    escrow: escrow as EscrowRow | null,
    milestones: (milestones ?? []) as MilestoneRow[],
    events: (events ?? []) as EventRow[],
  };
}

export async function listAllEvents(): Promise<(EventRow & { escrow: EscrowRow })[]> {
  const { data, error } = await supabase
    .from("escrow_events")
    .select("*, escrow:escrows(*)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as any;
}

export function shortAddr(addr: string) {
  if (!addr) return "";
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

/* ---------- Public (no-account) payee access ---------- */

export interface PublicEscrow {
  id: string;
  description: string | null;
  payer_wallet: string;
  receiver_wallet: string;
  amount_audd: number;
  token_mint: string | null;
  token_label: string | null;
  ai_analysis: any;
  condition_type: string;
  status: EscrowStatus;
  trust_score: number | null;
  trust_level: "low" | "medium" | "high" | null;
  expires_at: string | null;
  created_at: string;
  payee_accepted: boolean;
  payee_wallet: string | null;
  payee_requested_audd: boolean;
  milestones: { id: string; title: string; amount_audd: number; position: number; approved: boolean }[];
}

export async function getPublicEscrow(id: string): Promise<PublicEscrow | null> {
  const { data, error } = await supabase.rpc("get_public_escrow" as any, { _id: id });
  if (error) throw error;
  return (data as unknown as PublicEscrow) ?? null;
}

export async function payeeAcceptEscrow(id: string, wallet: string) {
  const { data, error } = await supabase.rpc("payee_accept_escrow" as any, { _id: id, _wallet: wallet });
  if (error) throw error;
  return data as unknown as boolean;
}

export async function payeeRequestAudd(id: string) {
  const { data, error } = await supabase.rpc("payee_request_audd" as any, { _id: id });
  if (error) throw error;
  return data as unknown as boolean;
}

export function maskAddr(addr?: string | null) {
  if (!addr) return "";
  return addr.length > 8 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;
}
