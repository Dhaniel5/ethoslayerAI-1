# EthosLayer escrow program (`ethos_escrow`)

On-chain escrow for SPL tokens on Solana. Funds sit in a token account owned by
a per-escrow PDA; only this program, enforcing the rules below, can move them.
No server key or developer key can.

## Status — read this first

| Area | Status |
| --- | --- |
| Program logic (audited + rewritten) | **Implemented**, parses as valid Rust (`rustfmt`) |
| Compiles against Anchor / SBF | **NOT VERIFIED** — no Anchor/Solana toolchain was available where this was written |
| Test suite (44 tests) | **Written, type-checks, NOT EXECUTED** |
| Devnet deployment | **Not done** |
| Frontend integration | **Not done** (deliberately — the interface isn't stable until it builds) |
| Mainnet | **Do not deploy.** See "Before mainnet". |

Nothing here has been proven by a build or a test run yet. The first
`anchor build` and `anchor test` are the real verification; treat any failure
as a finding, not a nuisance.

## What the original program had wrong (audit of `programs/ethos_escrow`)

*Would not compile:*
1. `declare_id!("EthosEscrow111…")` decodes to **31 bytes**, not 32.
2. `init_if_needed` used without the `init-if-needed` cargo feature.
3. No `idl-build` feature (required by Anchor ≥ 0.30 to generate the IDL).
4. `approve_milestone` held `&mut ctx.accounts.escrow` across a call that
   re-borrows `ctx` (borrow-checker error).
5. `Anchor.toml` lived inside the program dir with no workspace around it.

*Fund-loss / security:*
6. **Receiver token account was never validated.** Whoever called
   `approve_milestone`/`release` could pass *their own* token account and take
   the funds. Same for both destinations in `resolve_dispute`.
7. `vault_ata` mint/authority was never checked on settlement.
8. The payer chose the arbiter freely — including themselves — and could then
   resolve a dispute in their own favour.
9. The arbiter could force-release an **undisputed** escrow (arbitrary admin power).
10. No refund path and no deadline: if the arbiter key was lost, funds were
    stuck forever.

*Accounting / correctness:*
11. `resolve_dispute` always recorded `Released` and set `released = amount`,
    even when everything was refunded.
12. No `refunded` tracking, so partial release + refund could not be accounted.
13. Unchecked `.sum()`; `.unwrap()` on arithmetic; no milestone-count limit
    (space was fixed for 24; more would fail at serialization); zero-value
    milestones allowed; payer == receiver allowed.
14. Plain `Transfer` (no mint/decimals check); escrow PDA seeds omitted the payer
    (any user could squat another's `escrow_id`).

All of the above are addressed in `programs/ethos_escrow/src/lib.rs`.

## Design

### State machine
```
Locked ──► Released   everything paid to receiver
Locked ──► Refunded   everything returned to payer
Locked ──► Disputed ──► Released | Refunded | Resolved
```
`Resolved` = a mixed outcome. The final state is derived from what was actually
transferred (`released`/`refunded` counters), never assumed. `Created` and
`Cancelled` were dropped: creation and funding are one atomic instruction, and
a cancellation is just a `Refunded` outcome. `Active` was not needed.

### Instructions
| Instruction | Who | Effect |
| --- | --- | --- |
| `lock_funds` | payer | creates the escrow and transfers `amount` into the vault, atomically |
| `approve_milestone(i)` | payer | pays milestone `i` to the receiver |
| `release` | payer | pays all remaining funds (escrows without milestones) |
| `refund` | receiver (any time while `Locked`) **or** payer after `expiry` | returns remaining funds to payer; never while `Disputed` |
| `raise_dispute` | payer or receiver | freezes ordinary settlement |
| `resolve_dispute(to_receiver)` | arbiter only | pays `to_receiver` to receiver, remainder to payer |

### Authority model
* Payer, receiver and arbiter must be **three different keys**.
* The arbiter's only power is resolving an *open* dispute. It cannot release or
  refund an undisputed escrow.
* `expiry` is enforced by a transaction reading the on-chain clock. **Nothing
  happens automatically at the deadline**, and a deadline never releases
  disputed funds.
* Destination token accounts must belong to the intended party and the escrow's mint.

### PDAs
* escrow: `["escrow", payer, escrow_id(16 bytes)]`
* vault authority: `["vault", escrow]`; the vault is its ATA for the mint.

### Supported tokens
Legacy SPL Token program only (`Account<Mint>` rejects Token-2022 mints).
Any legacy mint works; nothing is AUDD-specific. Token-2022 (transfer fees,
hooks, etc.) is **not supported and untested** — add it separately if wanted.

### Decisions you should consciously own
1. **Who picks the arbiter.** v1: the payer, at creation (with the distinctness
   rules above). The receiver has to trust that choice. Stronger options:
   (a) a protocol-wide arbiter set in a Config PDA, (b) require the receiver to
   co-sign creation, (c) an arbiter multisig. (a) is the smallest change.
2. **Fees: deferred.** Safer without them for v1. To add later: a `Config` PDA
   with `fee_bps` (hard-capped, e.g. ≤ 100), a fee-recipient token account, fee
   deducted from each payout to the receiver with floor rounding, and a
   timelocked/multisig-controlled admin. Tests needed for release, milestone
   and dispute paths.
3. **Closing accounts: deferred.** The escrow record is kept (history, and it
   avoids any rent-recovery edge cases). Vault ATAs stay open (~0.002 SOL each).
4. **Milestone approval is payer-only**, by design.

## Toolchain

| Component | Version |
| --- | --- |
| Anchor CLI / `anchor-lang` / `anchor-spl` | 0.32.2 |
| Solana (Agave) CLI | **2.3.0** — the version Anchor 0.32.0's own release notes recommend |
| Host Rust (used for the IDL build) | **>= 1.89** (`rustup update`) — an Anchor 0.32 requirement |
| TS client | `@anchor-lang/core` 0.32.2 |

### Why Anchor 0.32.2 (and not 0.30.1 or 1.x)
* 0.30.1 depends on old Solana crates and its CLI fails to install on newer Rust.
  (There is no `anchor-lang` 0.30.2 on crates.io.)
* 0.32.2 is the last 0.x line, pairs with Solana 2.3.0, and needs only small
  changes from the 0.30-style code this was written in.
* Anchor 1.x (current: 1.2.1) is a reasonable alternative and probably the better
  *long-term* target. Changes that would affect this program: `CpiContext::new`
  takes the program ID instead of an AccountInfo (2 call sites); `#[instruction(..)]`
  arguments are validated against the handler (this program lists only a prefix of
  `lock_funds`'s args — unverified whether that is still accepted); `anchor build`
  errors on a program-ID/keypair mismatch (use `--ignore-keys` for the first build);
  `anchor test` defaults to Surfpool (`--validator legacy` for the old validator);
  Solana CLI 3.x+/4.x. Do not use 1.0.0 specifically — use the latest 1.x.
* Nothing in this README has been confirmed by a real build yet.

### sBPF versions: two stages
Solana is moving to require **sBPFv3** for new deployments/upgrades (SIMD-0500, feature
`B8JJXCy5amZyWG9r7EnUYLwzXSXTxG7GZ1qZ1qggo83g`). Per a third-party source
(Chainstack's migration guide, not Solana's own docs — re-verify): it is expected on
mainnet around Agave 4.4 in November 2026; it was inactive on mainnet when that guide
was written; sBPFv3 deployment itself is already enabled on mainnet.

* **Stage 1 — now (local tests, devnet): Solana 2.3.0 + plain `anchor build`.** This
  produces an sBPFv0 binary. The 2.3.0 test validator predates SIMD-0500, so
  `anchor test` works. Whether *devnet* still accepts v0 must be checked (below).
* **Stage 2 — before mainnet: upgrade to Agave >= 4.3.0 and rebuild as v3.** On
  Anchor 0.32.2: `anchor build --no-idl -- --arch v3`, then build the IDL separately
  (`anchor idl build -o target/idl/ethos_escrow.json`). Verify with
  `readelf -h target/deploy/ethos_escrow.so | grep Flags` (want `0x3`). Agave 2.3.0
  cannot produce a v3 build.

### Install (Ubuntu / WSL)
```bash
avm install 0.32.2 && avm use 0.32.2
anchor --version      # anchor-cli 0.32.2
solana --version      # 2.3.x
rustc --version       # need >= 1.89; if lower: rustup update
cd anchor && npm install
```

### Build
```bash
anchor build
```
If it fails with ``feature `edition2024` is required``, a transitive dependency has
moved to a Rust edition the Solana build tools cannot parse. Report the exact error;
fixes are pinning that dependency or building with newer platform-tools
(`cargo build-sbf --tools-version <newer> --install-only`).

### Program ID
The ID in `lib.rs`/`Anchor.toml` is a **placeholder**. After the first build creates
`target/deploy/ethos_escrow-keypair.json`:
```bash
anchor keys sync      # rewrites declare_id! and Anchor.toml to match the keypair
anchor build          # rebuild so the binary embeds the real ID
```
Back up `target/deploy/ethos_escrow-keypair.json` somewhere safe; never commit or paste
it; never overwrite an existing program keypair.

### Test (local validator)
```bash
anchor test
```
Starts a local validator, deploys the program, and runs `tests/ethos_escrow.ts`.

### Devnet
First check whether devnet already requires sBPFv3 (this decides whether a v0 build
would be rejected):
```bash
solana feature status B8JJXCy5amZyWG9r7EnUYLwzXSXTxG7GZ1qZ1qggo83g --url devnet
```
* `inactive` -> a Stage 1 (v0) build can be deployed.
* `active`   -> do Stage 2 first (Agave >= 4.3.0, v3 build).

Then, only after `anchor test` passes:
```bash
solana config set --url devnet
solana balance        # need roughly 3-5 devnet SOL
solana program deploy target/deploy/ethos_escrow.so \
  --program-id target/deploy/ethos_escrow-keypair.json --url devnet
```
A rejected deployment leaves a buffer account holding rent; reclaim it with
`solana program show --buffers` and `solana program close --buffers`.

## Frontend integration (not done)
The program's interface differs from what the app expects today:
* escrow PDA: `["escrow", payer, escrow_id]`; arbiter and `expiry` are new required inputs;
  `lock_funds(escrow_id, amount, expiry, milestone_amounts)`.
* The receiver's token account must exist before settlement (create the ATA in the same tx).
* `src/lib/escrow.ts` still uses the **custodial vault**. Migrate it only after the
  program builds, passes tests, and is deployed; then use the generated IDL.
* Needs a new env var for the program ID (e.g. `VITE_ESCROW_PROGRAM_ID`).

## Known limitations
* Single arbiter, chosen by the payer (see decisions above). Lost arbiter key ⇒
  disputed funds are stuck (an undisputed escrow can still be released, or refunded
  by the receiver / by the payer after expiry).
* No fees, no Token-2022, no account closing, no events, no pause/upgrade policy.
* Max 24 milestones.
* Tokens sent straight to a vault outside `lock_funds` (e.g. a donation) are not
  tracked by the escrow's accounting and cannot be recovered by the program.
* Not externally audited.

## Before any mainnet release
1. A green `anchor test` on a validator **and** a devnet end-to-end run.
2. Independent security review of the program.
3. Decide the arbiter model (protocol Config PDA / multisig) and key custody.
4. Decide the upgrade-authority plan (multisig, then timelock or freeze).
5. Re-verify the sBPFv3 deployment requirement and toolchain against Solana's own docs.
6. Test with the real production mint(s); decide on fees.
