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

Why not Anchor 0.30.1 (what the original pinned)? Verified findings:
* `anchor-lang` 0.30.1 depends on old Solana crates and builds the old
  sBPFv0 format. Current validators are moving to **require sBPFv3** (SIMD-0500:
  `solana-test-validator` 4.3 already enforces it; mainnet is expected around
  Agave 4.4, Nov 2026 per Chainstack's migration guide — a third-party source;
  confirm against Solana's own announcements).
* Anchor CLI 0.30.1 also fails to *install* on Rust ≥ 1.80 (`time` crate).
* **0.31.2 and 0.32.2 (released 2026-09-14) are the 0.x lines with sBPFv3
  support.** I chose 0.32.2: the smallest jump with that support. (There is no
  `anchor-lang` 0.30.2 on crates.io, despite what some docs say.)
* Anchor 1.x is current but has bigger breaking changes (TS package moved to
  `@anchor-lang/core`, `anchor test` uses Surfpool, Solana CLI 3.x+). Not used
  here; revisit once 0.32.2 builds and passes.

| Component | Version this targets |
| --- | --- |
| Anchor CLI / `anchor-lang` / `anchor-spl` | 0.32.2 |
| TS client | `@anchor-lang/core` 0.32.2 |
| Solana (Agave) CLI | 4.3.x |
| Rust | stable via rustup (`cargo build-sbf` needs rustup's cargo) |

### Install (Ubuntu / WSL)
```bash
cargo install --git https://github.com/solana-foundation/anchor avm --force   # you have this
avm install 0.32.2
avm use 0.32.2
anchor --version        # expect: anchor-cli 0.32.2
solana --version        # expect Agave 4.3.x; if older: sh -c "$(curl -sSfL https://release.anza.xyz/v4.3.0/install)"
cd anchor && npm install
```

### Build
Anchor 0.32.2's `anchor build` still emits sBPFv0, so build v3 explicitly, in two steps:
```bash
anchor build --no-idl -- --arch v3
mkdir -p target/idl target/types
anchor idl build -o target/idl/ethos_escrow.json -t target/types/ethos_escrow.ts
readelf -h target/deploy/ethos_escrow.so | grep Flags     # want 0x3
```
If the IDL step errors on proc-macro issues, retry with `RUSTUP_TOOLCHAIN=stable`.

### Program ID
The ID in `lib.rs`/`Anchor.toml` is a **placeholder**. After the first build created
`target/deploy/ethos_escrow-keypair.json`:
```bash
anchor keys sync          # rewrites declare_id! and Anchor.toml to match the keypair
anchor build --no-idl -- --arch v3   # rebuild so the binary embeds the real ID
```
Back up `target/deploy/ethos_escrow-keypair.json` somewhere safe and never commit
or paste it. Do not overwrite an existing program keypair.

### Test (local validator)
```bash
anchor test --skip-build
```
`--skip-build` keeps your v3 binary. If the local validator rejects a v0 build
(`Detected sbpf_version required by the executable which are not enabled`), you
built v0 — rebuild with `--arch v3` as above.

### Devnet
First check whether devnet enforces SIMD-0500 (decides whether a v0 build would be rejected):
```bash
solana feature status B8JJXCy5amZyWG9r7EnUYLwzXSXTxG7GZ1qZ1qggo83g --url devnet
```
Build v3 regardless (it works either way). Then, only after `anchor test` passes:
```bash
solana config set --url devnet
solana balance                      # need ~3-5 devnet SOL for a program this size
solana program deploy target/deploy/ethos_escrow.so \
  --program-id target/deploy/ethos_escrow-keypair.json --url devnet
```

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
