
-- Watchlist table
CREATE TABLE public.watchlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mint_address TEXT NOT NULL,
  token_name TEXT,
  token_symbol TEXT,
  integrity_score INTEGER,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, mint_address)
);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own watchlist" ON public.watchlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert into their watchlist" ON public.watchlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their watchlist" ON public.watchlist FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete from their watchlist" ON public.watchlist FOR DELETE USING (auth.uid() = user_id);

-- Ethos preferences table
CREATE TABLE public.ethos_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  preferences JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ethos_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own ethos prefs" ON public.ethos_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their ethos prefs" ON public.ethos_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their ethos prefs" ON public.ethos_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Analysis history table
CREATE TABLE public.analysis_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mint_address TEXT NOT NULL,
  token_name TEXT,
  token_symbol TEXT,
  integrity_score INTEGER,
  governance_score INTEGER,
  manipulation_score INTEGER,
  analysis_data JSONB,
  analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.analysis_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own analysis history" ON public.analysis_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their analysis history" ON public.analysis_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their analysis history" ON public.analysis_history FOR DELETE USING (auth.uid() = user_id);
