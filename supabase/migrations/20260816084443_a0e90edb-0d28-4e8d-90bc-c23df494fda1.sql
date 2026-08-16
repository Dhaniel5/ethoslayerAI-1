ALTER TYPE public.escrow_status ADD VALUE IF NOT EXISTS 'escalated';

DO $$ BEGIN
  CREATE TYPE public.dispute_status AS ENUM ('open','under_review','negotiating','resolved','cancelled','escalated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.proposal_status AS ENUM ('pending','accepted','rejected','superseded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.escrows ADD COLUMN IF NOT EXISTS payee_user_id uuid;
ALTER TABLE public.escrows ADD COLUMN IF NOT EXISTS pre_dispute_status public.escrow_status;

CREATE SEQUENCE IF NOT EXISTS public.dispute_ref_seq START 1024;

CREATE TABLE IF NOT EXISTS public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE DEFAULT ('EL-' || nextval('public.dispute_ref_seq')::text),
  escrow_id uuid NOT NULL REFERENCES public.escrows(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.escrow_milestones(id) ON DELETE SET NULL,
  opened_by uuid NOT NULL,
  opened_by_role text NOT NULL DEFAULT 'buyer',
  reason text NOT NULL,
  status public.dispute_status NOT NULL DEFAULT 'open',
  resolution jsonb,
  resolution_tx text,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  escalated_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS disputes_one_active_per_escrow
  ON public.disputes(escrow_id) WHERE status IN ('open','under_review','negotiating','escalated');

CREATE TABLE IF NOT EXISTS public.dispute_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  author_id uuid,
  author_role text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispute_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  submitted_by uuid,
  submitted_by_role text NOT NULL,
  kind text NOT NULL,
  file_name text,
  storage_path text,
  link_url text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispute_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL,
  proposed_by_role text NOT NULL,
  kind text NOT NULL,
  amount_buyer numeric NOT NULL DEFAULT 0,
  amount_seller numeric NOT NULL DEFAULT 0,
  note text,
  status public.proposal_status NOT NULL DEFAULT 'pending',
  responded_by uuid,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispute_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid,
  actor_label text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispute_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  dispute_id uuid REFERENCES public.disputes(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.disputes, public.dispute_messages, public.dispute_evidence,
  public.dispute_proposals, public.dispute_events TO authenticated;
GRANT SELECT, UPDATE ON public.dispute_notifications TO authenticated;
GRANT ALL ON public.disputes, public.dispute_messages, public.dispute_evidence,
  public.dispute_proposals, public.dispute_events, public.dispute_notifications TO service_role;
GRANT USAGE ON SEQUENCE public.dispute_ref_seq TO service_role;

CREATE OR REPLACE FUNCTION public.is_escrow_party(_escrow_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.escrows e
    WHERE e.id = _escrow_id
      AND (e.user_id = auth.uid() OR e.payee_user_id = auth.uid())
  )
$$;
REVOKE ALL ON FUNCTION public.is_escrow_party(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_escrow_party(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_dispute_party(_dispute_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.disputes d JOIN public.escrows e ON e.id = d.escrow_id
    WHERE d.id = _dispute_id
      AND (e.user_id = auth.uid() OR e.payee_user_id = auth.uid())
  )
$$;
REVOKE ALL ON FUNCTION public.is_dispute_party(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dispute_party(uuid) TO authenticated;

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties view disputes" ON public.disputes FOR SELECT TO authenticated
  USING (public.is_escrow_party(escrow_id) OR public.is_admin(auth.uid()));
CREATE POLICY "parties view dispute messages" ON public.dispute_messages FOR SELECT TO authenticated
  USING (public.is_dispute_party(dispute_id) OR public.is_admin(auth.uid()));
CREATE POLICY "parties view dispute evidence" ON public.dispute_evidence FOR SELECT TO authenticated
  USING (public.is_dispute_party(dispute_id) OR public.is_admin(auth.uid()));
CREATE POLICY "parties view dispute proposals" ON public.dispute_proposals FOR SELECT TO authenticated
  USING (public.is_dispute_party(dispute_id) OR public.is_admin(auth.uid()));
CREATE POLICY "parties view dispute events" ON public.dispute_events FOR SELECT TO authenticated
  USING (public.is_dispute_party(dispute_id) OR public.is_admin(auth.uid()));
CREATE POLICY "users view own notifications" ON public.dispute_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "users update own notifications" ON public.dispute_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER disputes_set_updated_at BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE POLICY "authenticated upload dispute evidence" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dispute-evidence');
CREATE POLICY "authenticated read dispute evidence" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dispute-evidence');