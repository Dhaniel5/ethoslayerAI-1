// Escrow service — Supabase data layer + real AUDD SPL transfers on Solana.
import { Connection, PublicKey } from "@solana/web3.js";
import { supabase } from "@/integrations/supabase/client";
import type { TrustResult } from "./trustScore";
import { ESCROW_VAULT, ESCROW_VAULT_ADDRESS } from "./solanaConfig";
import { confirmSignature, sendAuddTransfer, type SignAndSend } from "./solanaTx";

export type EscrowStatus =
  | "pending"
  | "locked"
  | "in_review"
  | "released"
  | "disputed"
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
  milestones?: { title: string; amount_audd: number }[];
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
export async function createEscrow(
  input: CreateEscrowInput,
  chain: ChainContext,
): Promise<EscrowRow> {
  assertVault();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in required");

  const signerKey = chain.signer.publicKey.toBase58();
  if (signerKey !== input.payer_wallet.trim()) {
    throw new Error("Connected wallet does not match the payer wallet.");
  }

  // 1. Send & confirm on-chain transfer payer → vault FIRST. No DB row if chain fails.
  const sig = await sendAuddTransfer(
    chain.connection,
    chain.signer,
    ESCROW_VAULT!,
    input.amount_audd,
  );
  await confirmSignature(chain.connection, sig);

  const hasMilestones = !!input.milestones && input.milestones.length > 0;

  const { data: escrow, error } = await supabase
    .from("escrows")
    .insert({
      user_id: auth.user.id,
      payer_wallet: input.payer_wallet.trim(),
      receiver_wallet: input.receiver_wallet.trim(),
      amount_audd: input.amount_audd,
      description: input.description ?? null,
      condition_type: hasMilestones ? "milestones" : "approval",
      status: "locked",
      trust_score: input.trust.score,
      trust_level: input.trust.level,
      trust_factors: input.trust.factors,
      expires_at: input.expires_at ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  if (hasMilestones) {
    const rows = input.milestones!.map((m, i) => ({
      escrow_id: escrow.id,
      title: m.title,
      amount_audd: m.amount_audd,
      position: i,
    }));
    const { error: mErr } = await supabase.from("escrow_milestones").insert(rows);
    if (mErr) throw mErr;
  }

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
  assertVault();
  if (chain.signer.publicKey.toBase58() !== ESCROW_VAULT_ADDRESS) {
    throw new Error(
      `Release must be signed by the vault wallet (${ESCROW_VAULT_ADDRESS.slice(0, 8)}…). Connect that wallet to release funds.`,
    );
  }
  const receiver = new PublicKey(receiverWallet);

  const sig = await sendAuddTransfer(chain.connection, chain.signer, receiver, amount);
  await confirmSignature(chain.connection, sig);

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
