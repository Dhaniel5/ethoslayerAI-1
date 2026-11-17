/**
 * Core client for the on-chain `ethos_escrow` program (see /anchor).
 *
 * Instructions are built directly with @solana/web3.js instead of through an
 * Anchor IDL client, so the app has no dependency on a generated IDL file or
 * a specific Anchor npm version. The price: this file must be kept in step
 * with anchor/programs/ethos_escrow/src/lib.rs BY HAND.
 *
 *   - 8-byte instruction/account discriminators are sha256("global:<name>") /
 *     sha256("account:<Name>") truncated, hardcoded below.
 *   - Account ORDER in each instruction must match the program's `Accounts`
 *     struct field order exactly.
 *
 * To prove this file still agrees with the program, run
 *   anchor/scripts/verify_client.ts
 * (it rebuilds each instruction with Anchor's own IDL client and compares the
 * bytes and account lists). Run it after ANY change to the program.
 *
 * This module is deliberately pure: no env/config imports.
 */
import { Buffer } from "buffer";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

// Seeds are Buffers (not TextEncoder Uint8Arrays) so PDA derivation behaves identically in every
// JS realm (browser, Capacitor WebView, Node, jsdom).
const ESCROW_SEED = Buffer.from("escrow");
const VAULT_SEED = Buffer.from("vault");
const CONFIG_SEED = Buffer.from("config");

export const MAX_MILESTONES = 24;

// ---- discriminators (sha256 prefix) ----
const IX = {
  lockFunds: [171, 49, 9, 86, 156, 155, 2, 88],
  approveMilestone: [145, 85, 92, 60, 50, 130, 219, 106],
  release: [253, 249, 15, 206, 28, 127, 193, 241],
  refund: [2, 96, 183, 251, 63, 208, 46, 46],
  raiseDispute: [41, 243, 1, 51, 150, 95, 246, 73],
  resolveDispute: [231, 6, 202, 6, 96, 103, 12, 230],
} as const;
const ACCOUNT = {
  escrow: [31, 213, 123, 187, 186, 22, 218, 155],
  config: [155, 12, 170, 224, 30, 250, 204, 130],
} as const;

// ---- types ----
export enum OnChainState {
  Locked = 0,
  Disputed = 1,
  Released = 2,
  Refunded = 3,
  Resolved = 4,
}
export const STATE_LABEL: Record<OnChainState, string> = {
  [OnChainState.Locked]: "Locked",
  [OnChainState.Disputed]: "Disputed",
  [OnChainState.Released]: "Released",
  [OnChainState.Refunded]: "Refunded",
  [OnChainState.Resolved]: "Resolved (split)",
};

export interface OnChainMilestone {
  amount: bigint;
  approved: boolean;
}
export interface OnChainEscrow {
  escrowId: Uint8Array;
  payer: PublicKey;
  receiver: PublicKey;
  mint: PublicKey;
  amount: bigint;
  released: bigint;
  refunded: bigint;
  expiry: bigint;
  state: OnChainState;
  bump: number;
  vaultBump: number;
  milestones: OnChainMilestone[];
}
export interface OnChainConfig {
  admin: PublicKey;
  arbiter: PublicKey;
  bump: number;
}

// ---- small byte helpers (no Buffer needed except for instruction data) ----
const u64le = (n: bigint): Uint8Array => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};
const i64le = (n: bigint): Uint8Array => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, n, true);
  return b;
};
const u32le = (n: number): Uint8Array => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const bytesEqual = (a: Uint8Array, b: ArrayLike<number>) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// ---- escrow id <-> UUID (the app uses the database row's UUID as the on-chain id) ----
export function escrowIdFromUuid(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error("Escrow id must be a UUID");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function uuidFromEscrowId(id: Uint8Array): string {
  const h = Array.from(id, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---- PDAs ----
export const deriveConfigPda = (programId: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([CONFIG_SEED], programId)[0];
export const deriveEscrowPda = (programId: PublicKey, payer: PublicKey, escrowId: Uint8Array): PublicKey =>
  PublicKey.findProgramAddressSync([ESCROW_SEED, payer.toBuffer(), Buffer.from(escrowId)], programId)[0];
export const deriveVaultPda = (programId: PublicKey, escrow: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([VAULT_SEED, escrow.toBuffer()], programId)[0];
export const ata = (mint: PublicKey, owner: PublicKey, offCurve = false): PublicKey =>
  getAssociatedTokenAddressSync(mint, owner, offCurve);

// ---- decoders ----
export function decodeEscrow(data: Uint8Array): OnChainEscrow {
  if (!bytesEqual(data.subarray(0, 8), ACCOUNT.escrow)) {
    throw new Error("Not an Escrow account (discriminator mismatch)");
  }
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;
  const pk = () => {
    const k = new PublicKey(data.slice(o, o + 32));
    o += 32;
    return k;
  };
  const escrowId = data.slice(o, o + 16);
  o += 16;
  const payer = pk();
  const receiver = pk();
  const mint = pk();
  const amount = dv.getBigUint64(o, true); o += 8;
  const released = dv.getBigUint64(o, true); o += 8;
  const refunded = dv.getBigUint64(o, true); o += 8;
  const expiry = dv.getBigInt64(o, true); o += 8;
  const state = dv.getUint8(o) as OnChainState; o += 1;
  const bump = dv.getUint8(o); o += 1;
  const vaultBump = dv.getUint8(o); o += 1;
  const n = dv.getUint32(o, true); o += 4;
  const milestones: OnChainMilestone[] = [];
  for (let i = 0; i < n; i++) {
    const a = dv.getBigUint64(o, true); o += 8;
    const ap = dv.getUint8(o) === 1; o += 1;
    milestones.push({ amount: a, approved: ap });
  }
  return { escrowId, payer, receiver, mint, amount, released, refunded, expiry, state, bump, vaultBump, milestones };
}

export function decodeConfig(data: Uint8Array): OnChainConfig {
  if (!bytesEqual(data.subarray(0, 8), ACCOUNT.config)) {
    throw new Error("Not a Config account (discriminator mismatch)");
  }
  return {
    admin: new PublicKey(data.slice(8, 40)),
    arbiter: new PublicKey(data.slice(40, 72)),
    bump: data[72],
  };
}

/** Funds still held in the vault for this escrow. */
export const remainingOf = (e: OnChainEscrow): bigint => e.amount - e.released - e.refunded;

// ---- instruction builders (account order == the program's Accounts structs) ----
const meta = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean) => ({ pubkey, isSigner, isWritable });

export function lockFundsIx(p: {
  programId: PublicKey;
  payer: PublicKey;
  receiver: PublicKey;
  mint: PublicKey;
  escrowId: Uint8Array;
  amount: bigint;
  expiry: bigint;
  milestoneAmounts: bigint[];
}): TransactionInstruction {
  if (p.escrowId.length !== 16) throw new Error("escrowId must be 16 bytes");
  const config = deriveConfigPda(p.programId);
  const escrow = deriveEscrowPda(p.programId, p.payer, p.escrowId);
  const vault = deriveVaultPda(p.programId, escrow);
  const data = concat(
    Uint8Array.from(IX.lockFunds),
    p.escrowId,
    u64le(p.amount),
    i64le(p.expiry),
    u32le(p.milestoneAmounts.length),
    ...p.milestoneAmounts.map(u64le),
  );
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      meta(p.payer, true, true),
      meta(p.receiver, false, false),
      meta(p.mint, false, false),
      meta(config, false, false),
      meta(escrow, false, true),
      meta(vault, false, false),
      meta(ata(p.mint, p.payer), false, true),
      meta(ata(p.mint, vault, true), false, true),
      meta(TOKEN_PROGRAM_ID, false, false),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
      meta(SystemProgram.programId, false, false),
    ],
    data: Buffer.from(data),
  });
}

interface SettleCtx {
  programId: PublicKey;
  signer: PublicKey;
  escrow: PublicKey;
  state: OnChainEscrow;
}

/** approve_milestone and release share the same accounts (pays the receiver). */
function payReceiverKeys(c: SettleCtx) {
  const vault = deriveVaultPda(c.programId, c.escrow);
  return [
    meta(c.signer, true, false),
    meta(c.escrow, false, true),
    meta(c.state.mint, false, false),
    meta(vault, false, false),
    meta(ata(c.state.mint, vault, true), false, true),
    meta(ata(c.state.mint, c.state.receiver), false, true),
    meta(TOKEN_PROGRAM_ID, false, false),
  ];
}

export function approveMilestoneIx(c: SettleCtx, index: number): TransactionInstruction {
  if (!Number.isInteger(index) || index < 0 || index > 255) throw new Error("milestone index out of range");
  return new TransactionInstruction({
    programId: c.programId,
    keys: payReceiverKeys(c),
    data: Buffer.from(concat(Uint8Array.from(IX.approveMilestone), Uint8Array.of(index))),
  });
}

export function releaseIx(c: SettleCtx): TransactionInstruction {
  return new TransactionInstruction({
    programId: c.programId,
    keys: payReceiverKeys(c),
    data: Buffer.from(Uint8Array.from(IX.release)),
  });
}

export function refundIx(c: SettleCtx): TransactionInstruction {
  const vault = deriveVaultPda(c.programId, c.escrow);
  return new TransactionInstruction({
    programId: c.programId,
    keys: [
      meta(c.signer, true, false),
      meta(c.escrow, false, true),
      meta(c.state.mint, false, false),
      meta(vault, false, false),
      meta(ata(c.state.mint, vault, true), false, true),
      meta(ata(c.state.mint, c.state.payer), false, true),
      meta(TOKEN_PROGRAM_ID, false, false),
    ],
    data: Buffer.from(Uint8Array.from(IX.refund)),
  });
}

export function raiseDisputeIx(programId: PublicKey, signer: PublicKey, escrow: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [meta(signer, true, false), meta(escrow, false, true)],
    data: Buffer.from(Uint8Array.from(IX.raiseDispute)),
  });
}

export function resolveDisputeIx(c: SettleCtx, toReceiver: bigint): TransactionInstruction {
  const vault = deriveVaultPda(c.programId, c.escrow);
  return new TransactionInstruction({
    programId: c.programId,
    keys: [
      meta(c.signer, true, false),
      meta(deriveConfigPda(c.programId), false, false),
      meta(c.escrow, false, true),
      meta(c.state.mint, false, false),
      meta(vault, false, false),
      meta(ata(c.state.mint, vault, true), false, true),
      meta(ata(c.state.mint, c.state.receiver), false, true),
      meta(ata(c.state.mint, c.state.payer), false, true),
      meta(TOKEN_PROGRAM_ID, false, false),
    ],
    data: Buffer.from(concat(Uint8Array.from(IX.resolveDispute), u64le(toReceiver))),
  });
}

// ---- readable errors ----
// Anchor custom errors are numbered from 6000 in declaration order.
const PROGRAM_ERRORS: Record<string, string> = {
  InvalidAmount: "The amount must be greater than zero.",
  InvalidExpiry: "The expiry must be in the future.",
  TooManyMilestones: `An escrow can have at most ${MAX_MILESTONES} milestones.`,
  InvalidMilestoneAmount: "Every milestone amount must be greater than zero.",
  MilestoneSumMismatch: "The milestone amounts must add up to the escrow amount.",
  InvalidParties: "The payer, the receiver and the protocol arbiter must be three different wallets.",
  MathOverflow: "Arithmetic overflow.",
  FundingShortfall: "The vault did not receive the full amount.",
  InvalidState: "This action isn't allowed in the escrow's current state (it may be disputed or already settled).",
  InvalidMilestone: "That milestone doesn't exist.",
  AlreadyApproved: "That milestone was already approved.",
  Unauthorized: "This wallet isn't allowed to do that for this escrow.",
  UseMilestones: "This escrow has milestones — approve them one by one.",
  ExceedsBalance: "That amount is more than what is left in the escrow.",
  NothingToSettle: "There is nothing left to settle.",
  NotYetExpired: "The escrow hasn't expired yet, so the payer can't refund it on their own.",
};
const ERROR_NAMES = Object.keys(PROGRAM_ERRORS); // index i == error number 6000 + i

export function explainProgramError(err: unknown): string {
  const anyErr = err as { message?: string; logs?: string[] };
  const text = `${anyErr?.message ?? ""}\n${(anyErr?.logs ?? []).join("\n")}`;
  const byName = text.match(/Error Code: (\w+)/);
  if (byName && PROGRAM_ERRORS[byName[1]]) return PROGRAM_ERRORS[byName[1]];
  const byNum = text.match(/custom program error: 0x([0-9a-fA-F]+)/) || text.match(/Error Number: (\d+)/);
  if (byNum) {
    const n = byNum[0].includes("0x") ? parseInt(byNum[1], 16) : parseInt(byNum[1], 10);
    const name = ERROR_NAMES[n - 6000];
    if (name) return PROGRAM_ERRORS[name];
  }
  if (/Blockhash not found/i.test(text)) return "The network was briefly out of sync. Please try again.";
  if (/User rejected|rejected the request/i.test(text)) return "You cancelled the request in your wallet.";
  return anyErr?.message ?? "Transaction failed.";
}
