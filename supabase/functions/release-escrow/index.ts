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
import bs58 from "npm:bs58@5.0.0";
import { ed25519 } from "npm:@noble/curves@1.8.2/ed25519";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUDD_DECIMALS = 6;
const PRIMARY_RPC = Deno.env.get("SOLANA_RPC_URL") || "https://api.devnet.solana.com";
const RPC_ENDPOINTS = Array.from(new Set([PRIMARY_RPC, "https://api.devnet.solana.com"]));
const AUDD_MINT_STR = Deno.env.get("AUDD_MINT") || "B9peANWbJrZvJhKY2T5iUY64iT41k7rsfF2BSeZMong6";
const TOKEN_PROGRAM_ID_STR = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM_ID_STR = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM_ID_STR = "11111111111111111111111111111111";
const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", concatBytes(...parts)));
}

async function findProgramAddress(seeds: Uint8Array[], programId: Uint8Array): Promise<Uint8Array> {
  for (let bump = 255; bump >= 0; bump--) {
    const candidate = await sha256(...seeds, Uint8Array.of(bump), programId, PDA_MARKER);
    if (!isOnCurve(candidate)) return candidate;
  }
  throw new Error("Unable to derive associated token account address.");
}

function uiToBase(amount: number): bigint {
  const [w, f = ""] = amount.toFixed(AUDD_DECIMALS).split(".");
  const padded = (f + "0".repeat(AUDD_DECIMALS)).slice(0, AUDD_DECIMALS);
  return BigInt(w) * BigInt(10 ** AUDD_DECIMALS) + BigInt(padded || 0);
}

function isRetryableRpcError(statusOrCode: number | undefined, message: string): boolean {
  const lower = message.toLowerCase();
  return (
    statusOrCode === 403 ||
    statusOrCode === 429 ||
    (statusOrCode !== undefined && statusOrCode >= 500) ||
    lower.includes("access forbidden") ||
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("timeout")
  );
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const errors: string[] = [];

  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
      });
      if (!res.ok) {
        const message = `Solana RPC HTTP ${res.status}`;
        errors.push(`${endpoint}: ${message}`);
        if (isRetryableRpcError(res.status, message)) continue;
        throw new Error(message);
      }
      const body = await res.json();
      if (body.error) {
        const message = body.error.message || JSON.stringify(body.error);
        errors.push(`${endpoint}: ${message}`);
        if (isRetryableRpcError(body.error.code, message)) continue;
        throw new Error(message);
      }
      return body.result as T;
    } catch (err) {
      const message = (err as Error).message || String(err);
      errors.push(`${endpoint}: ${message}`);
      if (!isRetryableRpcError(undefined, message)) throw err;
    }
  }

  throw new Error(`Solana RPC request failed for ${method}: ${errors.join(" | ")}`);
}

async function accountExists(address: Uint8Array): Promise<boolean> {
  const result = await rpc<{ value: unknown }>("getAccountInfo", [bs58.encode(address), { encoding: "base64" }]);
  return result.value !== null;
}

function compiledInstruction(programIdIndex: number, accountIndexes: number[], data: Uint8Array): Uint8Array {
  return concatBytes(
    Uint8Array.of(programIdIndex),
    encodeLength(accountIndexes.length),
    Uint8Array.from(accountIndexes),
    encodeLength(data.length),
    data,
  );
}

async function transferAudd(vault: VaultKeypair, receiverBase58: string, amount: number): Promise<string> {
  const mint = pubkeyBytes(AUDD_MINT_STR);
  const tokenProgram = pubkeyBytes(TOKEN_PROGRAM_ID_STR);
  const associatedTokenProgram = pubkeyBytes(ASSOCIATED_TOKEN_PROGRAM_ID_STR);
  const systemProgram = pubkeyBytes(SYSTEM_PROGRAM_ID_STR);
  const receiver = pubkeyBytes(receiverBase58);
  const fromAta = await findProgramAddress([vault.publicKey, tokenProgram, mint], associatedTokenProgram);
  const toAta = await findProgramAddress([receiver, tokenProgram, mint], associatedTokenProgram);
  const shouldCreateToAta = !(await accountExists(toAta));

  const accountKeys = [
    vault.publicKey,
    fromAta,
    toAta,
    receiver,
    mint,
    systemProgram,
    tokenProgram,
    associatedTokenProgram,
  ];

  const instructions: Uint8Array[] = [];
  if (shouldCreateToAta) {
    instructions.push(compiledInstruction(7, [0, 2, 3, 4, 5, 6], new Uint8Array()));
  }
  instructions.push(compiledInstruction(
    6,
    [1, 4, 2, 0],
    concatBytes(Uint8Array.of(12), u64LE(uiToBase(amount)), Uint8Array.of(AUDD_DECIMALS)),
  ));

  const blockhash = await rpc<{ value: { blockhash: string } }>("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const message = concatBytes(
    Uint8Array.of(1, 0, 5),
    encodeLength(accountKeys.length),
    ...accountKeys,
    pubkeyBytes(blockhash.value.blockhash),
    encodeLength(instructions.length),
    ...instructions,
  );
  const signature = await ed25519.sign(message, vault.secret.slice(0, 32));
  const tx = concatBytes(encodeLength(1), signature, message);
  return await rpc<string>("sendTransaction", [
    bytesToBase64(tx),
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 },
  ]);
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

    const { escrow_id, milestone_id } = await req.json();
    if (!escrow_id) throw new Error("escrow_id is required");

    const { data: escrow, error: eErr } = await supabase
      .from("escrows").select("*").eq("id", escrow_id).maybeSingle();
    if (eErr || !escrow) throw new Error("Escrow not found");
    if (escrow.user_id !== userRes.user.id) throw new Error("Forbidden");
    if (escrow.status === "released") throw new Error("Already released");

    const vault = loadVault();
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

    const sig = await transferAudd(vault, escrow.receiver_wallet, amount);

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
        note: "Released by custodial vault",
      });
    }

    return new Response(JSON.stringify({ signature: sig, vault: vault.publicKeyBase58 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("release-escrow error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
