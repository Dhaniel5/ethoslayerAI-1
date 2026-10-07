# ethoslayer_escrow

A real on-chain Solana program (Anchor/Rust) replacing the previous
custodial-vault escrow model: funds are now held in a vault owned by a
program-derived address (PDA), and only this program's own rules — not any
backend-held private key — can move them.

## What it does

- **`initialize_config`** — one-time setup. Sets the arbiter authority (in
  production, this should be EthosLayer's own backend signer — the same
  authority that runs the AI-scored dispute process, so an off-chain
  dispute verdict can actually be enacted on-chain).
- **`initialize_escrow`** — buyer creates an escrow and deposits tokens into
  a vault owned by that escrow's own PDA, in one instruction.
- **`raise_dispute`** — buyer or seller flags a disagreement. Once disputed,
  only the arbiter can resolve it — neither party can act unilaterally.
- **`release`** — pays the seller. Callable by the buyer (confirming,
  only while not disputed) or the arbiter (resolving a dispute).
- **`refund`** — returns funds to the buyer. Callable by the seller
  (voluntary), the arbiter (resolving a dispute), or by the buyer
  themself once the escrow's `expiry` has passed with no dispute ever
  raised.
- Resolved escrows (`Released`/`Refunded`) are **not** deleted — the record
  persists on-chain, since EthosLayer's trust scoring reads back completed
  escrow history. Only the vault (the token-holding account) closes, and
  its rent returns to the buyer who paid it.

See `programs/ethoslayer_escrow/src/lib.rs` — every instruction and account
constraint has an inline comment explaining the reasoning, not just the
mechanics.

## What's verified, and what isn't (read this before trusting this blindly)

This was written in a sandboxed environment with **no access to a current
Rust/Anchor toolchain or any Solana RPC endpoint** — `rustc`/`cargo` here
are 2+ years old (apt's packaged 1.75), old enough that a full `cargo
check` against current `anchor-lang`/`solana-program` releases hits a wall
of transitive dependencies that have since moved to Rust's `edition2024`,
which this old cargo can't even parse. That's a dependency-ecosystem
version gap, not a reflection of anything in this program's own code.

So: **this has not been compiled against the real Solana BPF/SBF target,
and has not been deployed or tested against any validator.** It was
written carefully, following standard, well-established Anchor patterns
throughout (PDA seeds, CPI signer seeds, account constraints), and was
manually re-reviewed line by line specifically for logic/security issues
— that pass is what caught and fixed a real bug (an early version let
whoever called `release`/`refund` redirect funds to any destination
account they chose, not necessarily the actual seller/buyer). But manual
review is not a substitute for the compiler and a real devnet test run.

**Before trusting this with real funds — even on devnet — you need to:**

1. Build it for real, with a current toolchain (the `avm`/`anchor`
   installer manages this correctly; apt's old Rust has nothing to do with
   what you'll use):
   ```
   sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
   cargo install --git https://github.com/coral-xyz/anchor avm --locked
   avm install latest && avm use latest
   cd anchor
   anchor build
   anchor keys sync        # writes the real generated program ID into lib.rs and Anchor.toml
   anchor build             # rebuild once with the synced ID
   ```
2. Write and run real tests (`anchor test`) covering at least: fund →
   release; fund → refund by seller; fund → dispute → arbiter release;
   fund → dispute → arbiter refund; buyer refund after expiry; and the
   negative cases (wrong signer, wrong destination account, double
   release). None of this exists yet — there's no `tests/` directory here.
3. Only then: `anchor deploy --provider.cluster devnet` (needs a funded
   devnet keypair — `solana airdrop 2` on devnet).

## Wiring it into the app

Once deployed, set `VITE_ESCROW_PROGRAM_ID` (in `.env`, alongside the other
`VITE_SOLANA_*` vars) to the real program ID from step 1 above. The app's
client code (`src/lib/escrowProgram.ts`) builds instructions directly
against this program's account layout — no IDL file or `@coral-xyz/anchor`
client dependency, so there's nothing else to regenerate or keep in sync
after a deploy.

`src/lib/escrow.ts` already calls through to it for the default
(non-milestone) escrow flow — see `createEscrow`/`releaseEscrow`/
`refundEscrow`/`raiseDisputeOnChain` there. **Milestone-based escrows still
use the old custodial-vault path** — this program only supports a single
full release/refund of the vault, not partial per-milestone payouts, so
that's a real remaining gap, not an oversight.

Also run the new Supabase migration
(`supabase/migrations/20261006180000_add_onchain_escrow_columns.sql`) —
it adds the `escrow_pda`/`escrow_nonce`/`onchain` columns the client code
now writes and reads.

## Honest summary of what's left before this is production-ready

- [ ] Real `anchor build` + `anchor keys sync` (replace the placeholder program ID)
- [ ] A test suite, run against a local validator or devnet
- [ ] Deploy to devnet, then update `VITE_ESCROW_PROGRAM_ID`
- [ ] Run the new Supabase migration
- [ ] Call `initialize_config` once after deploy, with your backend's
      arbiter pubkey — nothing will work until this exists
- [ ] Wire the dispute/refund UI buttons (in `EscrowDetail.tsx` /
      `MobileEscrowDetail.tsx`) to call `raiseDisputeOnChain`/`refundEscrow`
      — they currently only touch the old off-chain Supabase bookkeeping
- [ ] Decide what to do about milestone escrows (extend the program, or
      accept they stay custodial for now)
