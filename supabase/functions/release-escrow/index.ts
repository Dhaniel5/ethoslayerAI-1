// Custodial vault release: signs an AUDD SPL transfer from the configured
// vault wallet to the receiver, then updates the escrow row + events.
//
// Required secrets:
//   - VAULT_SECRET_KEY: base58 string or JSON byte array of the vault keypair.
//   - SOLANA_RPC_URL (optional): defaults to devnet.
//   - AUDD_MINT (optional): defaults to the project AUDD mint.
//
// Auth: requires the caller's JWT; only the escrow owner can release.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import bs58 from "npm:bs58@6.0.0";
import { ed25519 } from "npm:@noble/curves@1.8.2/ed25519";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUDD_DECIMALS = 6;
const RPC = Deno.env.get("SOLANA_RPC_URL") || "https://api.devnet.solana.com";
const AUDD_MINT_STR = Deno.env.get("AUDD_MINT") || "cgnTSU2dKAVqp7cnGrqgijRsHGEffjpyAo3WCi9LTAH";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

type VaultKeypair = { secret: Uint8Array; publicKey: Uint8Array; publicKeyBase58: string };

function pubkeyBytes(value: string): Uint8Array {
  const bytes = bs58.decode(value.trim());
  if (bytes.length !== 32) throw new Error(`Invalid public key: ${value}`);
  return bytes;
}

function loadVault(): VaultKeypair {
  const raw = Deno.env.get("VAULT_SECRET_KEY");
  if (!raw) throw new Error("VAULT_SECRET_KEY secret is not configured.");
  const trimmed = raw.trim();
  const secret = trimmed.startsWith("[")
    ? Uint8Array.from(JSON.parse(trimmed))
    : bs58.decode(trimmed);
  if (secret.length !== 64) throw new Error("VAULT_SECRET_KEY must be a 64-byte Solana keypair.");
  const publicKey = secret.slice(32, 64);
  return { secret, publicKey, publicKeyBase58: bs58.encode(publicKey) };
}

function encodeLength(length: number): Uint8Array {
  const out: number[] = [];
  let rem = length;
  for (;;) {
    let elem = rem & 0x7f;
    rem >>= 7;
    if (rem === 0) {
      out.push(elem);
      break;
    }
    elem |= 0x80;
    out.push(elem);
  }
  return Uint8Array.from(out);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u64LE(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}

function isOnCurve(bytes: Uint8Array): boolean {
  if (trimmed.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }
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

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = vault.publicKey;
  tx.sign(vault);
  return await conn.sendRawTransaction(tx.serialize(), {
    maxRetries: 3,
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
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
