ALTER TABLE public.escrows
  ADD COLUMN IF NOT EXISTS token_mint text,
  ADD COLUMN IF NOT EXISTS token_label text,
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb,
  ADD COLUMN IF NOT EXISTS payee_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payee_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS payee_wallet text,
  ADD COLUMN IF NOT EXISTS payee_requested_audd boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_public_escrow(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE e public.escrows%ROWTYPE; ms jsonb;
BEGIN
  SELECT * INTO e FROM public.escrows WHERE id = _id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id, 'title', m.title, 'amount_audd', m.amount_audd,
    'position', m.position, 'approved', m.approved
  ) ORDER BY m.position), '[]'::jsonb)
  INTO ms FROM public.escrow_milestones m WHERE m.escrow_id = _id;

  RETURN jsonb_build_object(
    'id', e.id,
    'description', e.description,
    'payer_wallet', e.payer_wallet,
    'receiver_wallet', e.receiver_wallet,
    'amount_audd', e.amount_audd,
    'token_mint', e.token_mint,
    'token_label', e.token_label,
    'ai_analysis', e.ai_analysis,
    'condition_type', e.condition_type,
    'status', e.status,
    'trust_score', e.trust_score,
    'trust_level', e.trust_level,
    'expires_at', e.expires_at,
    'created_at', e.created_at,
    'payee_accepted', e.payee_accepted,
    'payee_wallet', e.payee_wallet,
    'payee_requested_audd', e.payee_requested_audd,
    'milestones', ms
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.payee_accept_escrow(_id uuid, _wallet text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.escrows
     SET payee_accepted = true, payee_accepted_at = now(), payee_wallet = _wallet, updated_at = now()
   WHERE id = _id AND payee_accepted = false;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.escrow_events (escrow_id, event_type, note)
  VALUES (_id, 'note', 'Payee accepted escrow with wallet ' || _wallet);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.payee_request_audd(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.escrows SET payee_requested_audd = true, updated_at = now() WHERE id = _id;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.escrow_events (escrow_id, event_type, note)
  VALUES (_id, 'note', 'Payee requested AUDD as the settlement token');
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_escrow(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payee_accept_escrow(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payee_request_audd(uuid) TO anon, authenticated;