/**
 * Client for the on-chain `ethoslayer_escrow` Anchor program (see /anchor).
 *
 * Deliberately built on raw @solana/web3.js instructions rather than
 * @coral-xyz/anchor's IDL-driven Program client: Anchor's 8-byte instruction
 * discriminators (sha256("global:<snake_case_name>")[:8]) and account
 * discriminators (sha256("account:<PascalCase name>")[:8]) have been stable
 * across Anchor versions, so encoding against them directly here means this
 * client has no dependency on matching some specific Anchor npm package
 * version's IDL-parsing behavior — it only has to match this program's own
 * Rust source, which lives right next to it in this repo.
 *
 * If the program's accounts or instructions ever change shape, update the
 * corresponding encode/decode function here to match — there is no
 * code-generation step tying the two together.
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ESCROW_PROGRAM_ID } from "./solanaConfig";
import { confirmSignature, type SignAndSend } from "./solanaTx";

function requireProgramId(): PublicKey {
  if (!ESCROW_PROGRAM_ID) {
    throw new Error(
      "VITE_ESCROW_PROGRAM_ID is not set to a valid address — deploy the program (see /anchor/README.md) and set the real program ID.",
    );
  }
  return ESCROW_PROGRAM_ID;
}

// ---- Borsh-compatible primitive encoders (only the types this program's
// instruction args actually use — u64, i64, Pubkey) ----
function u64LE(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);
  return buf;
}
function i64LE(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(n);
  return buf;
}

// ---- Instruction discriminators: sha256("global:<name>")[:8] ----
const IX = {
  initializeConfig: Buffer.from([208, 127, 21, 1, 194, 190, 196, 70]),
  updateArbiter: Buffer.from([186, 0, 245, 142, 77, 0, 165, 210]),
  initializeEscrow: Buffer.from([243, 160, 77, 153, 11, 92, 48, 209]),
  raiseDispute: Buffer.from([41, 243, 1, 51, 150, 95, 246, 73]),
  release: Buffer.from([253, 249, 15, 206, 28, 127, 193, 241]),
  refund: Buffer.from([2, 96, 183, 251, 63, 208, 46, 46]),
};

// ---- Account discriminators: sha256("account:<Name>")[:8] ----
const ACCOUNT_DISCRIMINATOR = {
  config: Buffer.from([155, 12, 170, 224, 30, 250, 204, 130]),
  escrow: Buffer.from([31, 213, 123, 187, 186, 22, 218, 155]),
};

export enum OnChainEscrowStatus {
  Funded = 0,
  Disputed = 1,
  Released = 2,
  Refunded = 3,
}

export interface OnChainEscrow {
  buyer: PublicKey;
  seller: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  amount: bigint;
  nonce: bigint;
  expiry: bigint;
  status: OnChainEscrowStatus;
  bump: number;
}

// ---- PDA derivation ----
export function deriveConfigPda(programId: PublicKey = requireProgramId()): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
}

export function deriveEscrowPda(
  buyer: PublicKey,
  seller: PublicKey,
  nonce: bigint,
  programId: PublicKey = requireProgramId(),
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), buyer.toBuffer(), seller.toBuffer(), u64LE(nonce)],
    programId,
  );
}

export async function deriveVaultAta(mint: PublicKey, escrowPda: PublicKey): Promise<PublicKey> {
  return getAssociatedTokenAddress(mint, escrowPda, true);
}

/** A fresh per-escrow nonce. Collision odds between the same buyer/seller
 * pair within the same millisecond are negligible for this app's use. */
export function newEscrowNonce(): bigint {
  return BigInt(Date.now());
}

// ---- Instruction builders ----

export function buildInitializeEscrowIx(params: {
  buyer: PublicKey;
  seller: PublicKey;
  mint: PublicKey;
  buyerTokenAccount: PublicKey;
  escrowPda: PublicKey;
  vaultPda: PublicKey;
  nonce: bigint;
  amount: bigint;
  expiry: bigint;
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = params.programId ?? requireProgramId();
  const data = Buffer.concat([IX.initializeEscrow, u64LE(params.nonce), u64LE(params.amount), i64LE(params.expiry)]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.buyer, isSigner: true, isWritable: true },
      { pubkey: params.seller, isSigner: false, isWritable: false },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: params.escrowPda, isSigner: false, isWritable: true },
      { pubkey: params.vaultPda, isSigner: false, isWritable: true },
      { pubkey: params.buyerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildRaiseDisputeIx(params: {
  signer: PublicKey;
  escrowPda: PublicKey;
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = params.programId ?? requireProgramId();
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.signer, isSigner: true, isWritable: false },
      { pubkey: params.escrowPda, isSigner: false, isWritable: true },
    ],
    data: IX.raiseDispute,
  });
}

function buildResolveIx(
  which: "release" | "refund",
  params: {
    signer: PublicKey;
    buyer: PublicKey;
    configPda: PublicKey;
    escrowPda: PublicKey;
    vaultPda: PublicKey;
    destinationTokenAccount: PublicKey;
    programId?: PublicKey;
  },
): TransactionInstruction {
  const programId = params.programId ?? requireProgramId();
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.signer, isSigner: true, isWritable: true },
      { pubkey: params.buyer, isSigner: false, isWritable: true },
      { pubkey: params.configPda, isSigner: false, isWritable: false },
      { pubkey: params.escrowPda, isSigner: false, isWritable: true },
      { pubkey: params.vaultPda, isSigner: false, isWritable: true },
      { pubkey: params.destinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: which === "release" ? IX.release : IX.refund,
  });
}

// ---- Account decoding ----

/** Throws if `data` doesn't start with the expected Escrow account discriminator. */
export function decodeEscrowAccount(data: Buffer): OnChainEscrow {
  if (!data.subarray(0, 8).equals(ACCOUNT_DISCRIMINATOR.escrow)) {
    throw new Error("Account data is not an Escrow account (discriminator mismatch)");
  }
  let o = 8;
  const readPubkey = () => {
    const pk = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return pk;
  };
  const buyer = readPubkey();
  const seller = readPubkey();
  const mint = readPubkey();
  const vault = readPubkey();
  const amount = data.readBigUInt64LE(o); o += 8;
  const nonce = data.readBigUInt64LE(o); o += 8;
  const expiry = data.readBigInt64LE(o); o += 8;
  const status = data.readUInt8(o) as OnChainEscrowStatus; o += 1;
  const bump = data.readUInt8(o);
  return { buyer, seller, mint, vault, amount, nonce, expiry, status, bump };
}

export async function fetchEscrowAccount(connection: Connection, escrowPda: PublicKey): Promise<OnChainEscrow | null> {
  const info = await connection.getAccountInfo(escrowPda, "confirmed");
  if (!info) return null;
  return decodeEscrowAccount(info.data);
}

export async function fetchArbiter(connection: Connection): Promise<PublicKey | null> {
  const [configPda] = deriveConfigPda();
  const info = await connection.getAccountInfo(configPda, "confirmed");
  if (!info) return null;
  if (!info.data.subarray(0, 8).equals(ACCOUNT_DISCRIMINATOR.config)) return null;
  // Config layout: 8 (discriminator) + 32 (admin) + 32 (arbiter) + 1 (bump)
  return new PublicKey(info.data.subarray(40, 72));
}

// ---- High-level send helpers ----

async function signAndSend(connection: Connection, signer: SignAndSend, ixs: TransactionInstruction[]): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signer.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
  const signed = await signer.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
  await confirmSignature(connection, sig);
  return sig;
}

/** Buyer creates + funds a new on-chain escrow. Returns the signature and
 * the new escrow's PDA address (needed for every later action on it). */
export async function initializeEscrowOnChain(params: {
  connection: Connection;
  buyer: SignAndSend;
  seller: PublicKey;
  mint: PublicKey;
  amount: bigint;
  expiry: bigint;
}): Promise<{ signature: string; escrowPda: PublicKey; nonce: bigint }> {
  const nonce = newEscrowNonce();
  const [escrowPda] = deriveEscrowPda(params.buyer.publicKey, params.seller, nonce);
  const vaultPda = await deriveVaultAta(params.mint, escrowPda);
  const buyerTokenAccount = await getAssociatedTokenAddress(params.mint, params.buyer.publicKey);

  const ix = buildInitializeEscrowIx({
    buyer: params.buyer.publicKey,
    seller: params.seller,
    mint: params.mint,
    buyerTokenAccount,
    escrowPda,
    vaultPda,
    nonce,
    amount: params.amount,
    expiry: params.expiry,
  });
  const signature = await signAndSend(params.connection, params.buyer, [ix]);
  return { signature, escrowPda, nonce };
}

export async function raiseDisputeOnChain(params: {
  connection: Connection;
  signer: SignAndSend;
  escrowPda: PublicKey;
}): Promise<string> {
  const ix = buildRaiseDisputeIx({ signer: params.signer.publicKey, escrowPda: params.escrowPda });
  return signAndSend(params.connection, params.signer, [ix]);
}

/** Releases the vault to the seller. `signer` must be the escrow's buyer or
 * the configured arbiter (see raiseDispute/program rules for exactly when). */
export async function releaseEscrowOnChain(params: {
  connection: Connection;
  signer: SignAndSend;
}, escrowPda: PublicKey): Promise<string> {
  const escrow = await fetchEscrowAccount(params.connection, escrowPda);
  if (!escrow) throw new Error("Escrow account not found on-chain.");
  const [configPda] = deriveConfigPda();
  const sellerTokenAccount = await getAssociatedTokenAddress(escrow.mint, escrow.seller);
  const ix = buildResolveIx("release", {
    signer: params.signer.publicKey,
    buyer: escrow.buyer,
    configPda,
    escrowPda,
    vaultPda: escrow.vault,
    destinationTokenAccount: sellerTokenAccount,
  });
  return signAndSend(params.connection, params.signer, [ix]);
}

/** Refunds the vault to the buyer. `signer` must be the escrow's seller, the
 * configured arbiter, or the buyer after `expiry` (see program rules). */
export async function refundEscrowOnChain(params: {
  connection: Connection;
  signer: SignAndSend;
}, escrowPda: PublicKey): Promise<string> {
  const escrow = await fetchEscrowAccount(params.connection, escrowPda);
  if (!escrow) throw new Error("Escrow account not found on-chain.");
  const [configPda] = deriveConfigPda();
  const buyerTokenAccount = await getAssociatedTokenAddress(escrow.mint, escrow.buyer);
  const ix = buildResolveIx("refund", {
    signer: params.signer.publicKey,
    buyer: escrow.buyer,
    configPda,
    escrowPda,
    vaultPda: escrow.vault,
    destinationTokenAccount: buyerTokenAccount,
  });
  return signAndSend(params.connection, params.signer, [ix]);
}
