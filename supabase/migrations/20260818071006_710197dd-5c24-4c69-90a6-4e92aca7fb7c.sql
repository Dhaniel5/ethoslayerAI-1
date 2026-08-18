REVOKE ALL ON public.disputes FROM anon;
REVOKE ALL ON public.dispute_messages FROM anon;
REVOKE ALL ON public.dispute_evidence FROM anon;
REVOKE ALL ON public.dispute_proposals FROM anon;
REVOKE ALL ON public.dispute_events FROM anon;
REVOKE ALL ON public.dispute_notifications FROM anon;

-- direct client writes are not allowed; everything goes through SECURITY DEFINER RPCs
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.disputes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.dispute_messages FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.dispute_evidence FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.dispute_proposals FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.dispute_events FROM authenticated;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES ON public.dispute_notifications FROM authenticated;

GRANT ALL ON public.disputes TO service_role;
GRANT ALL ON public.dispute_messages TO service_role;
GRANT ALL ON public.dispute_evidence TO service_role;
GRANT ALL ON public.dispute_proposals TO service_role;
GRANT ALL ON public.dispute_events TO service_role;
GRANT ALL ON public.dispute_notifications TO service_role;
