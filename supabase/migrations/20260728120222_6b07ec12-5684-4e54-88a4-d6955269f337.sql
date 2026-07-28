CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _user_id AND lower(u.email) = 'danielgeorge557@gmail.com'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, escrow_count bigint, analysis_count bigint, watchlist_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    (SELECT count(*) FROM public.escrows e WHERE e.user_id = u.id),
    (SELECT count(*) FROM public.analysis_history a WHERE a.user_id = u.id),
    (SELECT count(*) FROM public.watchlist w WHERE w.user_id = u.id)
  FROM auth.users u
  ORDER BY u.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM auth.users),
    'total_escrows', (SELECT count(*) FROM public.escrows),
    'escrows_released', (SELECT count(*) FROM public.escrows WHERE status = 'released'),
    'escrows_locked', (SELECT count(*) FROM public.escrows WHERE status = 'locked'),
    'escrows_disputed', (SELECT count(*) FROM public.escrows WHERE status = 'disputed'),
    'total_audd_volume', COALESCE((SELECT sum(amount_audd) FROM public.escrows), 0),
    'released_audd_volume', COALESCE((SELECT sum(amount_audd) FROM public.escrows WHERE status = 'released'), 0),
    'total_analyses', (SELECT count(*) FROM public.analysis_history),
    'active_watchlists', (SELECT count(DISTINCT user_id) FROM public.watchlist)
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_top_tokens(_limit integer DEFAULT 20)
 RETURNS TABLE(mint_address text, token_symbol text, token_name text, analysis_count bigint, avg_integrity numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    a.mint_address,
    max(a.token_symbol),
    max(a.token_name),
    count(*)::bigint,
    round(avg(a.integrity_score)::numeric, 1)
  FROM public.analysis_history a
  GROUP BY a.mint_address
  ORDER BY count(*) DESC
  LIMIT _limit;
END;
$function$;

DROP POLICY IF EXISTS "Admins can view all escrows" ON public.escrows;
CREATE POLICY "Admins can view all escrows" ON public.escrows FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all analyses" ON public.analysis_history;
CREATE POLICY "Admins can view all analyses" ON public.analysis_history FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all watchlists" ON public.watchlist;
CREATE POLICY "Admins can view all watchlists" ON public.watchlist FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));