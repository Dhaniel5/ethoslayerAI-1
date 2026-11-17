/**
 * App-level actions for escrows that live in the on-chain `ethos_escrow` program.
 *
 * Design rule: the CHAIN is the source of truth. Every action sends the
 * transaction first; the database is updated afterwards, best effort (a failed
 * DB write after a successful transaction is reported but never hides the fact
 * that the transaction succeeded). Screens for on-chain escrows read their
 * state from the chain.
 */
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { supabase } from "@/integrations/supabase/client";
import { AUDD_MINT, ESCROW_PROGRAM_ID, ESCROW_PROGRAM_ID_STRING } from "./solanaConfig";
import { confirmSignature, uiAmountToBase, type SignAndSend } from "./solanaTx";
import {
  ata,
  approveMilestoneIx,
  decodeConfig,
  decodeEscrow,
  deriveConfigPda,
  deriveEscrowPda,
  escrowIdFromUuid,
  explainProgramError,
  lockFundsIx,
  raiseDisputeIx,
  refundIx,
  releaseIx,
  remainingOf,
  resolveDisputeIx,
  OnChainState,
  type OnChainConfig,
  type OnChainEscrow,
} from "./escrowProgramCore";
import type { CreateEscrowInput, EscrowRow } from "./escrow";

export interface ChainCtx {
  connection: Connection;
  signer: SignAndSend;
}

const DEFAULT_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days

function programId(): PublicKey {
  if (!ESCROW_PROGRAM_ID) throw new Error(`VITE_ESCROW_PROGRAM_ID is not a valid address: ${ESCROW_PROGRAM_ID_STRING}`);
  return ESCROW_PROGRAM_ID;
}

// ---------------------------------------------------------------- reading
export function escrowAddress(payerWallet: string, escrowUuid: string): PublicKey {
  return deriveEscrowPda(programId(), new PublicKey(payerWallet), escrowIdFromUuid(escrowUuid));
}

export async function fetchOnchainEscrow(connection: Connection, escrowPda: PublicKey): Promise<OnChainEscrow | null> {
  const info = await connection.getAccountInfo(escrowPda, "confirmed");
  if (!info) return null;
  if (!info.owner.equals(programId())) throw new Error("That account isn't owned by the escrow program.");
  return decodeEscrow(info.data);
}

export async function fetchOnchainConfig(connection: Connection): Promise<OnChainConfig | null> {
  const info = await connection.getAccountInfo(deriveConfigPda(programId()), "confirmed");
  if (!info) return null;
  return decodeConfig(info.data);
}

// ---------------------------------------------------------------- sending
async function send(ctx: ChainCtx, ixs: TransactionInstruction[]): Promise<string> {
  try {
    const { blockhash, lastValidBlockHeight } = await ctx.connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: ctx.signer.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
    const signed = await ctx.signer.signTransaction(tx);
    const sig = await ctx.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
    await confirmSignature(ctx.connection, sig);
    return sig;
  } catch (e) {
    throw new Error(explainProgramError(e));
  }
}

const ensureAta = (ctx: ChainCtx, mint: PublicKey, owner: PublicKey) =>
  createAssociatedTokenAccountIdempotentInstruction(ctx.signer.publicKey, ata(mint, owner), owner, mint);

async function load(ctx: ChainCtx, escrowPda: PublicKey): Promise<OnChainEscrow> {
  const e = await fetchOnchainEscrow(ctx.connection, escrowPda);
  if (!e) throw new Error("This escrow was not found on-chain (wrong cluster or program?).");
  return e;
}

// ---------------------------------------------------------------- DB (best effort)
async function dbNote(fn: () => PromiseLike<{ error: unknown }>, what: string) {
  try {
    const { error } = await fn();
    if (error) console.warn(`[escrow] on-chain action succeeded but saving "${what}" failed:`, error);
  } catch (e) {
    console.warn(`[escrow] on-chain action succeeded but saving "${what}" failed:`, e);
  }
}

// ---------------------------------------------------------------- create
export async function createOnchainEscrow(input: CreateEscrowInput, chain: ChainCtx, userId: string): Promise<EscrowRow> {
  if (!AUDD_MINT) throw new Error("No settlement token (AUDD) mint is configured.");
  const config = await fetchOnchainConfig(chain.connection);
  if (!config) throw new Error("The escrow program isn't set up on this network yet (no Config account). An admin must run init_config first.");

  const mint = AUDD_MINT;
  const amount = uiAmountToBase(input.amount_audd);
  const milestones = (input.milestones ?? []).map((m) => uiAmountToBase(m.amount_audd));
  if (milestones.length > 0 && milestones.reduce((a, b) => a + b, 0n) !== amount) {
    throw new Error("The milestone amounts must add up exactly to the escrow amount.");
  }
  const expirySec = input.expires_at
    ? Math.floor(new Date(input.expires_at).getTime() / 1000)
    : Math.floor(Date.now() / 1000) + DEFAULT_LIFETIME_SECONDS;

  const payerAta = ata(mint, chain.signer.publicKey);
  try {
    const bal = await chain.connection.getTokenAccountBalance(payerAta, "confirmed");
    if (BigInt(bal.value.amount) < amount) throw new Error("You don't have enough AUDD in this wallet for that amount.");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("You don't have")) throw e;
    throw new Error("This wallet has no AUDD token account yet — it needs AUDD before it can fund an escrow.");
  }

  const escrowUuid = crypto.randomUUID();
  const ix = lockFundsIx({
    programId: programId(),
    payer: chain.signer.publicKey,
    receiver: new PublicKey(input.receiver_wallet.trim()),
    mint,
    escrowId: escrowIdFromUuid(escrowUuid),
    amount,
    expiry: BigInt(expirySec),
    milestoneAmounts: milestones,
  });
  const signature = await send(chain, [ix]);
  const pda = escrowAddress(chain.signer.publicKey.toBase58(), escrowUuid);

  // Funds are on-chain now. Record the row; retry briefly, and if it still fails make
  // the failure impossible to miss and tell the user how to find their escrow.
  const row = {
    id: escrowUuid,
    user_id: userId,
    payer_wallet: input.payer_wallet.trim(),
    receiver_wallet: input.receiver_wallet.trim(),
    amount_audd: input.amount_audd,
    description: input.description ?? null,
    condition_type: milestones.length > 0 ? "milestones" : "approval",
    status: "locked",
    trust_score: input.trust.score,
    trust_level: input.trust.level,
    trust_factors: input.trust.factors,
    expires_at: input.expires_at ?? new Date(expirySec * 1000).toISOString(),
    token_mint: input.token_mint ?? null,
    token_label: input.token_label ?? null,
    ai_analysis: input.ai_analysis ?? null,
    onchain: true,
    program_id: ESCROW_PROGRAM_ID_STRING,
  };
  let saved: EscrowRow | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3 && !saved; attempt++) {
    const { data, error } = await supabase.from("escrows").insert(row as never).select().single();
    if (error) {
      lastErr = error;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    } else {
      saved = data as unknown as EscrowRow;
    }
  }
  if (!saved) {
    console.error("[escrow] funds are locked on-chain but the database row could not be saved", lastErr);
    throw new Error(
      `Your funds ARE locked on-chain, but saving the escrow in the app failed. Keep these: escrow account ${pda.toBase58()}, transaction ${signature}. Have the receiver or your admin check the migration for the "onchain" column.`,
    );
  }

  if (milestones.length > 0) {
    const rows = (input.milestones ?? []).map((m, i) => ({ escrow_id: saved!.id, title: m.title, amount_audd: m.amount_audd, position: i }));
    await dbNote(() => supabase.from("escrow_milestones").insert(rows), "milestones");
  }
  await dbNote(
    () =>
      supabase.from("escrow_events").insert([
        { escrow_id: saved!.id, event_type: "created", amount_audd: input.amount_audd },
        { escrow_id: saved!.id, event_type: "locked", amount_audd: input.amount_audd, tx_signature: signature, note: `Locked on-chain in ${pda.toBase58()}` },
      ]),
    "events",
  );
  return saved;
}

// ---------------------------------------------------------------- actions
const ctxFor = (escrowPda: PublicKey, signer: PublicKey, state: OnChainEscrow) => ({ programId: programId(), signer, escrow: escrowPda, state });

export async function releaseOnchain(chain: ChainCtx, escrow: EscrowRow, escrowPda: PublicKey): Promise<string> {
  const st = await load(chain, escrowPda);
  const pay = remainingOf(st);
  const sig = await send(chain, [ensureAta(chain, st.mint, st.receiver), releaseIx(ctxFor(escrowPda, chain.signer.publicKey, st))]);
  await dbNote(async () => supabase.from("escrows").update({ status: "released", released_at: new Date().toISOString() }).eq("id", escrow.id), "status");
  await dbNote(async () => supabase.from("escrow_events").insert({ escrow_id: escrow.id, event_type: "released", amount_audd: Number(pay) / 1e6, tx_signature: sig }), "event");
  return sig;
}

export async function approveMilestoneOnchain(chain: ChainCtx, escrow: EscrowRow, escrowPda: PublicKey, index: number, milestoneId?: string): Promise<string> {
  const st = await load(chain, escrowPda);
  const sig = await send(chain, [ensureAta(chain, st.mint, st.receiver), approveMilestoneIx(ctxFor(escrowPda, chain.signer.publicKey, st), index)]);
  const after = await fetchOnchainEscrow(chain.connection, escrowPda);
  if (milestoneId) {
    await dbNote(async () => supabase.from("escrow_milestones").update({ approved: true, approved_at: new Date().toISOString() }).eq("id", milestoneId), "milestone");
  }
  await dbNote(async () => supabase.from("escrow_events").insert({ escrow_id: escrow.id, event_type: "milestone_approved", amount_audd: Number(st.milestones[index]?.amount ?? 0n) / 1e6, tx_signature: sig }), "event");
  if (after && after.state === OnChainState.Released) {
    await dbNote(async () => supabase.from("escrows").update({ status: "released", released_at: new Date().toISOString() }).eq("id", escrow.id), "status");
  }
  return sig;
}

export async function refundOnchain(chain: ChainCtx, escrow: EscrowRow, escrowPda: PublicKey): Promise<string> {
  const st = await load(chain, escrowPda);
  const back = remainingOf(st);
  const sig = await send(chain, [ensureAta(chain, st.mint, st.payer), refundIx(ctxFor(escrowPda, chain.signer.publicKey, st))]);
  await dbNote(async () => supabase.from("escrows").update({ status: "cancelled" }).eq("id", escrow.id), "status");
  await dbNote(async () => supabase.from("escrow_events").insert({ escrow_id: escrow.id, event_type: "cancelled", amount_audd: Number(back) / 1e6, tx_signature: sig, note: "Refunded to the payer on-chain" }), "event");
  return sig;
}

/** Freezes the on-chain escrow (payer or receiver wallet must sign). The caller then opens the dispute room. */
export async function raiseDisputeOnchain(chain: ChainCtx, escrowPda: PublicKey): Promise<string> {
  await load(chain, escrowPda);
  return send(chain, [raiseDisputeIx(programId(), chain.signer.publicKey, escrowPda)]);
}

/** Arbiter only: pays `toReceiver` (base units) to the receiver and the rest back to the payer. */
export async function resolveDisputeOnchain(chain: ChainCtx, escrowPda: PublicKey, toReceiver: bigint): Promise<string> {
  const st = await load(chain, escrowPda);
  const sig = await send(chain, [
    ensureAta(chain, st.mint, st.receiver),
    ensureAta(chain, st.mint, st.payer),
    resolveDisputeIx(ctxFor(escrowPda, chain.signer.publicKey, st), toReceiver),
  ]);
  return sig;
}

/** Keeps the app's own status column in step with the chain, when the viewer owns the row. */
export async function syncStatusFromChain(escrow: EscrowRow, chainState: OnChainState): Promise<void> {
  const target =
    chainState === OnChainState.Released || chainState === OnChainState.Resolved ? "released"
    : chainState === OnChainState.Refunded ? "cancelled"
    : null;
  if (!target || escrow.status === target) return;
  await dbNote(async () => supabase.from("escrows").update({ status: target }).eq("id", escrow.id), "status sync");
}
