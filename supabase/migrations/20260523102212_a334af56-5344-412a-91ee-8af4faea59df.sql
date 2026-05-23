CREATE TYPE public.escrow_status AS ENUM ('pending','locked','in_review','released','disputed','expired','cancelled');
CREATE TYPE public.escrow_event_type AS ENUM ('created','locked','milestone_approved','released','disputed','cancelled','expired','note');
CREATE TYPE public.trust_level AS ENUM ('low','medium','high');

CREATE TABLE public.escrows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  payer_wallet TEXT NOT NULL,
  receiver_wallet TEXT NOT NULL,
  amount_audd NUMERIC(20,6) NOT NULL CHECK (amount_audd > 0),
  description TEXT,
  condition_type TEXT NOT NULL DEFAULT 'approval',
  status public.escrow_status NOT NULL DEFAULT 'pending',
  trust_score INT,
  trust_level public.trust_level,
  trust_factors JSONB DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_escrows_user ON public.escrows(user_id, created_at DESC);
ALTER TABLE public.escrows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners view escrows" ON public.escrows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owners insert escrows" ON public.escrows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owners update escrows" ON public.escrows FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "owners delete escrows" ON public.escrows FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.escrow_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL REFERENCES public.escrows(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount_audd NUMERIC(20,6) NOT NULL CHECK (amount_audd >= 0),
  position INT NOT NULL DEFAULT 0,
  approved BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_milestones_escrow ON public.escrow_milestones(escrow_id, position);
ALTER TABLE public.escrow_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners view milestones" ON public.escrow_milestones FOR SELECT
USING (EXISTS (SELECT 1 FROM public.escrows e WHERE e.id = escrow_id AND e.user_id = auth.uid()));
CREATE POLICY "owners insert milestones" ON public.escrow_milestones FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.escrows e WHERE e.id = escrow_id AND e.user_id = auth.uid()));
CREATE POLICY "owners update milestones" ON public.escrow_milestones FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.escrows e WHERE e.id = escrow_id AND e.user_id = auth.uid()));
CREATE POLICY "owners delete milestones" ON public.escrow_milestones FOR DELETE
USING (EXISTS (SELECT 1 FROM public.escrows e WHERE e.id = escrow_id AND e.user_id = auth.uid()));

CREATE TABLE public.escrow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL REFERENCES public.escrows(id) ON DELETE CASCADE,
  event_type public.escrow_event_type NOT NULL,
  amount_audd NUMERIC(20,6),
  tx_signature TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_escrow ON public.escrow_events(escrow_id, created_at DESC);
ALTER TABLE public.escrow_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners view events" ON public.escrow_events FOR SELECT
USING (EXISTS (SELECT 1 FROM public.escrows e WHERE e.id = escrow_id AND e.user_id = auth.uid()));
CREATE POLICY "owners insert events" ON public.escrow_events FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.escrows e WHERE e.id = escrow_id AND e.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_escrows_updated_at
BEFORE UPDATE ON public.escrows
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();