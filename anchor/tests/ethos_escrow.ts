/**
 * Test suite for the ethos_escrow program.
 *
 * STATUS: written but NOT executed by the author (no Solana validator or
 * Anchor toolchain was available where it was written). Run it yourself with
 * `anchor test` (see ../README.md) and treat any failure as a real finding —
 * either a bug in the program or a bug in this test.
 *
 * Amounts are in token base units (the test mint has 6 decimals).
 */
import * as anchor from "@anchor-lang/core";
import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import { randomBytes } from "crypto";

const provider = AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.EthosEscrow as Program<any>;
const conn = provider.connection;
const walletKp: Keypair = (provider.wallet as any).payer;

let mint: PublicKey;
let otherMint: PublicKey;

// ---------------------------------------------------------------- helpers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);
const U64_MAX = new BN("18446744073709551615");

async function airdrop(pk: PublicKey, sol = 5) {
  const sig = await conn.requestAirdrop(pk, sol * 1_000_000_000);
  const bh = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
}
async function chainTime(): Promise<number> {
  const slot = await conn.getSlot("confirmed");
  return (await conn.getBlockTime(slot)) as number;
}
async function waitUntilChainAfter(ts: number) {
  while ((await chainTime()) <= ts) await sleep(500);
}
async function bal(ata: PublicKey): Promise<number> {
  return Number((await getAccount(conn, ata)).amount);
}
async function expectErr(p: Promise<any>, ...names: string[]) {
  try {
    await p;
  } catch (e: any) {
    if (names.length === 0) return;
    const code = e?.error?.errorCode?.code ?? e?.errorCode?.code;
    const text = String(e?.message ?? e) + JSON.stringify(e?.logs ?? "");
    if (names.some((n) => code === n || text.includes(n))) return;
    assert.fail(`expected one of [${names.join(", ")}] but got: ${code ?? text}`);
  }
  assert.fail(`expected the transaction to fail${names.length ? " with " + names.join("/") : ""}`);
}

interface Fx {
  payer: Keypair;
  receiver: Keypair;
  arbiter: Keypair;
  id: number[];
  escrow: PublicKey;
  vault: PublicKey;
  vaultAta: PublicKey;
  payerAta: PublicKey;
  receiverAta: PublicKey;
}

async function newFixture(funds = 1_000_000): Promise<Fx> {
  const payer = Keypair.generate();
  const receiver = Keypair.generate();
  const arbiter = Keypair.generate();
  await airdrop(payer.publicKey);
  const id = Array.from(randomBytes(16));
  const [escrow] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), payer.publicKey.toBuffer(), Buffer.from(id)],
    program.programId
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrow.toBuffer()],
    program.programId
  );
  const vaultAta = getAssociatedTokenAddressSync(mint, vault, true);
  const payerAta = await createAssociatedTokenAccount(conn, walletKp, mint, payer.publicKey);
  await mintTo(conn, walletKp, mint, payerAta, walletKp, funds);
  const receiverAta = await createAssociatedTokenAccount(conn, walletKp, mint, receiver.publicKey);
  return { payer, receiver, arbiter, id, escrow, vault, vaultAta, payerAta, receiverAta };
}

interface LockOpts {
  amount?: number;
  expiry?: number;
  milestones?: (number | BN)[];
  arbiter?: PublicKey;
  receiver?: PublicKey;
  payerAta?: PublicKey;
  amountBn?: BN;
}
function lock(f: Fx, o: LockOpts = {}) {
  return program.methods
    .lockFunds(
      f.id,
      o.amountBn ?? new BN(o.amount ?? 1000),
      new BN(o.expiry ?? now() + 3600),
      (o.milestones ?? []).map((m) => new BN(m))
    )
    .accountsPartial({
      payer: f.payer.publicKey,
      receiver: o.receiver ?? f.receiver.publicKey,
      arbiter: o.arbiter ?? f.arbiter.publicKey,
      mint,
      escrow: f.escrow,
      vault: f.vault,
      payerAta: o.payerAta ?? f.payerAta,
      vaultAta: f.vaultAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([f.payer])
    .rpc();
}

type Over = Record<string, PublicKey>;
const base = (f: Fx, signer: Keypair) => ({
  signer: signer.publicKey,
  escrow: f.escrow,
  mint,
  vault: f.vault,
  vaultAta: f.vaultAta,
  tokenProgram: TOKEN_PROGRAM_ID,
});
const approve = (f: Fx, idx: number, signer?: Keypair, over: Over = {}) => {
  const s = signer ?? f.payer;
  return program.methods
    .approveMilestone(idx)
    .accountsPartial({ ...base(f, s), receiverAta: f.receiverAta, ...over })
    .signers([s])
    .rpc();
};
const release = (f: Fx, signer?: Keypair, over: Over = {}) => {
  const s = signer ?? f.payer;
  return program.methods
    .release()
    .accountsPartial({ ...base(f, s), receiverAta: f.receiverAta, ...over })
    .signers([s])
    .rpc();
};
const refund = (f: Fx, signer: Keypair, over: Over = {}) =>
  program.methods
    .refund()
    .accountsPartial({ ...base(f, signer), payerAta: f.payerAta, ...over })
    .signers([signer])
    .rpc();
const dispute = (f: Fx, signer: Keypair) =>
  program.methods
    .raiseDispute()
    .accountsPartial({ signer: signer.publicKey, escrow: f.escrow })
    .signers([signer])
    .rpc();
const resolve = (f: Fx, signer: Keypair, toReceiver: BN | number, over: Over = {}) =>
  program.methods
    .resolveDispute(new BN(toReceiver))
    .accountsPartial({
      ...base(f, signer),
      receiverAta: f.receiverAta,
      payerAta: f.payerAta,
      ...over,
    })
    .signers([signer])
    .rpc();

async function view(f: Fx) {
  const e: any = await (program.account as any).escrow.fetch(f.escrow);
  return {
    state: Object.keys(e.state)[0],
    amount: e.amount.toNumber(),
    released: e.released.toNumber(),
    refunded: e.refunded.toNumber(),
    milestones: e.milestones.map((m: any) => ({ amount: m.amount.toNumber(), approved: m.approved })),
  };
}
/** Invariant checked after every settlement: the vault is accounted for. */
async function assertAccounting(f: Fx) {
  const v = await view(f);
  const inVault = await bal(f.vaultAta);
  assert.equal(inVault, v.amount - v.released - v.refunded, "vault balance != amount - released - refunded");
}

// ------------------------------------------------------------------ tests
describe("ethos_escrow", () => {
  before(async () => {
    mint = await createMint(conn, walletKp, walletKp.publicKey, null, 6);
    otherMint = await createMint(conn, walletKp, walletKp.publicKey, null, 6);
  });

  describe("create + fund (lock_funds)", () => {
    it("creates and funds an escrow atomically", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000 });
      const v = await view(f);
      assert.equal(v.state, "locked");
      assert.equal(v.amount, 1000);
      assert.equal(v.released, 0);
      assert.equal(v.refunded, 0);
      assert.equal(await bal(f.vaultAta), 1000);
      assert.equal(await bal(f.payerAta), 1_000_000 - 1000);
      await assertAccounting(f);
    });
    it("rejects a zero-value escrow", async () => {
      const f = await newFixture();
      await expectErr(lock(f, { amount: 0 }), "InvalidAmount");
    });
    it("rejects an expiry in the past", async () => {
      const f = await newFixture();
      await expectErr(lock(f, { expiry: now() - 10 }), "InvalidExpiry");
    });
    it("rejects a milestone total that does not equal the amount", async () => {
      const f = await newFixture();
      await expectErr(lock(f, { amount: 1000, milestones: [400, 500] }), "MilestoneSumMismatch");
    });
    it("rejects a zero-value milestone", async () => {
      const f = await newFixture();
      await expectErr(lock(f, { amount: 1000, milestones: [0, 1000] }), "InvalidMilestoneAmount");
    });
    it("accepts exactly 24 milestones and rejects 25", async () => {
      const f1 = await newFixture();
      await lock(f1, { amount: 24, milestones: Array(24).fill(1) });
      assert.equal((await view(f1)).milestones.length, 24);
      const f2 = await newFixture();
      await expectErr(lock(f2, { amount: 25, milestones: Array(25).fill(1) }), "TooManyMilestones");
    });
    it("rejects an overflowing milestone sum (u64 boundary)", async () => {
      const f = await newFixture();
      await expectErr(lock(f, { amount: 1000, milestones: [U64_MAX, new BN(2)] }), "MathOverflow");
    });
    it("rejects overlapping roles (payer/receiver/arbiter must differ)", async () => {
      const f = await newFixture();
      await expectErr(lock(f, { receiver: f.payer.publicKey }), "InvalidParties");
      await expectErr(lock(f, { arbiter: f.payer.publicKey }), "InvalidParties");
      await expectErr(lock(f, { arbiter: f.receiver.publicKey }), "InvalidParties");
    });
    it("rejects a duplicate escrow id from the same payer", async () => {
      const f = await newFixture();
      await lock(f);
      await expectErr(lock(f));
    });
    it("rejects funding more than the payer holds, creating nothing", async () => {
      const f = await newFixture(1000);
      await expectErr(lock(f, { amount: 5000 }));
      assert.isNull(await conn.getAccountInfo(f.escrow));
    });
    it("rejects a payer token account with the wrong mint or wrong authority", async () => {
      const f = await newFixture();
      const wrongMintAta = await createAssociatedTokenAccount(conn, walletKp, otherMint, f.payer.publicKey);
      await expectErr(lock(f, { payerAta: wrongMintAta }), "ConstraintTokenMint");
      await expectErr(lock(f, { payerAta: f.receiverAta }), "ConstraintTokenOwner");
    });
  });

  describe("release (no milestones)", () => {
    it("pays the full amount to the receiver and records Released", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000 });
      await release(f);
      const v = await view(f);
      assert.equal(v.state, "released");
      assert.equal(v.released, 1000);
      assert.equal(v.refunded, 0);
      assert.equal(await bal(f.receiverAta), 1000);
      assert.equal(await bal(f.vaultAta), 0);
      await assertAccounting(f);
    });
    it("rejects release by the receiver, the arbiter, or a stranger", async () => {
      const f = await newFixture();
      await lock(f);
      await expectErr(release(f, f.receiver), "Unauthorized");
      await expectErr(release(f, f.arbiter), "Unauthorized");
      await expectErr(release(f, Keypair.generate()), "Unauthorized");
      assert.equal(await bal(f.receiverAta), 0);
    });
    it("rejects a repeated release", async () => {
      const f = await newFixture();
      await lock(f);
      await release(f);
      await expectErr(release(f), "InvalidState");
    });
    it("rejects plain release on a milestone escrow", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000, milestones: [400, 600] });
      await expectErr(release(f), "UseMilestones");
    });
    it("rejects a receiver token account owned by someone else", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000 });
      await expectErr(release(f, f.payer, { receiverAta: f.payerAta }), "ConstraintTokenOwner");
      assert.equal(await bal(f.vaultAta), 1000);
    });
    it("rejects a receiver token account with the wrong mint", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000 });
      const wrong = await createAssociatedTokenAccount(conn, walletKp, otherMint, f.receiver.publicKey);
      await expectErr(release(f, f.payer, { receiverAta: wrong }), "ConstraintTokenMint");
    });
    it("rejects substituting another escrow's vault", async () => {
      const a = await newFixture();
      const b = await newFixture();
      await lock(a, { amount: 1000 });
      await lock(b, { amount: 2000 });
      await expectErr(release(a, a.payer, { vault: b.vault, vaultAta: b.vaultAta }));
      await expectErr(release(a, a.payer, { vaultAta: b.vaultAta }));
      assert.equal(await bal(a.vaultAta), 1000);
      assert.equal(await bal(b.vaultAta), 2000);
    });
    it("rejects using another escrow's account with this escrow's vault", async () => {
      const a = await newFixture();
      const b = await newFixture();
      await lock(a, { amount: 1000 });
      await lock(b, { amount: 2000 });
      await expectErr(release(a, a.payer, { escrow: b.escrow }));
      assert.equal(await bal(b.vaultAta), 2000);
    });
  });

  describe("milestones", () => {
    it("pays one milestone and tracks the partial release", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000, milestones: [400, 600] });
      await approve(f, 0);
      const v = await view(f);
      assert.equal(v.state, "locked");
      assert.equal(v.released, 400);
      assert.isTrue(v.milestones[0].approved);
      assert.isFalse(v.milestones[1].approved);
      assert.equal(await bal(f.receiverAta), 400);
      await assertAccounting(f);
    });
    it("records Released once every milestone is approved", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000, milestones: [400, 600] });
      await approve(f, 0);
      await approve(f, 1);
      const v = await view(f);
      assert.equal(v.state, "released");
      assert.equal(v.released, 1000);
      assert.equal(await bal(f.receiverAta), 1000);
      assert.equal(await bal(f.vaultAta), 0);
    });
    it("rejects a repeated milestone approval", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000, milestones: [400, 600] });
      await approve(f, 0);
      await expectErr(approve(f, 0), "AlreadyApproved");
      assert.equal(await bal(f.receiverAta), 400);
    });
    it("rejects an invalid milestone index", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000, milestones: [400, 600] });
      await expectErr(approve(f, 2), "InvalidMilestone");
      await expectErr(approve(f, 255), "InvalidMilestone");
    });
    it("only the payer can approve a milestone", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000, milestones: [400, 600] });
      await expectErr(approve(f, 0, f.receiver), "Unauthorized");
      await expectErr(approve(f, 0, f.arbiter), "Unauthorized");
      await expectErr(approve(f, 0, Keypair.generate()), "Unauthorized");
      assert.equal(await bal(f.receiverAta), 0);
    });
  });

  describe("refund", () => {
    it("receiver can voluntarily refund the payer in full", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000 });
      await refund(f, f.receiver);
      const v = await view(f);
      assert.equal(v.state, "refunded");
      assert.equal(v.refunded, 1000);
      assert.equal(v.released, 0);
      assert.equal(await bal(f.payerAta), 1_000_000);
      assert.equal(await bal(f.vaultAta), 0);
    });
    it("payer cannot refund before expiry", async () => {
      const f = await newFixture();
      await lock(f);
      await expectErr(refund(f, f.payer), "NotYetExpired");
      assert.equal(await bal(f.vaultAta), 1000);
    });
    it("payer can refund after expiry (clock is checked on-chain)", async () => {
      const f = await newFixture();
      const expiry = now() + 6;
      await lock(f, { expiry });
      await expectErr(refund(f, f.payer), "NotYetExpired");
      await waitUntilChainAfter(expiry);
      await refund(f, f.payer);
      assert.equal((await view(f)).state, "refunded");
      assert.equal(await bal(f.payerAta), 1_000_000);
    });
    it("arbiter and strangers cannot refund an undisputed escrow", async () => {
      const f = await newFixture();
      await lock(f);
      await expectErr(refund(f, f.arbiter), "Unauthorized");
      await expectErr(refund(f, Keypair.generate()), "Unauthorized");
    });
    it("refunds only what remains after partial milestone payments", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000, milestones: [400, 600] });
      await approve(f, 0);
      await refund(f, f.receiver);
      const v = await view(f);
      assert.equal(v.released, 400);
      assert.equal(v.refunded, 600);
      assert.equal(v.state, "resolved"); // mixed outcome is not mislabelled Released/Refunded
      assert.equal(await bal(f.receiverAta), 400);
      assert.equal(await bal(f.payerAta), 1_000_000 - 1000 + 600);
      assert.equal(await bal(f.vaultAta), 0);
    });
    it("rejects a repeated refund", async () => {
      const f = await newFixture();
      await lock(f);
      await refund(f, f.receiver);
      await expectErr(refund(f, f.receiver), "InvalidState");
    });
    it("expiry never lets the payer pull funds out of a disputed escrow", async () => {
      const f = await newFixture();
      const expiry = now() + 6;
      await lock(f, { expiry });
      await dispute(f, f.receiver);
      await waitUntilChainAfter(expiry);
      await expectErr(refund(f, f.payer), "InvalidState");
      assert.equal(await bal(f.vaultAta), 1000);
    });
    it("rejects a refund destination that is not the payer's", async () => {
      const f = await newFixture();
      await lock(f);
      await expectErr(refund(f, f.receiver, { payerAta: f.receiverAta }), "ConstraintTokenOwner");
      assert.equal(await bal(f.vaultAta), 1000);
    });
  });

  describe("disputes", () => {
    it("payer or receiver can raise a dispute; others cannot", async () => {
      const f1 = await newFixture();
      await lock(f1);
      await dispute(f1, f1.payer);
      assert.equal((await view(f1)).state, "disputed");
      const f2 = await newFixture();
      await lock(f2);
      await dispute(f2, f2.receiver);
      assert.equal((await view(f2)).state, "disputed");
      const f3 = await newFixture();
      await lock(f3);
      await expectErr(dispute(f3, f3.arbiter), "Unauthorized");
      await expectErr(dispute(f3, Keypair.generate()), "Unauthorized");
      assert.equal((await view(f3)).state, "locked");
    });
    it("cannot raise a dispute twice", async () => {
      const f = await newFixture();
      await lock(f);
      await dispute(f, f.payer);
      await expectErr(dispute(f, f.receiver), "InvalidState");
    });
    it("blocks ordinary settlement while disputed", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000, milestones: [400, 600] });
      await dispute(f, f.receiver);
      await expectErr(approve(f, 0), "InvalidState");
      await expectErr(refund(f, f.receiver), "InvalidState");
      const g = await newFixture();
      await lock(g, { amount: 1000 });
      await dispute(g, g.payer);
      await expectErr(release(g), "InvalidState");
      assert.equal(await bal(g.vaultAta), 1000);
    });
    it("only the arbiter can resolve", async () => {
      const f = await newFixture();
      await lock(f);
      await dispute(f, f.payer);
      await expectErr(resolve(f, f.payer, 1000), "Unauthorized");
      await expectErr(resolve(f, f.receiver, 1000), "Unauthorized");
      await expectErr(resolve(f, Keypair.generate(), 1000), "Unauthorized");
      assert.equal(await bal(f.vaultAta), 1000);
    });
    it("cannot resolve an escrow that is not disputed", async () => {
      const f = await newFixture();
      await lock(f);
      await expectErr(resolve(f, f.arbiter, 1000), "InvalidState");
    });
    it("resolves with everything to the receiver -> Released", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000 });
      await dispute(f, f.payer);
      await resolve(f, f.arbiter, 1000);
      const v = await view(f);
      assert.equal(v.state, "released");
      assert.equal(await bal(f.receiverAta), 1000);
      assert.equal(await bal(f.payerAta), 1_000_000 - 1000);
      await assertAccounting(f);
    });
    it("resolves with everything refunded -> Refunded (not Released)", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000 });
      await dispute(f, f.receiver);
      await resolve(f, f.arbiter, 0);
      const v = await view(f);
      assert.equal(v.state, "refunded");
      assert.equal(v.released, 0);
      assert.equal(v.refunded, 1000);
      assert.equal(await bal(f.receiverAta), 0);
      assert.equal(await bal(f.payerAta), 1_000_000);
      await assertAccounting(f);
    });
    it("resolves with a partial allocation -> Resolved", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000 });
      await dispute(f, f.payer);
      await resolve(f, f.arbiter, 300);
      const v = await view(f);
      assert.equal(v.state, "resolved");
      assert.equal(v.released, 300);
      assert.equal(v.refunded, 700);
      assert.equal(await bal(f.receiverAta), 300);
      assert.equal(await bal(f.payerAta), 1_000_000 - 1000 + 700);
      await assertAccounting(f);
    });
    it("accounts for milestone funds already released before the dispute", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000, milestones: [400, 600] });
      await approve(f, 0); // 400 already paid
      await dispute(f, f.receiver);
      await resolve(f, f.arbiter, 100); // of the 600 remaining
      const v = await view(f);
      assert.equal(v.released, 500);
      assert.equal(v.refunded, 500);
      assert.equal(v.state, "resolved");
      assert.equal(await bal(f.receiverAta), 500);
      assert.equal(await bal(f.payerAta), 1_000_000 - 1000 + 500);
      assert.equal(await bal(f.vaultAta), 0);
    });
    it("rejects allocating more than the remaining balance", async () => {
      const f = await newFixture();
      await lock(f, { amount: 1000, milestones: [400, 600] });
      await approve(f, 0);
      await dispute(f, f.payer);
      await expectErr(resolve(f, f.arbiter, 601), "ExceedsBalance");
      await expectErr(resolve(f, f.arbiter, U64_MAX), "ExceedsBalance");
      assert.equal(await bal(f.vaultAta), 600);
    });
    it("rejects a repeated resolution", async () => {
      const f = await newFixture();
      await lock(f);
      await dispute(f, f.payer);
      await resolve(f, f.arbiter, 500);
      await expectErr(resolve(f, f.arbiter, 500), "InvalidState");
    });
    it("rejects arbiter-supplied destination accounts that are not the parties'", async () => {
      const f = await newFixture();
      await lock(f);
      await dispute(f, f.payer);
      const arbiterAta = await createAssociatedTokenAccount(conn, walletKp, mint, f.arbiter.publicKey);
      await expectErr(resolve(f, f.arbiter, 1000, { receiverAta: arbiterAta }), "ConstraintTokenOwner");
      await expectErr(resolve(f, f.arbiter, 0, { payerAta: arbiterAta }), "ConstraintTokenOwner");
      assert.equal(await bal(f.vaultAta), 1000);
    });
  });
});
