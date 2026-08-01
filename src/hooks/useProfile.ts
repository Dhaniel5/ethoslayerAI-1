import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
}

export function useProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", user.id)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    refresh();
  }, [authLoading, refresh]);

  return { profile, loading: loading || authLoading, refresh };
}

export async function saveUsername(userId: string, username: string, displayName?: string) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, username: username.trim().toLowerCase(), display_name: displayName?.trim() || null },
      { onConflict: "id" },
    );
  if (error) {
    if (error.code === "23505") throw new Error("That username is already taken.");
    throw new Error(error.message);
  }
}
