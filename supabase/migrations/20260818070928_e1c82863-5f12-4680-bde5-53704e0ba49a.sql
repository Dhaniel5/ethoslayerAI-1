-- 1. Restrict SECURITY DEFINER function execution
REVOKE EXECUTE ON FUNCTION public.dispute_open(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispute_withdraw(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispute_escalate(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispute_send_message(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispute_add_evidence(uuid, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispute_propose_resolution(uuid, text, numeric, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispute_respond_proposal(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispute_notifications_mark_read(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispute_role(public.escrows) FROM anon, authenticated;

-- internal helpers: not callable from the API at all
REVOKE EXECUTE ON FUNCTION public.dispute_notify(uuid, uuid, text, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_dispute_party(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_escrow_party(uuid) FROM anon;

-- 2. Storage: scope dispute-evidence access to dispute parties
DROP POLICY IF EXISTS "authenticated read dispute evidence" ON storage.objects;
DROP POLICY IF EXISTS "authenticated upload dispute evidence" ON storage.objects;

CREATE POLICY "dispute parties read evidence"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'dispute-evidence'
  AND (
    public.is_admin(auth.uid())
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      AND public.is_dispute_party(((storage.foldername(name))[1])::uuid)
    )
  )
);

CREATE POLICY "dispute parties upload evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'dispute-evidence'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_dispute_party(((storage.foldername(name))[1])::uuid)
);

-- No UPDATE/DELETE policies: evidence is immutable once submitted (fail-closed, explicit)
CREATE POLICY "no one updates dispute evidence"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'dispute-evidence' AND false)
WITH CHECK (bucket_id = 'dispute-evidence' AND false);

CREATE POLICY "no one deletes dispute evidence"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'dispute-evidence' AND false);
