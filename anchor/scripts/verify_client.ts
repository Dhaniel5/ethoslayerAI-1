/**
 * Proves the app's hand-written client (src/lib/escrowProgramCore.ts) agrees with the REAL program.
 *
 * It rebuilds every instruction twice - once with Anchor's own IDL client (generated from the
 * compiled program) and once with the app's client - and compares the instruction bytes and the
 * account lists (order, signer and writable flags). Optionally it also checks the app's account
 * decoder against Anchor's decoder on a real on-chain escrow.
 *
 * Run from anchor/ AFTER `anchor idl build` (needs target/idl/ethos_escrow.json) and after
 * `npm install` at the repo root (the app client imports the root node_modules):
 *   export NODE_OPTIONS=--no-experimental-strip-types
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 *   npx ts-node scripts/verify_client.ts
 * Optional decoder check against a real escrow (needs an RPC):
 *   ANCHOR_PROVIDER_URL=<rpc> ESCROW_ACCOUNT=<escrow account address> npx ts-node scripts/verify_client.ts
 */
import * as anchor from "@anchor-lang/core";
import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { randomBytes } from "crypto";
// The app client lives outside this package and resolves its own copy of web3.js, so values are
// passed as `any` (same runtime shape) and compared by base58 string below.
import * as core from "../../src/lib/escrowProgramCore";

const provider = AnchorProvider.local(process.env.ANCHOR_PROVIDER_URL, { commitment: "confirmed", preflightCommitment: "confirmed" });
anchor.setProvider(provider);
const program = anchor.workspace.EthosEscrow as Program<any>;
const pid = program.programId;

const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, pid)[0];
const ata = (mint: PublicKey, owner: PublicKey, off = false) => getAssociatedTokenAddressSync(mint, owner, off);
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
let failures = 0;

function same(name: string, anchorIx: any, mine: any) {
  const problems: string[] = [];
  if (hex(anchorIx.data) !== hex(mine.data)) problems.push(`data differs\n   anchor: ${hex(anchorIx.data)}\n   app   : ${hex(mine.data)}`);
  if (anchorIx.keys.length !== mine.keys.length) problems.push(`account count ${anchorIx.keys.length} (anchor) vs ${mine.keys.length} (app)`);
  else {
    anchorIx.keys.forEach((k: any, i: number) => {
      const m = mine.keys[i];
      if (k.pubkey.toBase58() !== m.pubkey.toBase58()) problems.push(`account #${i}: ${k.pubkey.toBase58()} vs ${m.pubkey.toBase58()}`);
      if (k.isSigner !== m.isSigner) problems.push(`account #${i} isSigner ${k.isSigner} vs ${m.isSigner}`);
      if (k.isWritable !== m.isWritable) problems.push(`account #${i} isWritable ${k.isWritable} vs ${m.isWritable}`);
    });
  }
  if (anchorIx.programId.toBase58() !== mine.programId.toBase58()) problems.push("programId differs");
  if (problems.length) { failures++; console.log(`FAIL  ${name}\n   ${problems.join("\n   ")}`); } else console.log(`ok    ${name}`);
}

async function main() {
  const payer = Keypair.generate().publicKey, receiver = Keypair.generate().publicKey, mint = Keypair.generate().publicKey;
  const idBytes = randomBytes(16);
  const config = pda([Buffer.from("config")]);
  const escrow = pda([Buffer.from("escrow"), payer.toBuffer(), idBytes]);
  const vault = pda([Buffer.from("vault"), escrow.toBuffer()]);
  const vaultAta = ata(mint, vault, true);
  const state: any = { mint, payer, receiver };
  const ctx: any = { programId: pid, signer: payer, escrow, state };

  same("lock_funds (with milestones)",
    await program.methods.lockFunds(Array.from(idBytes), new BN(1000), new BN(1900000000), [new BN(400), new BN(600)])
      .accountsPartial({ payer, receiver, mint, config, escrow, vault, payerAta: ata(mint, payer), vaultAta, tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction(),
    core.lockFundsIx({ programId: pid, payer, receiver, mint, escrowId: new Uint8Array(idBytes), amount: 1000n, expiry: 1900000000n, milestoneAmounts: [400n, 600n] } as any));

  same("lock_funds (no milestones)",
    await program.methods.lockFunds(Array.from(idBytes), new BN(5), new BN(1900000000), [])
      .accountsPartial({ payer, receiver, mint, config, escrow, vault, payerAta: ata(mint, payer), vaultAta, tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction(),
    core.lockFundsIx({ programId: pid, payer, receiver, mint, escrowId: new Uint8Array(idBytes), amount: 5n, expiry: 1900000000n, milestoneAmounts: [] } as any));

  const pay = { signer: payer, escrow, mint, vault, vaultAta, receiverAta: ata(mint, receiver), tokenProgram: TOKEN_PROGRAM_ID };
  same("release", await program.methods.release().accountsPartial(pay).instruction(), core.releaseIx(ctx));
  same("approve_milestone", await program.methods.approveMilestone(3).accountsPartial(pay).instruction(), core.approveMilestoneIx(ctx, 3));
  same("refund",
    await program.methods.refund().accountsPartial({ signer: payer, escrow, mint, vault, vaultAta, payerAta: ata(mint, payer), tokenProgram: TOKEN_PROGRAM_ID }).instruction(),
    core.refundIx(ctx));
  same("raise_dispute", await program.methods.raiseDispute().accountsPartial({ signer: payer, escrow }).instruction(), core.raiseDisputeIx(pid as any, payer as any, escrow as any));
  same("resolve_dispute",
    await program.methods.resolveDispute(new BN(300)).accountsPartial({ signer: payer, config, escrow, mint, vault, vaultAta, receiverAta: ata(mint, receiver), payerAta: ata(mint, payer), tokenProgram: TOKEN_PROGRAM_ID }).instruction(),
    core.resolveDisputeIx(ctx, 300n));

  const addr = process.env.ESCROW_ACCOUNT;
  if (addr) {
    const key = new PublicKey(addr);
    const info = await provider.connection.getAccountInfo(key);
    if (!info) { failures++; console.log("FAIL  decoder: escrow account not found on this network"); }
    else {
      const mine: any = core.decodeEscrow(info.data);
      const theirs: any = await (program.account as any).escrow.fetch(key);
      const checks: [string, boolean][] = [
        ["payer", mine.payer.toBase58() === theirs.payer.toBase58()],
        ["receiver", mine.receiver.toBase58() === theirs.receiver.toBase58()],
        ["mint", mine.mint.toBase58() === theirs.mint.toBase58()],
        ["amount", mine.amount === BigInt(theirs.amount.toString())],
        ["released", mine.released === BigInt(theirs.released.toString())],
        ["refunded", mine.refunded === BigInt(theirs.refunded.toString())],
        ["expiry", mine.expiry === BigInt(theirs.expiry.toString())],
        ["state", ["locked", "disputed", "released", "refunded", "resolved"][mine.state] === Object.keys(theirs.state)[0]],
        ["milestones", mine.milestones.length === theirs.milestones.length],
      ];
      for (const [n, okk] of checks) { if (!okk) failures++; console.log(`${okk ? "ok   " : "FAIL "} decoder: ${n}`); }
    }
  } else console.log("skip  decoder check (set ESCROW_ACCOUNT=<escrow address> and ANCHOR_PROVIDER_URL to include it)");

  console.log(failures === 0 ? "\nALL CHECKS PASSED: the app client agrees with the compiled program." : `\n${failures} CHECK(S) FAILED - do not use the app client against this program until fixed.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
