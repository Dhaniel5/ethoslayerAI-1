// Escrow service — Supabase data layer + Solana settlement placeholders.
// Modular so a real Anchor program can be wired in later without UI changes.

import { supabase } from "@/integrations/supabase/client";
import type { TrustResult } from "./trustScore";

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

// --- Solana settlement placeholder ---------------------------------------
// Real implementation would call an Anchor program / SPL token transfer.
async function solanaLockAUDD(_escrowId: string, _amount: number): Promise<string> {
  return `sim_lock_${Math.random().toString(36).slice(2, 10)}`;
}
async function solanaReleaseAUDD(_escrowId: string, _amount: number): Promise<string> {
  return `sim_release_${Math.random().toString(36).slice(2, 10)}`;
}
// -------------------------------------------------------------------------

export async function createEscrow(input: CreateEscrowInput): Promise<EscrowRow> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in required");

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
      status: "pending",
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

  // Simulate locking on Solana
  const sig = await solanaLockAUDD(escrow.id, input.amount_audd);
  await supabase.from("escrows").update({ status: "locked" }).eq("id", escrow.id);
  await supabase.from("escrow_events").insert([
    { escrow_id: escrow.id, event_type: "created", amount_audd: input.amount_audd },
    { escrow_id: escrow.id, event_type: "locked", amount_audd: input.amount_audd, tx_signature: sig },
  ]);

  return { ...escrow, status: "locked" } as EscrowRow;
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

export async function approveMilestone(escrowId: string, milestoneId: string) {
  const { data: m, error } = await supabase
    .from("escrow_milestones")
    .update({ approved: true, approved_at: new Date().toISOString() })
    .eq("id", milestoneId)
    .select()
    .single();
  if (error) throw error;
  const sig = await solanaReleaseAUDD(escrowId, m.amount_audd);
  await supabase.from("escrow_events").insert({
    escrow_id: escrowId,
    event_type: "milestone_approved",
    amount_audd: m.amount_audd,
    tx_signature: sig,
    note: m.title,
  });

  // If all approved, mark escrow released
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
}

export async function releaseEscrow(escrowId: string, amount: number) {
  const sig = await solanaReleaseAUDD(escrowId, amount);
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
