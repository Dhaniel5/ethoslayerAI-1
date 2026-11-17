// @vitest-environment node
// (Address derivation uses a crypto library that misbehaves under jsdom; this file needs no browser.)
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import {
  approveMilestoneIx, decodeConfig, decodeEscrow, deriveEscrowPda, escrowIdFromUuid, explainProgramError,
  lockFundsIx, raiseDisputeIx, refundIx, releaseIx, remainingOf, resolveDisputeIx, uuidFromEscrowId,
  type OnChainEscrow,
} from "./escrowProgramCore";

// These tests prove the client is internally consistent and matches the program's documented layout.
// They do NOT prove it matches the compiled program: run anchor/scripts/verify_client.ts for that.
const disc = (ns: string, name: string) => Array.from(createHash("sha256").update(`${ns}:${name}`).digest().subarray(0, 8));
const pk = () => Keypair.generate().publicKey;
const pid = pk(), payer = pk(), receiver = pk(), mint = pk();
const id = escrowIdFromUuid("123e4567-e89b-12d3-a456-426614174000");
const escrow = deriveEscrowPda(pid, payer, id);
const state = { mint, payer, receiver } as unknown as OnChainEscrow;
const ctx = { programId: pid, signer: payer, escrow, state };
const u64 = (x: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(x); return b; };

describe("escrowProgramCore", () => {
  it("uses the real Anchor discriminators (sha256 prefixes)", () => {
    const lock = lockFundsIx({ programId: pid, payer, receiver, mint, escrowId: id, amount: 1000n, expiry: 1900000000n, milestoneAmounts: [400n, 600n] });
    expect(Array.from(lock.data.subarray(0, 8))).toEqual(disc("global", "lock_funds"));
    expect(Array.from(approveMilestoneIx(ctx, 1).data.subarray(0, 8))).toEqual(disc("global", "approve_milestone"));
    expect(Array.from(releaseIx(ctx).data.subarray(0, 8))).toEqual(disc("global", "release"));
    expect(Array.from(refundIx(ctx).data.subarray(0, 8))).toEqual(disc("global", "refund"));
    expect(Array.from(raiseDisputeIx(pid, payer, escrow).data.subarray(0, 8))).toEqual(disc("global", "raise_dispute"));
    expect(Array.from(resolveDisputeIx(ctx, 300n).data.subarray(0, 8))).toEqual(disc("global", "resolve_dispute"));
  });

  it("encodes lock_funds arguments at the right offsets", () => {
    const d = lockFundsIx({ programId: pid, payer, receiver, mint, escrowId: id, amount: 1000n, expiry: 1900000000n, milestoneAmounts: [400n, 600n] }).data;
    expect(d.length).toBe(8 + 16 + 8 + 8 + 4 + 16);
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    expect(dv.getBigUint64(24, true)).toBe(1000n);
    expect(dv.getBigInt64(32, true)).toBe(1900000000n);
    expect(dv.getUint32(40, true)).toBe(2);
    expect(dv.getBigUint64(44, true)).toBe(400n);
  });

  it("lists accounts in the program's order with the right signer/writable flags", () => {
    const k = lockFundsIx({ programId: pid, payer, receiver, mint, escrowId: id, amount: 1n, expiry: 1900000000n, milestoneAmounts: [] }).keys;
    expect(k).toHaveLength(11);
    expect(k[0]).toMatchObject({ isSigner: true, isWritable: true });
    expect(k[4].pubkey.equals(escrow) && k[4].isWritable).toBe(true);
    expect(k[5].isWritable).toBe(false); // vault authority PDA is read-only
    expect(releaseIx(ctx).keys).toHaveLength(7);
    expect(resolveDisputeIx(ctx, 1n).keys).toHaveLength(9);
    expect(releaseIx(ctx).keys[0]).toMatchObject({ isSigner: true, isWritable: false });
  });

  it("decodes an Escrow account laid out like the program's Borsh struct", () => {
    const body = Buffer.concat([
      Buffer.from(disc("account", "Escrow")), Buffer.from(id), payer.toBuffer(), receiver.toBuffer(), mint.toBuffer(),
      u64(1000n), u64(400n), u64(0n), (() => { const b = Buffer.alloc(8); b.writeBigInt64LE(1900000000n); return b; })(),
      Buffer.from([1, 254, 253]), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(2); return b; })(),
      u64(400n), Buffer.from([1]), u64(600n), Buffer.from([0]),
    ]);
    const e = decodeEscrow(new Uint8Array(body));
    expect(e.payer.equals(payer) && e.receiver.equals(receiver) && e.mint.equals(mint)).toBe(true);
    expect([e.amount, e.released, e.refunded, e.state, e.bump, e.vaultBump]).toEqual([1000n, 400n, 0n, 1, 254, 253]);
    expect(e.milestones).toEqual([{ amount: 400n, approved: true }, { amount: 600n, approved: false }]);
    expect(remainingOf(e)).toBe(600n);
    expect(() => decodeEscrow(new Uint8Array(body.subarray(1)))).toThrow();
  });

  it("decodes the Config account", () => {
    const body = Buffer.concat([Buffer.from(disc("account", "Config")), payer.toBuffer(), receiver.toBuffer(), Buffer.from([7])]);
    const c = decodeConfig(new Uint8Array(body));
    expect(c.admin.equals(payer) && c.arbiter.equals(receiver) && c.bump === 7).toBe(true);
  });

  it("round-trips UUIDs and rejects non-UUIDs", () => {
    expect(uuidFromEscrowId(id)).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(() => escrowIdFromUuid("nope")).toThrow();
  });

  it("explains program errors in plain language", () => {
    expect(explainProgramError({ message: "x", logs: ["Error Code: InvalidParties. Error Number: 6005."] })).toMatch(/different wallets/);
    expect(explainProgramError({ message: "custom program error: 0x177b" })).toMatch(/isn't allowed/); // 6011
    expect(explainProgramError({ message: "User rejected the request" })).toMatch(/cancelled/);
  });
});
