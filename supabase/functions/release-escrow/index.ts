// Custodial vault release: signs an AUDD SPL transfer from the configured
// vault wallet to the receiver, then updates the escrow row + events.
//
// Required secrets:
//   - VAULT_SECRET_KEY: base58 string or JSON byte array of the vault keypair.
//   - SOLANA_RPC_URL (optional): defaults to devnet.
//   - AUDD_MINT (optional): defaults to the project AUDD mint.
//
// Auth: requires the caller's JWT; only the escrow owner can release.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  Connection, Keypair, PublicKey, Transaction,
} from "https://esm.sh/@solana/web3.js@1.95.3";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "https://esm.sh/@solana/spl-token@0.4.8";
import bs58 from "https://esm.sh/bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUDD_DECIMALS = 6;
const RPC = Deno.env.get("SOLANA_RPC_URL") || "https://api.devnet.solana.com";
const AUDD_MINT_STR = Deno.env.get("AUDD_MINT") || "cgnTSU2dKAVqp7cnGrqgijRsHGEffjpyAo3WCi9LTAH";

function loadVault(): Keypair {
  const raw = Deno.env.get("VAULT_SECRET_KEY");
  if (!raw) throw new Error("VAULT_SECRET_KEY secret is not configured.");
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

function uiToBase(amount: number): bigint {
  const [w, f = ""] = amount.toFixed(AUDD_DECIMALS).split(".");
  const padded = (f + "0".repeat(AUDD_DECIMALS)).slice(0, AUDD_DECIMALS);
  return BigInt(w) * BigInt(10 ** AUDD_DECIMALS) + BigInt(padded || 0);
}

async function transferAudd(
  conn: Connection, vault: Keypair, receiver: PublicKey, amount: number,
): Promise<string> {
  const mint = new PublicKey(AUDD_MINT_STR);
  const fromAta = await getAssociatedTokenAddress(mint, vault.publicKey);
  const toAta = await getAssociatedTokenAddress(mint, receiver);

  const tx = new Transaction();
  try { await getAccount(conn, toAta); }
  catch {
    tx.add(createAssociatedTokenAccountInstruction(vault.publicKey, toAta, receiver, mint));
  }
  tx.add(createTransferCheckedInstruction(
    fromAta, mint, toAta, vault.publicKey,
    uiToBase(amount), AUDD_DECIMALS, [], TOKEN_PROGRAM_ID,
  ));

  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = vault.publicKey;
  tx.sign(vault);
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });

  // Confirm via polling.
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    const { value } = await conn.getSignatureStatuses([sig], { searchTransactionHistory: true });
    const s = value?.[0];
    if (s?.err) throw new Error(`On-chain failure: ${JSON.stringify(s.err)}`);
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return sig;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Confirmation timed out for ${sig}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) throw new Error("Unauthorized");
    const userId = userRes.user.id;

    const { escrow_id, milestone_id } = await req.json();
    if (!escrow_id) throw new Error("escrow_id is required");

    // Fetch escrow (service role, then check ownership manually).
    const { data: escrow, error: eErr } = await supabase
      .from("escrows").select("*").eq("id", escrow_id).maybeSingle();
    if (eErr || !escrow) throw new Error("Escrow not found");
    if (escrow.user_id !== userId) throw new Error("Forbidden");
    if (escrow.status === "released") throw new Error("Already released");

    const conn = new Connection(RPC, "confirmed");
    const vault = loadVault();
    const receiver = new PublicKey(escrow.receiver_wallet);

    let amount = Number(escrow.amount_audd);
    let milestone: any = null;
    if (milestone_id) {
      const { data: m, error: mErr } = await supabase
        .from("escrow_milestones").select("*").eq("id", milestone_id).maybeSingle();
      if (mErr || !m) throw new Error("Milestone not found");
      if (m.escrow_id !== escrow_id) throw new Error("Milestone/escrow mismatch");
      if (m.approved) throw new Error("Milestone already approved");
      milestone = m;
      amount = Number(m.amount_audd);
    }

    const sig = await transferAudd(conn, vault, receiver, amount);

    if (milestone) {
      await supabase.from("escrow_milestones")
        .update({ approved: true, approved_at: new Date().toISOString() })
        .eq("id", milestone.id);
      await supabase.from("escrow_events").insert({
        escrow_id, event_type: "milestone_approved",
        amount_audd: amount, tx_signature: sig, note: milestone.title,
      });
      const { data: remaining } = await supabase
        .from("escrow_milestones").select("id").eq("escrow_id", escrow_id).eq("approved", false);
      if (!remaining || remaining.length === 0) {
        await supabase.from("escrows")
          .update({ status: "released", released_at: new Date().toISOString() })
          .eq("id", escrow_id);
        await supabase.from("escrow_events").insert({
          escrow_id, event_type: "released", note: "All milestones approved",
        });
      }
    } else {
      await supabase.from("escrows")
        .update({ status: "released", released_at: new Date().toISOString() })
        .eq("id", escrow_id);
      await supabase.from("escrow_events").insert({
        escrow_id, event_type: "released", amount_audd: amount, tx_signature: sig,
        note: `Released by custodial vault`,
      });
    }

    return new Response(JSON.stringify({ signature: sig, vault: vault.publicKey.toBase58() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("release-escrow error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
