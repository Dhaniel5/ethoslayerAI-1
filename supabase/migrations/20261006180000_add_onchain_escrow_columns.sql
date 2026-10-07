-- Links an off-chain escrow row to its real on-chain account, once escrows
-- are created via the ethoslayer_escrow Anchor program (see /anchor) instead
-- of a direct transfer to a custodial vault wallet.
ALTER TABLE public.escrows
  ADD COLUMN IF NOT EXISTS escrow_pda TEXT,
  ADD COLUMN IF NOT EXISTS escrow_nonce NUMERIC(20,0),
  ADD COLUMN IF NOT EXISTS onchain BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_escrows_pda ON public.escrows(escrow_pda) WHERE escrow_pda IS NOT NULL;
