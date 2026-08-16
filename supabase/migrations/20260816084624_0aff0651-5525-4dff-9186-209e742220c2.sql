-- role helper
CREATE OR REPLACE FUNCTION public.dispute_role(_escrow public.escrows)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() = _escrow.user_id THEN 'buyer'
    WHEN auth.uid() = _escrow.payee_user_id THEN 'seller'
    ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.dispute_role(public.escrows) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispute_role(public.escrows) TO authenticated;

CREATE OR REPLACE FUNCTION public.dispute_notify(_dispute_id uuid, _user_id uuid, _type text, _title text, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.dispute_notifications (user_id, dispute_id, type, title, body)
  VALUES (_user_id, _dispute_id, _type, _title, _body);
END; $$;
REVOKE ALL ON FUNCTION public.dispute_notify(uuid, uuid, text, text, text) FROM PUBLIC;

-- OPEN
CREATE OR REPLACE FUNCTION public.dispute_open(_escrow_id uuid, _reason text, _milestone_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.escrows%ROWTYPE; r text; d_id uuid; other uuid;
BEGIN
  SELECT * INTO e FROM public.escrows WHERE id = _escrow_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escrow not found'; END IF;
  r := public.dispute_role(e);
  IF r IS NULL THEN RAISE EXCEPTION 'You are not a party to this escrow'; END IF;
  IF e.status IN ('released','cancelled','expired') THEN
    RAISE EXCEPTION 'This escrow is already settled and cannot be disputed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.disputes d WHERE d.escrow_id = _escrow_id
             AND d.status IN ('open','under_review','negotiating','escalated')) THEN
    RAISE EXCEPTION 'An active dispute already exists for this escrow';
  END IF;
  IF coalesce(trim(_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required to open a dispute'; END IF;

  INSERT INTO public.disputes (escrow_id, milestone_id, opened_by, opened_by_role, reason, status)
  VALUES (_escrow_id, _milestone_id, auth.uid(), r, trim(_reason), 'open')
  RETURNING id INTO d_id;

  UPDATE public.escrows
     SET pre_dispute_status = CASE WHEN status = 'disputed' THEN pre_dispute_status ELSE status END,
         status = 'disputed', disputed_at = now(), updated_at = now()
   WHERE id = _escrow_id;

  INSERT INTO public.escrow_events (escrow_id, event_type, note)
  VALUES (_escrow_id, 'disputed', trim(_reason));
  INSERT INTO public.dispute_events (dispute_id, event_type, actor_id, actor_label, note)
  VALUES (d_id, 'dispute_opened', auth.uid(), r, trim(_reason));
  INSERT INTO public.dispute_messages (dispute_id, author_id, author_role, body)
  VALUES (d_id, NULL, 'system', 'Dispute opened by the ' || r || '.');

  other := CASE WHEN r = 'buyer' THEN e.payee_user_id ELSE e.user_id END;
  PERFORM public.dispute_notify(d_id, other, 'dispute_opened', 'Dispute opened', trim(_reason));
  RETURN d_id;
END; $$;

-- WITHDRAW
CREATE OR REPLACE FUNCTION public.dispute_withdraw(_dispute_id uuid, _note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.disputes%ROWTYPE; e public.escrows%ROWTYPE; r text; other uuid;
BEGIN
  SELECT * INTO d FROM public.disputes WHERE id = _dispute_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;
  SELECT * INTO e FROM public.escrows WHERE id = d.escrow_id FOR UPDATE;
  r := public.dispute_role(e);
  IF r IS NULL THEN RAISE EXCEPTION 'You are not a party to this escrow'; END IF;
  IF d.opened_by <> auth.uid() THEN RAISE EXCEPTION 'Only the party who opened the dispute can withdraw it'; END IF;
  IF d.status IN ('resolved','cancelled') THEN RAISE EXCEPTION 'This dispute is already closed'; END IF;

  UPDATE public.disputes
     SET status = 'cancelled', cancelled_at = now(), last_activity_at = now()
   WHERE id = _dispute_id;

  UPDATE public.escrows
     SET status = COALESCE(pre_dispute_status, 'locked'), pre_dispute_status = NULL,
         disputed_at = NULL, updated_at = now()
   WHERE id = e.id;

  INSERT INTO public.dispute_events (dispute_id, event_type, actor_id, actor_label, note)
  VALUES (_dispute_id, 'dispute_withdrawn', auth.uid(), r, _note);
  INSERT INTO public.dispute_messages (dispute_id, author_id, author_role, body)
  VALUES (_dispute_id, NULL, 'system', 'Dispute withdrawn. The escrow returned to its normal state.');
  INSERT INTO public.escrow_events (escrow_id, event_type, note)
  VALUES (e.id, 'note', 'Dispute ' || d.ref || ' withdrawn — escrow resumed');

  other := CASE WHEN r = 'buyer' THEN e.payee_user_id ELSE e.user_id END;
  PERFORM public.dispute_notify(_dispute_id, other, 'dispute_withdrawn', 'Dispute withdrawn', 'The escrow has returned to its normal state.');
  RETURN true;
END; $$;

-- ESCALATE
CREATE OR REPLACE FUNCTION public.dispute_escalate(_dispute_id uuid, _note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.disputes%ROWTYPE; e public.escrows%ROWTYPE; r text; other uuid;
BEGIN
  SELECT * INTO d FROM public.disputes WHERE id = _dispute_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;
  SELECT * INTO e FROM public.escrows WHERE id = d.escrow_id FOR UPDATE;
  r := public.dispute_role(e);
  IF r IS NULL THEN RAISE EXCEPTION 'You are not a party to this escrow'; END IF;
  IF d.status IN ('resolved','cancelled') THEN RAISE EXCEPTION 'This dispute is already closed'; END IF;
  IF d.status = 'escalated' THEN RETURN true; END IF;

  UPDATE public.disputes SET status = 'escalated', escalated_at = now(), last_activity_at = now()
   WHERE id = _dispute_id;
  UPDATE public.escrows SET status = 'escalated', updated_at = now() WHERE id = e.id;

  INSERT INTO public.dispute_events (dispute_id, event_type, actor_id, actor_label, note)
  VALUES (_dispute_id, 'dispute_escalated', auth.uid(), r, _note);
  INSERT INTO public.dispute_messages (dispute_id, author_id, author_role, body)
  VALUES (_dispute_id, NULL, 'system', 'Dispute escalated for formal review.');

  other := CASE WHEN r = 'buyer' THEN e.payee_user_id ELSE e.user_id END;
  PERFORM public.dispute_notify(_dispute_id, other, 'dispute_escalated', 'Dispute escalated', 'The dispute is now awaiting formal review.');
  RETURN true;
END; $$;

-- MESSAGE
CREATE OR REPLACE FUNCTION public.dispute_send_message(_dispute_id uuid, _body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.disputes%ROWTYPE; e public.escrows%ROWTYPE; r text; m_id uuid; other uuid;
BEGIN
  SELECT * INTO d FROM public.disputes WHERE id = _dispute_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;
  SELECT * INTO e FROM public.escrows WHERE id = d.escrow_id;
  r := public.dispute_role(e);
  IF r IS NULL THEN RAISE EXCEPTION 'You are not a party to this escrow'; END IF;
  IF coalesce(trim(_body), '') = '' THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  IF d.status IN ('resolved','cancelled') THEN RAISE EXCEPTION 'This dispute is closed'; END IF;

  INSERT INTO public.dispute_messages (dispute_id, author_id, author_role, body)
  VALUES (_dispute_id, auth.uid(), r, trim(_body)) RETURNING id INTO m_id;
  UPDATE public.disputes SET last_activity_at = now(),
    status = CASE WHEN status = 'open' THEN 'under_review'::public.dispute_status ELSE status END
   WHERE id = _dispute_id;
  INSERT INTO public.dispute_events (dispute_id, event_type, actor_id, actor_label, note)
  VALUES (_dispute_id, 'message_sent', auth.uid(), r, left(trim(_body), 140));

  other := CASE WHEN r = 'buyer' THEN e.payee_user_id ELSE e.user_id END;
  PERFORM public.dispute_notify(_dispute_id, other, 'message', 'New dispute message', left(trim(_body), 140));
  RETURN m_id;
END; $$;

-- EVIDENCE
CREATE OR REPLACE FUNCTION public.dispute_add_evidence(
  _dispute_id uuid, _kind text, _file_name text DEFAULT NULL,
  _storage_path text DEFAULT NULL, _link_url text DEFAULT NULL, _description text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.disputes%ROWTYPE; e public.escrows%ROWTYPE; r text; ev_id uuid; other uuid;
BEGIN
  SELECT * INTO d FROM public.disputes WHERE id = _dispute_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;
  SELECT * INTO e FROM public.escrows WHERE id = d.escrow_id;
  r := public.dispute_role(e);
  IF r IS NULL THEN RAISE EXCEPTION 'You are not a party to this escrow'; END IF;
  IF d.status IN ('resolved','cancelled') THEN RAISE EXCEPTION 'This dispute is closed'; END IF;
  IF _kind NOT IN ('file','image','document','transaction','link','statement') THEN
    RAISE EXCEPTION 'Unsupported evidence type';
  END IF;

  INSERT INTO public.dispute_evidence (dispute_id, submitted_by, submitted_by_role, kind, file_name, storage_path, link_url, description)
  VALUES (_dispute_id, auth.uid(), r, _kind, _file_name, _storage_path, _link_url, _description)
  RETURNING id INTO ev_id;

  UPDATE public.disputes SET last_activity_at = now(),
    status = CASE WHEN status = 'open' THEN 'under_review'::public.dispute_status ELSE status END
   WHERE id = _dispute_id;
  INSERT INTO public.dispute_events (dispute_id, event_type, actor_id, actor_label, note)
  VALUES (_dispute_id, 'evidence_submitted', auth.uid(), r, COALESCE(_file_name, _link_url, left(COALESCE(_description,''), 140)));
  INSERT INTO public.dispute_messages (dispute_id, author_id, author_role, body)
  VALUES (_dispute_id, NULL, 'system', 'Evidence submitted by the ' || r || '.');

  other := CASE WHEN r = 'buyer' THEN e.payee_user_id ELSE e.user_id END;
  PERFORM public.dispute_notify(_dispute_id, other, 'evidence', 'Evidence submitted', COALESCE(_file_name, _link_url, 'New evidence added to the dispute.'));
  RETURN ev_id;
END; $$;

-- PROPOSE
CREATE OR REPLACE FUNCTION public.dispute_propose_resolution(
  _dispute_id uuid, _kind text, _amount_buyer numeric, _amount_seller numeric, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.disputes%ROWTYPE; e public.escrows%ROWTYPE; r text; p_id uuid; other uuid; total numeric;
BEGIN
  SELECT * INTO d FROM public.disputes WHERE id = _dispute_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;
  SELECT * INTO e FROM public.escrows WHERE id = d.escrow_id;
  r := public.dispute_role(e);
  IF r IS NULL THEN RAISE EXCEPTION 'You are not a party to this escrow'; END IF;
  IF d.status IN ('resolved','cancelled') THEN RAISE EXCEPTION 'This dispute is closed'; END IF;
  IF _kind NOT IN ('release_seller','refund_buyer','split','custom') THEN RAISE EXCEPTION 'Unsupported resolution type'; END IF;

  _amount_buyer := COALESCE(_amount_buyer, 0);
  _amount_seller := COALESCE(_amount_seller, 0);
  IF _amount_buyer < 0 OR _amount_seller < 0 THEN RAISE EXCEPTION 'Amounts cannot be negative'; END IF;
  total := _amount_buyer + _amount_seller;
  IF round(total, 6) <> round(e.amount_audd, 6) THEN
    RAISE EXCEPTION 'Split must add up to the escrow amount (%).', e.amount_audd;
  END IF;

  UPDATE public.dispute_proposals SET status = 'superseded'
   WHERE dispute_id = _dispute_id AND status = 'pending';

  INSERT INTO public.dispute_proposals (dispute_id, proposed_by, proposed_by_role, kind, amount_buyer, amount_seller, note)
  VALUES (_dispute_id, auth.uid(), r, _kind, _amount_buyer, _amount_seller, _note)
  RETURNING id INTO p_id;

  UPDATE public.disputes SET status = 'negotiating', last_activity_at = now() WHERE id = _dispute_id;

  INSERT INTO public.dispute_events (dispute_id, event_type, actor_id, actor_label, note)
  VALUES (_dispute_id, 'resolution_proposed', auth.uid(), r,
          'Buyer ' || _amount_buyer || ' / Seller ' || _amount_seller);
  INSERT INTO public.dispute_messages (dispute_id, author_id, author_role, body)
  VALUES (_dispute_id, NULL, 'system', 'Resolution proposal submitted by the ' || r || '.');

  other := CASE WHEN r = 'buyer' THEN e.payee_user_id ELSE e.user_id END;
  PERFORM public.dispute_notify(_dispute_id, other, 'proposal', 'Resolution proposed',
    'Buyer receives ' || _amount_buyer || ', seller receives ' || _amount_seller || '.');
  RETURN p_id;
END; $$;

-- RESPOND
CREATE OR REPLACE FUNCTION public.dispute_respond_proposal(_proposal_id uuid, _action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.dispute_proposals%ROWTYPE; d public.disputes%ROWTYPE; e public.escrows%ROWTYPE; r text; other uuid; solo boolean;
BEGIN
  SELECT * INTO p FROM public.dispute_proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'This proposal has already been answered'; END IF;
  SELECT * INTO d FROM public.disputes WHERE id = p.dispute_id FOR UPDATE;
  SELECT * INTO e FROM public.escrows WHERE id = d.escrow_id FOR UPDATE;
  r := public.dispute_role(e);
  IF r IS NULL THEN RAISE EXCEPTION 'You are not a party to this escrow'; END IF;
  IF d.status IN ('resolved','cancelled') THEN RAISE EXCEPTION 'This dispute is closed'; END IF;
  IF _action NOT IN ('accept','reject') THEN RAISE EXCEPTION 'Unsupported action'; END IF;

  -- only the counterparty may answer, unless there is no registered counterparty
  solo := (e.payee_user_id IS NULL);
  IF NOT solo AND p.proposed_by = auth.uid() THEN
    RAISE EXCEPTION 'The other party must respond to your proposal';
  END IF;

  IF _action = 'reject' THEN
    UPDATE public.dispute_proposals SET status = 'rejected', responded_by = auth.uid(), responded_at = now()
     WHERE id = _proposal_id;
    UPDATE public.disputes SET last_activity_at = now() WHERE id = d.id;
    INSERT INTO public.dispute_events (dispute_id, event_type, actor_id, actor_label, note)
    VALUES (d.id, 'resolution_rejected', auth.uid(), r, NULL);
    INSERT INTO public.dispute_messages (dispute_id, author_id, author_role, body)
    VALUES (d.id, NULL, 'system', 'Resolution proposal rejected. Parties may counter-propose.');
    other := CASE WHEN r = 'buyer' THEN e.payee_user_id ELSE e.user_id END;
    PERFORM public.dispute_notify(d.id, other, 'proposal_rejected', 'Resolution rejected', 'You can counter-propose a new split.');
    RETURN true;
  END IF;

  UPDATE public.dispute_proposals SET status = 'accepted', responded_by = auth.uid(), responded_at = now()
   WHERE id = _proposal_id;
  UPDATE public.disputes
     SET status = 'resolved', resolved_at = now(), last_activity_at = now(),
         resolution = jsonb_build_object(
           'kind', p.kind, 'amount_buyer', p.amount_buyer, 'amount_seller', p.amount_seller,
           'note', p.note, 'proposal_id', p.id, 'solo', solo)
   WHERE id = d.id;
  UPDATE public.escrows SET status = 'in_review', pre_dispute_status = NULL, updated_at = now() WHERE id = e.id;

  INSERT INTO public.dispute_events (dispute_id, event_type, actor_id, actor_label, note)
  VALUES (d.id, 'resolution_accepted', auth.uid(), r,
          'Buyer ' || p.amount_buyer || ' / Seller ' || p.amount_seller);
  INSERT INTO public.dispute_messages (dispute_id, author_id, author_role, body)
  VALUES (d.id, NULL, 'system', 'Resolution accepted. Settlement is now pending execution.');
  INSERT INTO public.escrow_events (escrow_id, event_type, note)
  VALUES (e.id, 'note', 'Dispute ' || d.ref || ' resolved — buyer ' || p.amount_buyer || ' / seller ' || p.amount_seller);

  other := CASE WHEN r = 'buyer' THEN e.payee_user_id ELSE e.user_id END;
  PERFORM public.dispute_notify(d.id, other, 'proposal_accepted', 'Resolution accepted', 'The dispute has been resolved.');
  RETURN true;
END; $$;

-- notifications read
CREATE OR REPLACE FUNCTION public.dispute_notifications_mark_read(_ids uuid[] DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.dispute_notifications SET read_at = now()
   WHERE user_id = auth.uid() AND read_at IS NULL
     AND (_ids IS NULL OR id = ANY(_ids));
  RETURN true;
END; $$;

-- link accepting payee to their account
CREATE OR REPLACE FUNCTION public.payee_accept_escrow(_id uuid, _wallet text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.escrows%ROWTYPE;
BEGIN
  _wallet := trim(COALESCE(_wallet, ''));
  IF _wallet = '' OR length(_wallet) < 32 OR length(_wallet) > 44 THEN
    RAISE EXCEPTION 'A valid Solana wallet address is required to accept this escrow';
  END IF;

  SELECT * INTO e FROM public.escrows WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escrow not found'; END IF;
  IF e.payee_accepted THEN RAISE EXCEPTION 'This escrow has already been accepted'; END IF;
  IF e.status NOT IN ('pending', 'locked') THEN RAISE EXCEPTION 'This escrow is no longer open for acceptance'; END IF;
  IF e.expires_at IS NOT NULL AND e.expires_at < now() THEN RAISE EXCEPTION 'This escrow has expired'; END IF;
  IF _wallet = e.payer_wallet THEN RAISE EXCEPTION 'The payer wallet cannot accept its own escrow'; END IF;
  IF e.receiver_wallet IS NOT NULL AND _wallet <> e.receiver_wallet THEN
    RAISE EXCEPTION 'Connect the receiver wallet specified by the payer to accept this escrow';
  END IF;

  UPDATE public.escrows
     SET payee_accepted = true, payee_accepted_at = now(), payee_wallet = _wallet,
         payee_user_id = COALESCE(payee_user_id, CASE WHEN auth.uid() <> e.user_id THEN auth.uid() ELSE NULL END),
         updated_at = now()
   WHERE id = _id AND payee_accepted = false;

  IF NOT FOUND THEN RAISE EXCEPTION 'This escrow has already been accepted'; END IF;

  INSERT INTO public.escrow_events (escrow_id, event_type, note)
  VALUES (_id, 'note', 'Payee accepted escrow with wallet ' || _wallet);
  RETURN true;
END; $$;

-- grants: authenticated parties only
REVOKE ALL ON FUNCTION public.dispute_open(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispute_withdraw(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispute_escalate(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispute_send_message(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispute_add_evidence(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispute_propose_resolution(uuid, text, numeric, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispute_respond_proposal(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispute_notifications_mark_read(uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.dispute_open(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_withdraw(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_escalate(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_send_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_add_evidence(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_propose_resolution(uuid, text, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_respond_proposal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_notifications_mark_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payee_accept_escrow(uuid, text) TO anon, authenticated;