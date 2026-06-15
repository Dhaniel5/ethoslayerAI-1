# EthosLayer Escrow — Anchor Program

On-chain AUDD escrow with milestones, dispute resolution, and PDA-controlled vault. Replaces the custodial vault wallet so no human or server holds the keys.

## State machine

```
   lock_funds
Created ─────────► Locked ─────► Released
                    │  │
                    │  └─ approve_milestone (n times) ─► Released (when all milestones approved)
                    │
                    └─ raise_dispute ─► Disputed ─resolve_dispute─► Released
```

## Instructions

| Instruction         | Signer            | Effect                                       |
| ------------------- | ----------------- | -------------------------------------------- |
| `lock_funds`        | payer             | Creates escrow account + transfers AUDD → vault PDA |
| `approve_milestone` | payer or arbiter  | Releases milestone slice to receiver         |
| `release`           | payer or arbiter  | Releases full remaining balance (no milestones) |
| `raise_dispute`     | payer or receiver | Freezes the escrow                           |
| `resolve_dispute`   | arbiter           | Splits remaining funds receiver/payer        |

## PDA seeds

- `escrow`: `[b"escrow", escrow_id]`
- `vault`:  `[b"vault", escrow.key()]` — authority over `vault_ata`

## Prerequisites

```bash
# Rust + Solana + Anchor
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1 && avm use 0.30.1

# Devnet wallet
solana-keygen new -o ~/.config/solana/id.json
solana config set --url devnet
solana airdrop 2
```

## Build & deploy (devnet)

```bash
cd programs/ethos_escrow
anchor build
# Copy the new program id into Anchor.toml and `declare_id!` in src/lib.rs, then:
anchor build
anchor deploy --provider.cluster devnet
```

After deploy, copy the program id and IDL (`target/idl/ethos_escrow.json`) into `src/lib/anchorEscrow.ts` to wire the React app to on-chain instructions instead of the custodial release path.

## Why this exists

The current TypeScript flow (`src/lib/escrow.ts` + `supabase/functions/release-escrow`) custodially holds AUDD in a vault wallet. That's an MVP shortcut. Once this program is deployed:

1. `createEscrow` calls `lock_funds` and stores the on-chain escrow PDA in the Supabase row.
2. `releaseEscrow` / `approveMilestone` call the program directly — no server-held private key.
3. Disputes become arbitrable on-chain by an EthosLayer arbiter key (or future multisig / DAO).
