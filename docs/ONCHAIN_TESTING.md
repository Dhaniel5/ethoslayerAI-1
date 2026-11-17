# Testing escrow mode A (custodial) and mode B (on-chain) on a phone

**Honest status.** Written and verified here: the app builds, the real type-check is clean, the client's
unit tests pass (7), and every screen compiles. **Not verified anywhere yet:** any on-chain call made *from
the app*, signing these transactions with the wallet on a phone, the arbiter console, and the database
migration. The first phone test is the real test; expect to find bugs.

## The two modes

| | **A: custodial (today's flow)** | **B: on-chain escrow** |
|---|---|---|
| Switch | `VITE_ONCHAIN_ESCROW` unset or `false` | `VITE_ONCHAIN_ESCROW=true` |
| Funds held by | a vault wallet whose key sits on the server | the escrow program (PDA vault) |
| Disputes | negotiated in-app, server pays out | frozen on-chain; the protocol **arbiter** pays out |

The switch is read **when the app is built**, and only decides how **new** escrows are created. An escrow
keeps working in the mode it was created in, so A and B escrows can coexist.

## One-time setup for B (devnet)

1. **Program side done** (see `anchor/README.md`): the arbiter version is built, upgraded on devnet, its 49
   tests pass, and `bash scripts/build_v3.sh`'s file is what is on-chain.
2. **Prove the app client matches the compiled program** (from `anchor/`, after `anchor idl build`):
   ```bash
   npm install            # at the repo root too: the check imports the app's modules
   export NODE_OPTIONS=--no-experimental-strip-types ANCHOR_WALLET=~/.config/solana/id.json
   npx ts-node scripts/verify_client.ts
   ```
   Every line must say `ok`. A `FAIL` means the app client and the program disagree: stop and tell Claude.
3. **Three different wallets** (the program refuses overlaps): *payer*, *receiver*, *arbiter*. Create three
   Phantom accounts. Fund each with a little devnet SOL. The payer also needs devnet AUDD (however you
   have been getting it for the custodial tests).
4. **Set the arbiter** to your arbiter wallet's public address (the test suite had set a throwaway key).
   As the upgrade-authority wallet, from `anchor/`:
   ```bash
   CONFIRM=yes npx ts-node scripts/init_config.ts set-arbiter <ARBITER_WALLET_ADDRESS>
   npx ts-node scripts/init_config.ts show
   ```
5. **Apply the database migration** `supabase/migrations/20261109000000_onchain_escrow_flag.sql` to your
   Supabase project (SQL editor, or however Lovable applies migrations). Without it, creating a B escrow
   locks the funds on-chain but cannot save the escrow in the app, and the error will say so.

## Build the app for A or for B

In `C:\Users\DANIEL\ethoslayerAI-1`:
```
git pull
npm install
```
- **For B:** `echo VITE_ONCHAIN_ESCROW=true>.env.local` (no space before the `>`).
- **For A:** delete `.env.local`, or put `VITE_ONCHAIN_ESCROW=false` in it.
```
npm run build
npx cap sync android
npx cap open android
```
Uninstall the old app from the phone, then Run. Rebuild whenever you switch modes.

## Test script for B

Use the **payer** wallet unless stated. Note anything unexpected, with a screenshot.

| # | Do this | Expect |
|---|---|---|
| B1 | Create an escrow (no milestones) for the receiver's address | Wallet asks to sign; escrow appears; detail screen shows an **On-chain escrow** card, state **Locked**, amounts correct |
| B2 | On that card: **Release to receiver** | Signs; state becomes **Released**; receiver's AUDD balance rises |
| B3 | Create an escrow **with 2 milestones**; approve milestone 1 | Only that slice is paid; state stays **Locked**; "Still held" drops |
| B4 | Approve milestone 2 | State becomes **Released** |
| B5 | New escrow; switch to the **receiver** wallet; **Refund the payer** | Funds return to the payer; state **Refunded** |
| B6 | New escrow, as payer: **Refund me** | Button disabled until the expiry date shown (the program refuses earlier) |
| B7 | New escrow; **Raise a dispute** | Funds freeze; card says "Frozen"; no release/refund buttons; a dispute room opens |
| B8 | Connect the **arbiter** wallet; open **Arbiter console** (`/arbiter`); paste the escrow account address (copy it from the card); split e.g. 50/50 | State becomes **Resolved (split)**; both wallets receive their shares |
| B9 | Connect a wallet that is neither payer nor receiver and open the escrow | No action buttons; says it is not a party |
| B10 | Try creating an escrow whose receiver is the **arbiter** address | Clear error: the three wallets must differ |

## Test script for A (regression, flag off)
Sign in; connect wallet; create an escrow; release it; open and settle a dispute through the dispute room.
It should behave exactly as before. (A broken A means my changes damaged the existing flow, so report it.)

## Known limitations (read before trusting results)
- **The chain is the source of truth.** The app's own `status` column is updated best-effort. Actions by the
  arbiter happen on a screen with no database access, so lists may lag until the payer opens the escrow.
- **Dispute-room agreements don't auto-execute on-chain.** The parties can agree in-app, but the arbiter
  must still carry out the split in the console. The dispute room shows the escrow address to hand over.
- "Withdraw dispute" is hidden for on-chain escrows: the program has no way to un-freeze one.
- One protocol arbiter, set by the admin: users must trust that key. Put it behind a multisig for production.
- AUDD only; Token-2022 mints are rejected by the program.
- Not independently audited. **Devnet only; do not use real funds.**
