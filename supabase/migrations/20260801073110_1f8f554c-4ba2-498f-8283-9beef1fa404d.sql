-- 1. Remove all direct table access from anon (public escrow view uses SECURITY DEFINER RPC)
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.escrows FROM anon;
REVOKE ALL ON public.escrow_events FROM anon;
REVOKE ALL ON public.escrow_milestones FROM anon;
REVOKE ALL ON public.watchlist FROM anon;
REVOKE ALL ON public.analysis_history FROM anon;
REVOKE ALL ON public.ethos_preferences FROM anon;

-- 2. Trigger-only functions: not callable by API roles
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_seed_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_validate_username() FROM PUBLIC, anon, authenticated;

-- 3. Admin RPCs: signed-in only (each already enforces is_admin internally)
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_metrics() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_top_tokens(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_top_tokens(integer) TO authenticated;

-- 4. Role helpers: signed-in only
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- 5. Public escrow endpoints stay reachable without an account (intentional)
GRANT EXECUTE ON FUNCTION public.get_public_escrow(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payee_accept_escrow(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payee_request_audd(uuid) TO anon, authenticated;

-- 6. escrow_events is an append-only audit trail; make immutability explicit
CREATE POLICY "no one can update events" ON public.escrow_events FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "no one can delete events" ON public.escrow_events FOR DELETE USING (false);
REVOKE UPDATE, DELETE ON public.escrow_events FROM authenticated;