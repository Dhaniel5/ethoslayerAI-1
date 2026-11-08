# EthosLayer escrow program (`ethos_escrow`)

On-chain escrow for SPL tokens on Solana. Funds sit in a token account owned by
a per-escrow PDA; only this program, enforcing the rules below, can move them.
No server key or developer key can.

## Status — be precise about what is and isn't verified

| Item | Status |
| --- | --- |
| Previous version (payer-chosen arbiter) | Built as v3, deployed to **devnet** (`7NFckZbA213ERShSMQKw8Qoi1hExBQ8FJMYGQWf2jc1w`), 44 tests reported passing against it; on-chain bytes matched the built file (SHA-256). |
| **This version** (protocol-wide arbiter) | Program **parses** (`rustfmt`); TypeScript tests/scripts **type-check**. **Not compiled, not deployed, its 49 tests not run.** Rebuild -> upgrade -> test is required before trusting it. |
| Independent security review | **Not done.** The code and tests were written by the same author. |
| App integration | **Not done.** `src/lib/escrow.ts` still uses the custodial vault. |
| Mainnet | **Not deployed. Do not use with real funds yet.** |

## What the original program had wrong
Would not compile: a 31-byte `declare_id!`; missing `init-if-needed` and
`idl-build` cargo features; a borrow-checker conflict. Fund loss: the receiver,
vault and payer token accounts were never validated (a caller could redirect a
payout to themselves); the payer chose the arbiter (could be themselves); the
arbiter could force-release an undisputed escrow. Accounting: `resolve_dispute`
always recorded `Released`, there was no `refunded` tracking, unchecked sums, no
milestone cap, no refund path or deadline. All addressed in `lib.rs`.

## Design

### State machine
```
Locked ──► Released   everything paid to receiver
Locked ──► Refunded   everything returned to payer
Locked ──► Disputed ──► Released | Refunded | Resolved
```
`Resolved` = mixed outcome. The final state is derived from what was actually
transferred (`released` / `refunded` counters).

### Instructions
| Instruction | Who | Effect |
| --- | --- | --- |
| `initialize_config(arbiter)` | program **upgrade authority** only | one-time: creates the `Config`, sets admin = caller |
| `set_arbiter(new)` | admin | changes the protocol-wide arbiter (also the key-loss recovery path) |
| `set_admin(new)` | admin | hands the admin role over (e.g. to a multisig). **Irreversible if the address is wrong.** |
| `lock_funds` | payer | creates the escrow and transfers `amount` into the vault, atomically |
| `approve_milestone(i)` | payer | pays milestone `i` to the receiver |
| `release` | payer | pays all remaining funds (escrows without milestones) |
| `refund` | receiver (any time while `Locked`) **or** payer after `expiry` | returns remaining funds to payer; never while `Disputed` |
| `raise_dispute` | payer or receiver | freezes ordinary settlement |
| `resolve_dispute(to_receiver)` | the protocol arbiter | pays `to_receiver` to receiver, remainder to payer |

### Authority model
* **One protocol-wide arbiter**, stored in `Config` — not chosen per escrow. Its only
  power is resolving an *open* dispute. It cannot release/refund an undisputed
  escrow, and it can never settle an escrow where it is the payer or receiver.
* **Admin** (in `Config`) can change the arbiter and hand over the admin role. It
  cannot touch escrowed funds.
* Payer, receiver and arbiter must be three different keys (checked at creation, and
  again at resolution in case the arbiter was rotated later).
* **Trust cost, stated plainly:** users must trust whoever controls the arbiter, and
  the admin can swap the arbiter even while a dispute is open. For production put
  *both* roles behind a multisig, with documented key custody.
* `expiry` is enforced by a transaction reading the on-chain clock; nothing happens
  automatically at the deadline, and a deadline never releases disputed funds.

### PDAs
escrow `["escrow", payer, escrow_id]` · vault authority `["vault", escrow]` (vault =
its ATA) · config `["config"]`.

### Tokens
Legacy SPL Token program only (`Account<Mint>` rejects Token-2022 mints). Not
AUDD-specific. Token-2022 features (transfer fees, hooks) are unsupported and untested.

### Deferred on purpose
Protocol fees (design: bounded `fee_bps` in `Config`, explicit recipient, floor
rounding, tests for every payout path), closing accounts (records kept; vault ATAs
stay open), Token-2022. Max 24 milestones. Tokens sent directly to a vault outside
`lock_funds` are not tracked and cannot be recovered.

## Toolchain (what actually worked, and the traps)
| Component | Version |
| --- | --- |
| Solana (Agave) CLI + `cargo build-sbf` | **4.3.0** (platform-tools v1.57) |
| Anchor CLI / `anchor-lang` / `anchor-spl` | 0.32.2 (CLI used only for the IDL) |
| TS client | `@anchor-lang/core` 0.32.2 |
| Host Rust | modern stable via rustup (needed for `anchor idl build` and `cargo metadata`) |
| Node | 22; run Mocha with `NODE_OPTIONS=--no-experimental-strip-types` |

Traps we hit:
1. **Solana's compiler is old.** platform-tools v1.57 ships a Rust **1.84** compiler. It
   cannot read edition-2024 crates or build crates needing Rust >= 1.85, so the
   dependency tree must be pinned back: run `python3 scripts/pin_deps.py`, then commit
   `Cargo.lock`.
2. **Do not use `anchor build` for the program.** It appeared to switch the active
   Solana install back to 2.3.0 and build with the old tools, giving a file labelled
   v3 that the 4.3.0 CLI rejected. Use `scripts/build_v3.sh`, and check
   `solana --version` is 4.3.0 before deploying (the link can revert, even in a new
   terminal window).
3. The 4.3.0 build tools are a 531 MB download that does not resume. On a flaky
   connection fetch the archive with `curl -C -` (see Solana's platform-tools release
   v1.57) and unpack it into `~/.cache/solana/v1.57/platform-tools`.
4. **sBPF versions:** on 2026-11 the "v3 programs allowed" feature
   (`5cC3foj77CWun58pC51ebHFUWavHWKarWyR5UUik7dnC`) was ACTIVE on devnet, testnet and
   mainnet, and the feature that makes validators reject v0 (SIMD-0500,
   `B8JJXCy5amZyWG9r7EnUYLwzXSXTxG7GZ1qZ1qggo83g`) was inactive on all three. Anza says
   SIMD-0500 is planned for Agave 4.4. Re-check before any deployment; always ship v3.
5. A CPU without AVX2 (e.g. a 2012 laptop) cannot run `solana-test-validator`, so
   tests here run against **devnet** (`FUND_FROM_WALLET` funds test accounts from the
   wallet instead of the rate-limited faucet).

## Build
```bash
python3 scripts/pin_deps.py        # only when Cargo.lock is missing/changed
scripts/build_v3.sh                # Machine: Linux BPF, Flags: 0x3, CPU Version: 3
```
IDL (needed by tests and scripts):
```bash
mkdir -p target/idl target/types
anchor idl build -o target/idl/ethos_escrow.json -t target/types/ethos_escrow.ts
solana --version                   # re-check: must still say 4.3.0
```

## Program ID
`declare_id!` currently holds the **devnet** program ID. A mainnet deployment must
use its **own new program keypair** (`anchor keys sync` after the first build creates
`target/deploy/ethos_escrow-keypair.json`). Back that file up; never commit or paste
it; never overwrite an existing program keypair.

## Deploy / upgrade, then verify
```bash
solana config get                  # confirm the cluster before ANY write
solana program deploy target/deploy/ethos_escrow.so --program-id target/deploy/ethos_escrow-keypair.json
solana program dump <PROGRAM_ID> /tmp/onchain.so
sha256sum target/deploy/ethos_escrow.so
head -c $(stat -c%s target/deploy/ethos_escrow.so) /tmp/onchain.so | sha256sum   # must match
solana program show --buffers      # must list nothing
```
Upgrading a deployed program requires ~2+ SOL temporarily (returned afterwards).
If an upload fails partway, do not blindly re-run: reclaim the buffer first.

## One-time setup after (re)deploying: the Config
Nothing works until the Config exists. As the **upgrade authority** wallet:
```bash
export NODE_OPTIONS=--no-experimental-strip-types ANCHOR_PROVIDER_URL=<rpc> ANCHOR_WALLET=<upgrade authority keypair>
CONFIRM=yes npx ts-node scripts/init_config.ts init <ARBITER_PUBKEY>
npx ts-node scripts/init_config.ts show
```
Use a *real* arbiter key (ideally a multisig). The test suite overwrites the arbiter
with a throwaway key on whatever deployment it runs against, so re-set the real one
afterwards with `set-arbiter`.

## Test (devnet)
```bash
export NODE_OPTIONS=--no-experimental-strip-types
export ANCHOR_PROVIDER_URL=<devnet rpc> ANCHOR_WALLET=~/.config/solana/id.json FUND_FROM_WALLET=0.01
npx ts-mocha -p ./tsconfig.json -t 1000000 --exit tests/ethos_escrow.ts
```
~10 minutes; each run spends a little devnet SOL. Occasional `Blockhash not found` /
`fetch failed` are network flakes: re-run just those tests with `-g "<name>"`. The
wallet must be the program's upgrade authority (it becomes the Config admin).

## Frontend integration (not done)
Interface notes: escrow PDA `["escrow", payer, escrow_id]`; `lock_funds(escrow_id,
amount, expiry, milestone_amounts)` takes the `config` account and no arbiter; the
receiver's token account must exist before settlement (create the ATA in the same
transaction); new env var for the program ID. Migrate `src/lib/escrow.ts` only after
this version is built, tested and deployed. Never put private keys in the frontend.

## Before any mainnet release
1. Rebuild, upgrade devnet, and get all 49 tests passing against *this* version.
2. Independent security review.
3. Separate mainnet program keypair; upgrade authority and admin/arbiter behind a multisig.
4. Confirm the production mint is a legacy SPL Token mint (owner `Tokenkeg…`).
5. Mainnet RPC key stored in hosting settings, not committed (the devnet key in the
   public repo should be treated as exposed).
6. Re-verify the sBPF/feature status, and deploy v3.
7. Launch with strict per-escrow amount limits until the review is done.
