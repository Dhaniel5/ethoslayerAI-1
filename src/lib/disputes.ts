// Dispute service — all state transitions go through security-definer RPCs.
import { supabase } from "@/integrations/supabase/client";
import type { EscrowRow, MilestoneRow } from "./escrow";

export type DisputeStatus =
  | "open"
  | "under_review"
  | "negotiating"
  | "resolved"
  | "cancelled"
  | "escalated";

export type PartyRole = "buyer" | "seller" | null;

export interface DisputeRow {
  id: string;
  ref: string;
  escrow_id: string;
  milestone_id: string | null;
  opened_by: string;
  opened_by_role: string;
  reason: string;
  status: DisputeStatus;
  resolution: {
    kind?: string;
    amount_buyer?: number;
    amount_seller?: number;
    note?: string | null;
    solo?: boolean;
  } | null;
  resolution_tx: string | null;
  resolved_at: string | null;
  cancelled_at: string | null;
  escalated_at: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface DisputeMessage {
  id: string;
  dispute_id: string;
  author_id: string | null;
  author_role: string;
  body: string;
  created_at: string;
}

export interface DisputeEvidence {
  id: string;
  dispute_id: string;
  submitted_by: string | null;
  submitted_by_role: string;
  kind: string;
  file_name: string | null;
  storage_path: string | null;
  link_url: string | null;
  description: string | null;
  created_at: string;
}

export interface DisputeProposal {
  id: string;
  dispute_id: string;
  proposed_by: string;
  proposed_by_role: string;
  kind: "release_seller" | "refund_buyer" | "split" | "custom";
  amount_buyer: number;
  amount_seller: number;
  note: string | null;
  status: "pending" | "accepted" | "rejected" | "superseded";
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface DisputeEvent {
  id: string;
  dispute_id: string;
  event_type: string;
  actor_id: string | null;
  actor_label: string | null;
  note: string | null;
  created_at: string;
}

export interface DisputeNotification {
  id: string;
  user_id: string;
  dispute_id: string | null;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

const db = supabase as any;

/* ---------------- reads ---------------- */

export async function listDisputes(): Promise<(DisputeRow & { escrow: EscrowRow })[]> {
  const { data, error } = await db
    .from("disputes")
    .select("*, escrow:escrows(*)")
    .order("last_activity_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function getDisputeForEscrow(escrowId: string): Promise<DisputeRow | null> {
  const { data, error } = await db
    .from("disputes")
    .select("*")
    .eq("escrow_id", escrowId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DisputeRow) ?? null;
}

export interface DisputeBundle {
  dispute: DisputeRow | null;
  escrow: EscrowRow | null;
  milestones: MilestoneRow[];
  messages: DisputeMessage[];
  evidence: DisputeEvidence[];
  proposals: DisputeProposal[];
  events: DisputeEvent[];
}

export async function getDispute(id: string): Promise<DisputeBundle> {
  const { data: dispute, error } = await db.from("disputes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!dispute) {
    return { dispute: null, escrow: null, milestones: [], messages: [], evidence: [], proposals: [], events: [] };
  }

  const [escrowRes, milestonesRes, messagesRes, evidenceRes, proposalsRes, eventsRes] = await Promise.all([
    db.from("escrows").select("*").eq("id", dispute.escrow_id).maybeSingle(),
    db.from("escrow_milestones").select("*").eq("escrow_id", dispute.escrow_id).order("position"),
    db.from("dispute_messages").select("*").eq("dispute_id", id).order("created_at"),
    db.from("dispute_evidence").select("*").eq("dispute_id", id).order("created_at", { ascending: false }),
    db.from("dispute_proposals").select("*").eq("dispute_id", id).order("created_at", { ascending: false }),
    db.from("dispute_events").select("*").eq("dispute_id", id).order("created_at", { ascending: false }),
  ]);

  return {
    dispute: dispute as DisputeRow,
    escrow: (escrowRes.data ?? null) as EscrowRow | null,
    milestones: (milestonesRes.data ?? []) as MilestoneRow[],
    messages: (messagesRes.data ?? []) as DisputeMessage[],
    evidence: (evidenceRes.data ?? []) as DisputeEvidence[],
    proposals: (proposalsRes.data ?? []) as DisputeProposal[],
    events: (eventsRes.data ?? []) as DisputeEvent[],
  };
}

/* ---------------- actions ---------------- */

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const openDispute = (escrowId: string, reason: string, milestoneId?: string | null) =>
  rpc<string>("dispute_open", { _escrow_id: escrowId, _reason: reason, _milestone_id: milestoneId ?? null });

export const withdrawDispute = (id: string, note?: string) =>
  rpc<boolean>("dispute_withdraw", { _dispute_id: id, _note: note ?? null });

export const escalateDispute = (id: string, note?: string) =>
  rpc<boolean>("dispute_escalate", { _dispute_id: id, _note: note ?? null });

export const sendDisputeMessage = (id: string, body: string) =>
  rpc<string>("dispute_send_message", { _dispute_id: id, _body: body });

export const addDisputeEvidence = (args: {
  disputeId: string;
  kind: string;
  fileName?: string | null;
  storagePath?: string | null;
  linkUrl?: string | null;
  description?: string | null;
}) =>
  rpc<string>("dispute_add_evidence", {
    _dispute_id: args.disputeId,
    _kind: args.kind,
    _file_name: args.fileName ?? null,
    _storage_path: args.storagePath ?? null,
    _link_url: args.linkUrl ?? null,
    _description: args.description ?? null,
  });

export const proposeResolution = (args: {
  disputeId: string;
  kind: DisputeProposal["kind"];
  amountBuyer: number;
  amountSeller: number;
  note?: string | null;
}) =>
  rpc<string>("dispute_propose_resolution", {
    _dispute_id: args.disputeId,
    _kind: args.kind,
    _amount_buyer: args.amountBuyer,
    _amount_seller: args.amountSeller,
    _note: args.note ?? null,
  });

export const respondToProposal = (proposalId: string, action: "accept" | "reject") =>
  rpc<boolean>("dispute_respond_proposal", { _proposal_id: proposalId, _action: action });

/** Executes the accepted resolution on-chain via the custodial vault. */
export async function settleDispute(disputeId: string, escrowId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("release-escrow", {
    body: { escrow_id: escrowId, dispute_id: disputeId },
  });
  if (error) throw new Error(error.message || "Settlement failed");
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any)?.signature ?? null;
}

/* ---------------- evidence files ---------------- */

export async function uploadEvidenceFile(disputeId: string, file: File): Promise<string> {
  const path = `${disputeId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error } = await supabase.storage.from("dispute-evidence").upload(path, file);
  if (error) throw new Error(error.message);
  return path;
}

export async function evidenceSignedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("dispute-evidence").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

/* ---------------- notifications ---------------- */

export async function listNotifications(limit = 30): Promise<DisputeNotification[]> {
  const { data, error } = await db
    .from("dispute_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as DisputeNotification[];
}

export async function markNotificationsRead(ids?: string[]) {
  await db.rpc("dispute_notifications_mark_read", { _ids: ids ?? null });
}

/* ---------------- helpers ---------------- */

export function partyRole(escrow: EscrowRow | null, userId?: string | null): PartyRole {
  if (!escrow || !userId) return null;
  if (escrow.user_id === userId) return "buyer";
  if ((escrow as any).payee_user_id === userId) return "seller";
  return null;
}

export const DISPUTE_LABELS: Record<DisputeStatus, string> = {
  open: "Open",
  under_review: "Under Review",
  negotiating: "Negotiating",
  resolved: "Resolved",
  cancelled: "Cancelled",
  escalated: "Escalated",
};

export const isDisputeClosed = (s: DisputeStatus) => s === "resolved" || s === "cancelled";

export function eventLabel(type: string) {
  const map: Record<string, string> = {
    dispute_opened: "Dispute opened",
    dispute_withdrawn: "Dispute withdrawn",
    dispute_escalated: "Dispute escalated",
    message_sent: "Message sent",
    evidence_submitted: "Evidence submitted",
    resolution_proposed: "Resolution proposed",
    resolution_accepted: "Resolution accepted",
    resolution_rejected: "Resolution rejected",
    funds_released: "Funds released",
    funds_refunded: "Funds refunded",
  };
  return map[type] ?? type.replace(/_/g, " ");
}
