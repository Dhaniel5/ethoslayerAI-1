-- Remove blanket PUBLIC execute rights on SECURITY DEFINER functions; grant explicitly instead.
REVOKE ALL ON FUNCTION public.get_public_escrow(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payee_accept_escrow(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payee_request_audd(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_top_tokens(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_seed_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;

-- Public escrow invite page (unauthenticated payees) needs exactly these three.
GRANT EXECUTE ON FUNCTION public.get_public_escrow(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payee_accept_escrow(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payee_request_audd(uuid) TO anon, authenticated;

-- Role checks are evaluated inside RLS policies by the calling role.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- Admin RPCs stay signed-in only and self-check admin role internally.
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_top_tokens(integer) TO authenticated;

-- Trigger-only functions must never be callable from the API.
GRANT ALL ON FUNCTION public.assign_seed_admin() TO service_role;
GRANT ALL ON FUNCTION public.handle_new_user_profile() TO service_role;