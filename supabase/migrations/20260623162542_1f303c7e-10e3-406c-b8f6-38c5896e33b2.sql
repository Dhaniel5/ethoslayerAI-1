
-- Restrict UPDATE on analysis_history to owners
CREATE POLICY "Users update own analysis_history"
ON public.analysis_history
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Revoke anon SELECT from user-scoped tables (they should not be discoverable pre-auth)
REVOKE SELECT ON public.analysis_history FROM anon;
REVOKE SELECT ON public.escrow_events FROM anon;
REVOKE SELECT ON public.escrow_milestones FROM anon;
REVOKE SELECT ON public.escrows FROM anon;
REVOKE SELECT ON public.ethos_preferences FROM anon;
REVOKE SELECT ON public.watchlist FROM anon;

-- Disable GraphQL discovery entirely; the app uses PostgREST, not GraphQL
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;
