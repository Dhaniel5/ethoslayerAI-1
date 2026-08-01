-- 1. Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- username format validation via trigger
CREATE OR REPLACE FUNCTION public.tg_validate_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    NEW.username := lower(trim(NEW.username));
    IF NEW.username !~ '^[a-z0-9_]{3,24}$' THEN
      RAISE EXCEPTION 'Username must be 3-24 characters, letters, numbers or underscores only';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_validate_username
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_username();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uname text;
BEGIN
  uname := lower(trim(COALESCE(NEW.raw_user_meta_data ->> 'username', '')));
  IF uname = '' OR uname !~ '^[a-z0-9_]{3,24}$'
     OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = uname) THEN
    uname := NULL;
  END IF;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, uname, NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- backfill existing users
INSERT INTO public.profiles (id)
SELECT u.id FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- 2. Harden public escrow acceptance
CREATE OR REPLACE FUNCTION public.payee_accept_escrow(_id uuid, _wallet text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e public.escrows%ROWTYPE;
BEGIN
  _wallet := trim(COALESCE(_wallet, ''));
  IF _wallet = '' OR length(_wallet) < 32 OR length(_wallet) > 44 THEN
    RAISE EXCEPTION 'A valid Solana wallet address is required to accept this escrow';
  END IF;

  SELECT * INTO e FROM public.escrows WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found';
  END IF;

  IF e.payee_accepted THEN
    RAISE EXCEPTION 'This escrow has already been accepted';
  END IF;

  IF e.status NOT IN ('pending', 'locked') THEN
    RAISE EXCEPTION 'This escrow is no longer open for acceptance';
  END IF;

  IF e.expires_at IS NOT NULL AND e.expires_at < now() THEN
    RAISE EXCEPTION 'This escrow has expired';
  END IF;

  IF _wallet = e.payer_wallet THEN
    RAISE EXCEPTION 'The payer wallet cannot accept its own escrow';
  END IF;

  IF e.receiver_wallet IS NOT NULL AND _wallet <> e.receiver_wallet THEN
    RAISE EXCEPTION 'Connect the receiver wallet specified by the payer to accept this escrow';
  END IF;

  UPDATE public.escrows
     SET payee_accepted = true, payee_accepted_at = now(), payee_wallet = _wallet, updated_at = now()
   WHERE id = _id AND payee_accepted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This escrow has already been accepted';
  END IF;

  INSERT INTO public.escrow_events (escrow_id, event_type, note)
  VALUES (_id, 'note', 'Payee accepted escrow with wallet ' || _wallet);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.payee_request_audd(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e public.escrows%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.escrows WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found';
  END IF;
  IF e.status NOT IN ('pending', 'locked') THEN
    RAISE EXCEPTION 'This escrow is no longer open';
  END IF;
  IF e.expires_at IS NOT NULL AND e.expires_at < now() THEN
    RAISE EXCEPTION 'This escrow has expired';
  END IF;
  IF e.payee_requested_audd THEN
    RETURN true;
  END IF;

  UPDATE public.escrows SET payee_requested_audd = true, updated_at = now() WHERE id = _id;
  INSERT INTO public.escrow_events (escrow_id, event_type, note)
  VALUES (_id, 'note', 'Payee requested AUDD as the settlement token');
  RETURN true;
END;
$$;