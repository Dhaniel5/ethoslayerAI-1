-- Marks escrows whose funds live in the on-chain ethos_escrow program (see /anchor and
-- src/lib/escrowOnchain.ts) instead of the custodial vault wallet.
-- Existing rows stay `onchain = false` and keep working exactly as before.
ALTER TABLE public.escrows
  ADD COLUMN IF NOT EXISTS onchain BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS program_id TEXT;
