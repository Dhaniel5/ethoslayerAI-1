
-- Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Policies
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin-visibility policies on existing tables (read-only, cross-user)
CREATE POLICY "Admins can view all escrows"
  ON public.escrows FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all analyses"
  ON public.analysis_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all watchlists"
  ON public.watchlist FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-assign admin role to the seed email on signup
CREATE OR REPLACE FUNCTION public.assign_seed_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'danielgeorge557@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_assign_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.assign_seed_admin();

-- Backfill if user already exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
WHERE email = 'danielgeorge557@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Admin RPC: list users with aggregates (bypasses auth.users RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  escrow_count bigint,
  analysis_count bigint,
  watchlist_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Admin RPC: top analyzed tokens
CREATE OR REPLACE FUNCTION public.admin_top_tokens(_limit int DEFAULT 20)
RETURNS TABLE (
  mint_address text,
  token_symbol text,
  token_name text,
  analysis_count bigint,
  avg_integrity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_top_tokens(int) TO authenticated;

-- Admin RPC: platform metrics
CREATE OR REPLACE FUNCTION public.admin_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_metrics() TO authenticated;
